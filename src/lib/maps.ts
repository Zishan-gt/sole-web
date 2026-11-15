export interface ParsedGoogleMapsResult {
  lat: number | null;
  lng: number | null;
  placeName: string | null;
  resolvedUrl: string;
}

export function extractCoordsFromGoogleMapsUrl(url: string): ParsedGoogleMapsResult {
  const trimmed = url.trim();
  let lat: number | null = null;
  let lng: number | null = null;
  let placeName: string | null = null;

  // Pattern 1: /@lat,lng,zoom
  const atMatch = trimmed.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (atMatch) {
    lat = parseFloat(atMatch[1]);
    lng = parseFloat(atMatch[2]);
  }

  // Pattern 2: !3dLAT!4dLNG
  if (lat === null || lng === null) {
    const bangMatch = trimmed.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
    if (bangMatch) {
      lat = parseFloat(bangMatch[1]);
      lng = parseFloat(bangMatch[2]);
    }
  }

  // Pattern 3: ?q=lat,lng or &query=lat,lng or ?ll=lat,lng
  if (lat === null || lng === null) {
    const qMatch = trimmed.match(/[?&](?:q|query|ll|center)=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
    if (qMatch) {
      lat = parseFloat(qMatch[1]);
      lng = parseFloat(qMatch[2]);
    }
  }

  // Extract place name from /maps/place/<name>/
  const placeMatch = trimmed.match(/\/maps\/place\/([^/@]+)/);
  if (placeMatch) {
    try {
      placeName = decodeURIComponent(placeMatch[1].replace(/\+/g, ' '));
    } catch {
      placeName = placeMatch[1].replace(/\+/g, ' ');
    }
  }

  return { lat, lng, placeName, resolvedUrl: trimmed };
}

export function buildGoogleMapsDirectionsUrl(
  lat: number,
  lng: number,
  googleMapsUrl?: string | null
): string {
  if (googleMapsUrl && googleMapsUrl.trim().startsWith('http')) {
    return googleMapsUrl.trim();
  }
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}
