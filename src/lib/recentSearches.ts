export interface RecentSearchEntry {
  query: string;
  updatedAt: number;
}

const STORAGE_KEY = 'soleweb_recent_searches_v1';
const MAX_RECENT_SEARCHES = 8;

function isStorageAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function getRecentSearches(): RecentSearchEntry[] {
  if (!isStorageAvailable()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    const normalized: RecentSearchEntry[] = [];
    for (const item of parsed) {
      let query = '';
      let updatedAt = Date.now();
      if (typeof item === 'string') {
        query = item.trim();
      } else if (item && typeof item === 'object' && 'query' in item) {
        const rec = item as { query?: unknown; updatedAt?: unknown };
        query = typeof rec.query === 'string' ? rec.query.trim() : '';
        updatedAt = typeof rec.updatedAt === 'number' && Number.isFinite(rec.updatedAt) ? rec.updatedAt : Date.now();
      }
      if (!query) continue;
      const key = query.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      normalized.push({ query, updatedAt });
      if (normalized.length >= MAX_RECENT_SEARCHES) break;
    }
    return normalized;
  } catch {
    return [];
  }
}

function saveRecentSearches(entries: RecentSearchEntry[]): void {
  if (!isStorageAvailable()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_RECENT_SEARCHES)));
  } catch {
    // Ignore storage quota or private browsing errors
  }
}

export function addRecentSearch(rawQuery: string): RecentSearchEntry[] {
  const query = rawQuery.trim();
  const existing = getRecentSearches();
  if (!query) return existing;
  const lower = query.toLowerCase();
  const next: RecentSearchEntry[] = [
    { query, updatedAt: Date.now() },
    ...existing.filter((entry) => entry.query.toLowerCase() !== lower),
  ].slice(0, MAX_RECENT_SEARCHES);
  saveRecentSearches(next);
  return next;
}

export function removeRecentSearch(rawQuery: string): RecentSearchEntry[] {
  const lower = rawQuery.trim().toLowerCase();
  const next = getRecentSearches().filter((entry) => entry.query.toLowerCase() !== lower);
  saveRecentSearches(next);
  return next;
}

export function clearRecentSearches(): RecentSearchEntry[] {
  if (isStorageAvailable()) {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore storage errors
    }
  }
  return [];
}
