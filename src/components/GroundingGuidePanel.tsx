import React, { useState } from 'react';
import {
  BadgeCheck,
  ExternalLink,
  Globe,
  Loader2,
  MapPin,
  Search,
  Sparkles,
} from 'lucide-react';
import { useLocation } from '../context/LocationContext';
import { apiFetch } from '../lib/api';
import { SafeImage } from './BusinessCard';
import { Link } from './RouterLink';

interface GroundingResponse {
  query: string;
  locationLabel: string;
  search: {
    text: string;
    webSources: Array<{ title: string; uri: string }>;
  } | null;
  maps: {
    text: string;
    mapPlaces: Array<{ title: string; uri: string; reviewSnippets: string[] }>;
  } | null;
  localStorefronts: Array<{
    id: string;
    name: string;
    slug: string;
    area: string | null;
    city: string | null;
    logoUrl: string | null;
    coverUrl: string | null;
    isVerified: boolean;
    ratingAvg: string;
  }>;
}

const QUICK_PROMPTS = [
  'Best specialty coffee & bakeries',
  'Top salons and spas open today',
  'Popular local markets & organic food',
  'Trusted electronics repair shops',
];

export const GroundingGuidePanel: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { location } = useLocation();
  const [prompt, setPrompt] = useState('');
  const [mode, setMode] = useState<'both' | 'maps' | 'search'>('both');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GroundingResponse | null>(null);
  const [error, setError] = useState('');

  const runDiscover = async (overrideQuery?: string) => {
    const q = (overrideQuery ?? prompt).trim();
    if (q.length < 2) return;
    if (overrideQuery) setPrompt(overrideQuery);
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch<GroundingResponse>('/api/ai/discover', {
        method: 'POST',
        body: JSON.stringify({
          query: q,
          mode,
          locationLabel: location.isGlobal ? 'Patna & Global Cities' : location.label,
          lat: !location.isGlobal ? location.lat : null,
          lng: !location.isGlobal ? location.lng : null,
        }),
      });
      setResult(res);
    } catch (err) {
      setError((err as Error).message || 'Unable to run live discovery right now.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-sm sm:text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span>Live Neighborhood & Maps Guide</span>
          </h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Real-time Google Search & Google Maps Grounding near{' '}
            {location.isGlobal ? 'your selected area' : location.label}
          </p>
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void runDiscover();
        }}
        className="space-y-2.5"
      >
        <div className="flex gap-2">
          <div className="flex-1 flex items-center gap-2 h-10 px-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700">
            <Search className="w-4 h-4 text-slate-400 shrink-0" />
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Ask about cafes, salons, open spots..."
              className="w-full bg-transparent text-xs sm:text-sm focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={loading || prompt.trim().length < 2}
            className="h-10 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold disabled:opacity-50 inline-flex items-center gap-1.5 shrink-0"
          >
            {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            <span>Explore</span>
          </button>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {(
            [
              ['both', 'Search + Maps'],
              ['maps', 'Google Maps'],
              ['search', 'Google Search'],
            ] as const
          ).map(([m, label]) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-colors ${
                mode === m
                  ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-slate-900 dark:border-white'
                  : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </form>

      {!result && !loading && (
        <div className="flex flex-wrap gap-1.5">
          {QUICK_PROMPTS.slice(0, compact ? 3 : 4).map((qp) => (
            <button
              key={qp}
              type="button"
              onClick={() => void runDiscover(qp)}
              className="text-left px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-950/50 text-[11px] font-medium text-slate-700 dark:text-slate-300 transition-colors"
            >
              {qp}
            </button>
          ))}
        </div>
      )}

      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

      {result && (
        <div className="space-y-4 pt-2 border-t border-slate-100 dark:border-slate-800">
          {/* Google Maps Grounded Places */}
          {result.maps && (result.maps.text || result.maps.mapPlaces.length > 0) && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-emerald-600" />
                <span>Google Maps Places</span>
              </p>
              {result.maps.text && (
                <div className="text-xs text-slate-600 dark:text-slate-300 whitespace-pre-line leading-relaxed bg-slate-50 dark:bg-slate-950 p-3 rounded-xl">
                  {result.maps.text}
                </div>
              )}
              {result.maps.mapPlaces.length > 0 && (
                <div className="space-y-2">
                  {result.maps.mapPlaces.map((pl) => (
                    <a
                      key={pl.uri}
                      href={pl.uri}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-blue-500 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2 text-xs font-semibold text-blue-600 dark:text-blue-400">
                        <span className="truncate">{pl.title}</span>
                        <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                      </div>
                      {pl.reviewSnippets.length > 0 && (
                        <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2">
                          “{pl.reviewSnippets[0]}”
                        </p>
                      )}
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Google Search Grounded Insights & Links */}
          {result.search && (result.search.text || result.search.webSources.length > 0) && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-blue-600" />
                <span>Web Search Insights</span>
              </p>
              {result.search.text && (
                <div className="text-xs text-slate-600 dark:text-slate-300 whitespace-pre-line leading-relaxed bg-slate-50 dark:bg-slate-950 p-3 rounded-xl">
                  {result.search.text}
                </div>
              )}
              {result.search.webSources.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {result.search.webSources.slice(0, 5).map((src) => (
                    <a
                      key={src.uri}
                      href={src.uri}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px] text-blue-600 dark:text-blue-400 hover:underline max-w-full"
                    >
                      <span className="truncate max-w-[180px]">{src.title}</span>
                      <ExternalLink className="w-3 h-3 shrink-0" />
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Matching SoleWeb Storefronts */}
          {result.localStorefronts.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-900 dark:text-white">
                On SoleWeb
              </p>
              <div className="grid grid-cols-1 gap-2">
                {result.localStorefronts.slice(0, 3).map((b) => (
                  <Link
                    key={b.id}
                    to={`/b/${b.slug}`}
                    className="flex items-center gap-2.5 p-2 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-blue-500 transition-colors"
                  >
                    <div className="w-9 h-9 rounded-full overflow-hidden shrink-0">
                      <SafeImage
                        src={b.logoUrl || b.coverUrl}
                        alt={b.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1">
                        <span className="text-xs font-semibold truncate">{b.name}</span>
                        {b.isVerified && <BadgeCheck className="w-3.5 h-3.5 text-blue-600 shrink-0" />}
                      </div>
                      <p className="text-[11px] text-slate-500 truncate">
                        {[b.area, b.city].filter(Boolean).join(', ')}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
};
