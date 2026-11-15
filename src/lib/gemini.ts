import { GoogleGenAI } from '@google/genai';

let cachedAi: GoogleGenAI | null = null;

function getAiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  if (!cachedAi) {
    cachedAi = new GoogleGenAI({
      apiKey,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
    });
  }
  return cachedAi;
}

export interface WebGroundingSource {
  title: string;
  uri: string;
}

export interface MapsGroundingPlace {
  title: string;
  uri: string;
  reviewSnippets: string[];
}

export interface SearchGroundingResult {
  text: string;
  webSources: WebGroundingSource[];
}

export interface MapsGroundingResult {
  text: string;
  mapPlaces: MapsGroundingPlace[];
}

export async function discoverWithSearchGrounding(params: {
  query: string;
  locationLabel?: string;
}): Promise<SearchGroundingResult> {
  const ai = getAiClient();
  if (!ai) {
    return {
      text: 'Live Search Grounding requires GEMINI_API_KEY in the server environment.',
      webSources: [],
    };
  }

  const area = params.locationLabel ? ` in ${params.locationLabel}` : '';
  const prompt = `Provide a concise, helpful local discovery guide for "${params.query}"${area}. Highlight notable local trends, popular spots, tips for visitors, and practical details (hours, specialties). Use clear bullet points in Markdown.`;

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: prompt,
    config: {
      tools: [{ googleSearch: {} }],
    },
  });

  const chunks = (response.candidates?.[0]?.groundingMetadata?.groundingChunks || []) as Array<{
    web?: { uri?: string; title?: string };
  }>;

  const webSources: WebGroundingSource[] = [];
  const seen = new Set<string>();
  for (const chunk of chunks) {
    const uri = chunk.web?.uri;
    if (uri && !seen.has(uri)) {
      seen.add(uri);
      webSources.push({
        title: chunk.web?.title || uri,
        uri,
      });
    }
  }

  return {
    text: response.text || '',
    webSources,
  };
}

export async function discoverWithMapsGrounding(params: {
  query: string;
  lat?: number | null;
  lng?: number | null;
  locationLabel?: string;
}): Promise<MapsGroundingResult> {
  const ai = getAiClient();
  if (!ai) {
    return {
      text: 'Live Maps Grounding requires GEMINI_API_KEY in the server environment.',
      mapPlaces: [],
    };
  }

  const area = params.locationLabel ? ` near ${params.locationLabel}` : '';
  const prompt = `Find real, well-reviewed local businesses or places matching "${params.query}"${area}. Summarize what makes each place stand out and include helpful neighborhood context.`;

  const hasCoords =
    typeof params.lat === 'number' &&
    typeof params.lng === 'number' &&
    Number.isFinite(params.lat) &&
    Number.isFinite(params.lng);

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: prompt,
    config: {
      tools: [{ googleMaps: {} }],
      ...(hasCoords
        ? {
            toolConfig: {
              retrievalConfig: {
                latLng: {
                  latitude: params.lat as number,
                  longitude: params.lng as number,
                },
              },
            },
          }
        : {}),
    },
  });

  const chunks = (response.candidates?.[0]?.groundingMetadata?.groundingChunks || []) as Array<{
    maps?: {
      uri?: string;
      title?: string;
      placeAnswerSources?: {
        reviewSnippets?: Array<{ content?: string }>;
      };
    };
  }>;

  const mapPlaces: MapsGroundingPlace[] = [];
  const seen = new Set<string>();
  for (const chunk of chunks) {
    const uri = chunk.maps?.uri;
    if (uri && !seen.has(uri)) {
      seen.add(uri);
      const snippets = (chunk.maps?.placeAnswerSources?.reviewSnippets || [])
        .map((s) => s?.content || '')
        .filter(Boolean)
        .slice(0, 2);
      mapPlaces.push({
        title: chunk.maps?.title || 'View on Google Maps',
        uri,
        reviewSnippets: snippets,
      });
    }
  }

  return {
    text: response.text || '',
    mapPlaces,
  };
}
