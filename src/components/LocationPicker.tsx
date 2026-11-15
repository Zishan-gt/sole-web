import React, { useEffect, useState } from 'react';
import { Globe, LocateFixed, MapPin, X } from 'lucide-react';
import { useLocation } from '../context/LocationContext';
import { useDebounce } from '../hooks/useDebounce';
import { apiFetch } from '../lib/api';

interface Suggestion {
  label: string;
  lat: number;
  lng: number;
  city: string;
  area: string;
}

interface LocationPickerProps {
  onSelect?: () => void;
  compact?: boolean;
}

export const LocationPicker: React.FC<LocationPickerProps> = ({ onSelect, compact = false }) => {
  const { location, setLocation, detectNearMe, detecting } = useLocation();
  const [query, setQuery] = useState(location.isGlobal ? '' : location.label);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [geoError, setGeoError] = useState('');
  const debouncedQuery = useDebounce(query, 350);

  useEffect(() => {
    if (!open || debouncedQuery.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    apiFetch<{ results: Suggestion[] }>(`/api/geocode?q=${encodeURIComponent(debouncedQuery)}`)
      .then((res) => {
        if (!cancelled) setSuggestions(res.results || []);
      })
      .catch(() => {
        if (!cancelled) setSuggestions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, open]);

  const handleNearMe = async () => {
    setGeoError('');
    try {
      const next = await detectNearMe();
      setQuery(next.label);
      setOpen(false);
      onSelect?.();
    } catch (err) {
      setGeoError((err as Error).message || 'Could not detect location');
    }
  };

  return (
    <div className="relative flex-1 min-w-0">
      <div className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 min-h-[46px]">
        <MapPin className="w-4 h-4 text-slate-400 shrink-0" />
        <input
          type="text"
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          placeholder="City, area, or Worldwide"
          aria-label="Choose city or area"
          className="w-full bg-transparent text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none"
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setLocation({ lat: null, lng: null, label: 'Global (All Cities)', city: '', isGlobal: true });
              setOpen(false);
            }}
            aria-label="Clear location to Global"
            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="w-4 h-4" />
          </button>
        )}
        <button
          type="button"
          onClick={handleNearMe}
          disabled={detecting}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/60 transition-colors whitespace-nowrap shrink-0"
        >
          <LocateFixed className="w-3.5 h-3.5" />
          <span>{detecting ? 'Locating...' : compact ? 'Near' : 'Near me'}</span>
        </button>
      </div>

      {geoError && (
        <p className="mt-1 text-xs text-red-600 dark:text-red-400">{geoError}</p>
      )}

      {open && (
        <div className="absolute left-0 right-0 top-full mt-1.5 z-40 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg overflow-hidden">
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setLocation({
                lat: null,
                lng: null,
                label: 'Global (All Cities)',
                city: '',
                isGlobal: true,
              });
              setOpen(false);
              onSelect?.();
            }}
            className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 border-b border-slate-100 dark:border-slate-800"
          >
            <Globe className="w-4 h-4 text-blue-600 shrink-0" />
            <span>Global (Search all cities worldwide)</span>
          </button>

          {suggestions.map((s, idx) => (
            <button
              key={`${s.lat}-${s.lng}-${idx}`}
              type="button"
              onClick={() => {
                const shortLabel = [s.area, s.city].filter(Boolean).join(', ') || s.label.split(',').slice(0, 2).join(',');
                setQuery(shortLabel);
                setLocation({
                  lat: s.lat,
                  lng: s.lng,
                  label: shortLabel,
                  city: s.city,
                  isGlobal: false,
                });
                setOpen(false);
                onSelect?.();
              }}
              className="w-full flex items-start gap-2.5 px-3.5 py-2.5 text-left text-xs hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 border-b border-slate-100 dark:border-slate-800 last:border-none"
            >
              <MapPin className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
              <span className="line-clamp-2">{s.label}</span>
            </button>
          ))}

          <div className="px-3.5 py-2 bg-slate-50 dark:bg-slate-950/50 text-[11px] text-slate-400 flex items-center justify-between">
            <span>Autocomplete by OpenStreetMap Nominatim</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 font-medium"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
