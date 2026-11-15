import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowUpRight,
  BadgeCheck,
  Clock,
  Globe,
  Heart,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Play,
  Search,
  Star,
} from 'lucide-react';
import { SafeImage } from '../components/BusinessCard';
import { GroundingGuidePanel } from '../components/GroundingGuidePanel';
import { LeafletMap } from '../components/LeafletMap';
import { LocationPicker } from '../components/LocationPicker';
import { Link, navigate, usePathname } from '../components/RouterLink';
import { useLocation } from '../context/LocationContext';
import { useSocial } from '../context/SocialContext';
import { useTheme } from '../context/ThemeContext';
import { getT } from '../i18n/translations';
import { apiFetch, trackAnalyticsEvent } from '../lib/api';
import { buildGoogleMapsDirectionsUrl } from '../lib/maps';
import type { BusinessSummary, CategoryItem } from '../types/app';

interface SearchPageProps {
  presetCategory?: string;
  presetCity?: string;
}

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function getTodayHoursText(business: BusinessSummary): string {
  if (!business.hours) return '09:00 – 21:00';
  const key = DAY_KEYS[new Date().getDay()];
  const slot = business.hours[key];
  if (!slot) return '09:00 – 21:00';
  if (slot.closed) return 'Closed today';
  return `${slot.open} – ${slot.close}`;
}

export const SearchPage: React.FC<SearchPageProps> = ({ presetCategory, presetCity }) => {
  const { search } = usePathname();
  const { location } = useLocation();
  const { feedPosts, followedBusinessIds, toggleFollow } = useSocial();
  const { locale } = useTheme();
  const t = getT(locale);

  const initialParams = useMemo(() => new URLSearchParams(search), [search]);
  const [q, setQ] = useState(initialParams.get('q') || '');
  const [category, setCategory] = useState(presetCategory || initialParams.get('category') || '');
  const [cityFilter, setCityFilter] = useState(presetCity || initialParams.get('city') || '');
  const [radiusKm, setRadiusKm] = useState(initialParams.get('radius_km') || '0');
  const [sort, setSort] = useState(initialParams.get('sort') || 'distance');
  const [verifiedOnly, setVerifiedOnly] = useState(initialParams.get('verified') === 'true');
  const [openNow, setOpenNow] = useState(initialParams.get('open_now') === 'true');
  const [hasProducts, setHasProducts] = useState(initialParams.get('has_products') === 'true');
  const [viewMode, setViewMode] = useState<'list' | 'explore' | 'map' | 'guide'>('list');

  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [results, setResults] = useState<BusinessSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const nextQ = initialParams.get('q') || '';
    setQ(nextQ);
    if (initialParams.get('verified') === 'true') setVerifiedOnly(true);
    if (initialParams.get('sort')) setSort(initialParams.get('sort') || 'distance');
  }, [search]);

  useEffect(() => {
    if (presetCategory !== undefined) {
      setCategory(presetCategory);
      setViewMode('list');
    }
    if (presetCity !== undefined) {
      setCityFilter(presetCity);
      setViewMode('list');
    }
  }, [presetCategory, presetCity]);

  useEffect(() => {
    apiFetch<{ categories: CategoryItem[] }>('/api/categories')
      .then((res) => setCategories(res.categories || []))
      .catch(() => {});
  }, []);

  const fetchResults = async (pageNum: number, append = false, overrideQ?: string) => {
    setLoading(true);
    try {
      const activeQ = (overrideQ ?? q).trim();
      const params = new URLSearchParams();
      if (activeQ) params.set('q', activeQ);
      if (category) params.set('category', category);
      if (cityFilter) params.set('city', cityFilter);
      if (!location.isGlobal && location.lat !== null && location.lng !== null) {
        params.set('lat', String(location.lat));
        params.set('lng', String(location.lng));
        if (Number(radiusKm) > 0) params.set('radius_km', radiusKm);
      }
      if (verifiedOnly) params.set('verified', 'true');
      if (openNow) params.set('open_now', 'true');
      if (hasProducts) params.set('has_products', 'true');
      params.set('sort', sort);
      params.set('page', String(pageNum));
      params.set('page_size', '15');

      const res = await apiFetch<{
        businesses: BusinessSummary[];
        total: number;
        hasMore: boolean;
      }>(`/api/search?${params.toString()}`);

      setResults((prev) => (append ? [...prev, ...res.businesses] : res.businesses));
      setTotal(res.total);
      setHasMore(res.hasMore);
      setPage(pageNum);
    } catch (err) {
      console.error('Search error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchResults(1, false);
  }, [
    search,
    category,
    cityFilter,
    radiusKm,
    sort,
    verifiedOnly,
    openNow,
    hasProducts,
    location.lat,
    location.lng,
    location.isGlobal,
  ]);

  const mapCenter: [number, number] =
    !location.isGlobal && location.lat !== null && location.lng !== null
      ? [location.lat, location.lng]
      : results[0]
        ? [results[0].lat, results[0].lng]
        : [25.6093, 85.1376];

  const matchingExplorePosts = useMemo(() => {
    const cleanQ = q.trim().toLowerCase();
    if (!cleanQ) return feedPosts;
    return feedPosts.filter(
      (p) =>
        p.businessName.toLowerCase().includes(cleanQ) ||
        (p.caption || '').toLowerCase().includes(cleanQ) ||
        p.categoryName.toLowerCase().includes(cleanQ) ||
        p.tags.some((tg) => tg.toLowerCase().includes(cleanQ))
    );
  }, [feedPosts, q]);

  return (
    <div className="max-w-3xl mx-auto min-h-screen bg-white dark:bg-slate-900 border-x border-slate-200 dark:border-slate-800">
      {/* Minimal Twitter-Style Sticky Search Header */}
      <div className="sticky top-14 md:top-0 z-20 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
        <div className="px-4 pt-3 pb-2 space-y-2.5">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const nextParams = new URLSearchParams(window.location.search);
              if (q.trim()) nextParams.set('q', q.trim());
              else nextParams.delete('q');
              if (category) nextParams.set('category', category);
              else nextParams.delete('category');
              const qs = nextParams.toString();
              const targetPath = window.location.pathname.startsWith('/category/')
                ? window.location.pathname
                : '/search';
              window.history.replaceState({}, '', qs ? `${targetPath}?${qs}` : targetPath);
              window.dispatchEvent(new PopStateEvent('popstate'));
              void fetchResults(1, false);
            }}
            className="flex flex-col sm:flex-row gap-2"
          >
            <div className="flex-1 flex items-center gap-2.5 bg-slate-100 dark:bg-slate-950 border border-transparent focus-within:border-blue-500 focus-within:bg-white dark:focus-within:bg-slate-900 rounded-full px-4 h-10 transition-colors">
              <Search className="w-4 h-4 text-slate-400 shrink-0" />
              <input
                type="text"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search SoleWeb businesses, dishes, services..."
                className="w-full bg-transparent text-sm focus:outline-none"
              />
            </div>
            <div className="flex items-center gap-2">
              <LocationPicker compact onSelect={() => void fetchResults(1, false)} />
              <button
                type="submit"
                className="h-10 px-4 rounded-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold hover:opacity-90 transition-opacity shrink-0"
              >
                Search
              </button>
            </div>
          </form>

          {/* Compact Filter Strip */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar text-xs">
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              aria-label="Sort results"
              className="h-8 px-2.5 rounded-full border border-slate-200 dark:border-slate-700 bg-transparent font-medium shrink-0"
            >
              <option value="distance" className="dark:bg-slate-900">Nearest first</option>
              <option value="rating" className="dark:bg-slate-900">Top rated</option>
              <option value="newest" className="dark:bg-slate-900">Newest</option>
            </select>

            <select
              value={category}
              onChange={(e) => {
                const nextCat = e.target.value;
                setCategory(nextCat);
                if (presetCategory !== undefined) {
                  navigate(nextCat ? `/category/${encodeURIComponent(nextCat)}` : '/search');
                } else {
                  const nextParams = new URLSearchParams(window.location.search);
                  if (nextCat) nextParams.set('category', nextCat);
                  else nextParams.delete('category');
                  const qs = nextParams.toString();
                  window.history.replaceState(
                    {},
                    '',
                    qs ? `${window.location.pathname}?${qs}` : window.location.pathname
                  );
                  window.dispatchEvent(new PopStateEvent('popstate'));
                }
              }}
              aria-label="Filter by category"
              className="h-8 px-2.5 rounded-full border border-slate-200 dark:border-slate-700 bg-transparent font-medium shrink-0 max-w-[150px]"
            >
              <option value="" className="dark:bg-slate-900">{t.search.allCategories}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.slug} className="dark:bg-slate-900">
                  {c.name}
                </option>
              ))}
            </select>

            <select
              value={radiusKm}
              onChange={(e) => setRadiusKm(e.target.value)}
              aria-label="Filter by radius"
              className="h-8 px-2.5 rounded-full border border-slate-200 dark:border-slate-700 bg-transparent font-medium shrink-0"
            >
              <option value="0" className="dark:bg-slate-900">Any distance</option>
              <option value="1" className="dark:bg-slate-900">Within 1 km</option>
              <option value="3" className="dark:bg-slate-900">Within 3 km</option>
              <option value="5" className="dark:bg-slate-900">Within 5 km</option>
              <option value="10" className="dark:bg-slate-900">Within 10 km</option>
              <option value="25" className="dark:bg-slate-900">Within 25 km</option>
            </select>

            <button
              type="button"
              onClick={() => setOpenNow((v) => !v)}
              className={`h-8 px-3 rounded-full font-medium border transition-colors shrink-0 ${
                openNow
                  ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-slate-900 dark:border-white'
                  : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
              }`}
            >
              {t.search.openNow}
            </button>

            <button
              type="button"
              onClick={() => setVerifiedOnly((v) => !v)}
              className={`h-8 px-3 rounded-full font-medium border transition-colors shrink-0 ${
                verifiedOnly
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
              }`}
            >
              Verified
            </button>

            <button
              type="button"
              onClick={() => setHasProducts((v) => !v)}
              className={`h-8 px-3 rounded-full font-medium border transition-colors shrink-0 ${
                hasProducts
                  ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-slate-900 dark:border-white'
                  : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
              }`}
            >
              Catalogue
            </button>
          </div>
        </div>

        {/* Twitter-Style Underline Tabs */}
        <div className="grid grid-cols-4 text-center text-xs sm:text-sm font-semibold">
          {(
            [
              ['list', `Top Results (${total})`],
              ['explore', 'Media'],
              ['map', 'Map'],
              ['guide', 'Live Guide'],
            ] as const
          ).map(([tabKey, label]) => (
            <button
              key={tabKey}
              type="button"
              onClick={() => setViewMode(tabKey)}
              className={`py-3 relative hover:bg-slate-100/80 dark:hover:bg-slate-800/60 transition-colors ${
                viewMode === tabKey
                  ? 'text-slate-900 dark:text-white'
                  : 'text-slate-500 dark:text-slate-400 font-medium'
              }`}
            >
              <span>{label}</span>
              {viewMode === tabKey && (
                <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-14 h-0.5 rounded-full bg-blue-500" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Location Summary Subheader */}
      <div className="px-4 py-2.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
        <span>
          {presetCity
            ? `Showing businesses in ${decodeURIComponent(presetCity)}`
            : presetCategory
              ? `Category: ${categories.find((c) => c.slug === presetCategory)?.name || presetCategory}`
              : !location.isGlobal
                ? `Sorted nearest first around ${location.label}`
                : 'Showing top storefronts worldwide'}
        </span>
        {(q || category || cityFilter || verifiedOnly || openNow || hasProducts) && (
          <button
            type="button"
            onClick={() => {
              setQ('');
              setCategory('');
              setCityFilter('');
              setRadiusKm('0');
              setVerifiedOnly(false);
              setOpenNow(false);
              setHasProducts(false);
              void fetchResults(1, false, '');
            }}
            className="text-blue-600 dark:text-blue-400 font-medium hover:underline"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Tab Content */}
      {viewMode === 'guide' ? (
        <div className="p-4">
          <GroundingGuidePanel />
        </div>
      ) : viewMode === 'explore' ? (
        <div className="p-2 sm:p-3">
          <div className="grid grid-cols-3 gap-1 sm:gap-2">
            {matchingExplorePosts.map((post) => (
              <Link
                key={post.id}
                to={`/b/${post.businessSlug}`}
                className="group relative aspect-square bg-slate-200 dark:bg-slate-800 rounded-lg overflow-hidden block"
              >
                <SafeImage
                  src={post.mediaType === 'video' ? post.posterUrl || post.businessLogo : post.mediaUrl}
                  alt={post.caption || post.businessName}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
                {post.mediaType === 'video' && (
                  <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center">
                    <Play className="w-3 h-3 fill-current" />
                  </div>
                )}
                <div className="absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white p-2 text-center">
                  <div className="flex items-center gap-3 text-xs font-bold tabular-nums">
                    <span className="inline-flex items-center gap-1">
                      <Heart className="w-3.5 h-3.5 fill-white" />
                      {post.likesCount}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <MessageCircle className="w-3.5 h-3.5 fill-white" />
                      {post.commentsCount}
                    </span>
                  </div>
                  <span className="mt-1 text-[11px] font-medium line-clamp-1">
                    {post.businessName}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      ) : viewMode === 'map' ? (
        <div className="p-4 space-y-4">
          <LeafletMap
            center={mapCenter}
            zoom={12}
            className="h-[460px] w-full rounded-2xl"
            markers={results.map((b) => ({
              id: b.id,
              lat: b.lat,
              lng: b.lng,
              title: b.name,
              subtitle: [b.categoryName, b.area || b.city].filter(Boolean).join(' · '),
              slug: b.slug,
            }))}
            onMarkerSelect={(slug) => navigate(`/b/${slug}`)}
          />
        </div>
      ) : loading && results.length === 0 ? (
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="p-4 flex gap-3 animate-pulse">
              <div className="w-12 h-12 rounded-full bg-slate-200 dark:bg-slate-800 shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-1/3 bg-slate-200 dark:bg-slate-800 rounded" />
                <div className="h-3 w-full bg-slate-200 dark:bg-slate-800 rounded" />
                <div className="h-3 w-2/3 bg-slate-200 dark:bg-slate-800 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : results.length === 0 ? (
        <div className="p-12 text-center">
          <p className="text-base font-semibold text-slate-900 dark:text-white">
            {t.search.noResults}
          </p>
        </div>
      ) : (
        /* Twitter/X Minimal Top-to-Bottom Search Results Feed (Nearest at Top) */
        <div className="divide-y divide-slate-200 dark:divide-slate-800">
          {results.map((biz) => {
            const isFollowing = followedBusinessIds.has(biz.id);
            const ratingVal = Number(biz.ratingAvg || 0);
            const directionsUrl = buildGoogleMapsDirectionsUrl(
              biz.lat,
              biz.lng,
              biz.googleMapsUrl
            );
            const fullAddress = [
              biz.addressLine,
              biz.area,
              biz.city,
              [biz.state, biz.pincode].filter(Boolean).join(' '),
              biz.country,
            ]
              .filter(Boolean)
              .join(', ');

            return (
              <article
                key={biz.id}
                onClick={() => navigate(`/b/${biz.slug}`)}
                className="px-4 py-4 hover:bg-slate-50/80 dark:hover:bg-slate-800/35 transition-colors cursor-pointer flex gap-3.5 items-start"
              >
                {/* Avatar */}
                <Link
                  to={`/b/${biz.slug}`}
                  onClick={(e) => e.stopPropagation()}
                  className="w-12 h-12 rounded-full overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 shrink-0"
                >
                  <SafeImage
                    src={biz.logoUrl || biz.coverUrl}
                    alt={biz.name}
                    className="w-full h-full object-cover"
                  />
                </Link>

                {/* Content Column */}
                <div className="flex-1 min-w-0 space-y-1.5">
                  {/* Top Identity + Distance + Follow Row */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1 flex-wrap">
                        <span className="font-display text-[15px] font-bold text-slate-900 dark:text-white hover:underline truncate">
                          {biz.name}
                        </span>
                        {biz.isVerified && (
                          <BadgeCheck className="w-4 h-4 text-blue-500 shrink-0" />
                        )}
                        <span className="text-xs text-slate-500 dark:text-slate-400 truncate">
                          @{biz.slug}
                        </span>
                        {biz.distanceKm !== null && biz.distanceKm !== undefined && (
                          <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 tabular-nums">
                            · {biz.distanceKm < 1
                              ? `${Math.round(biz.distanceKm * 1000)} m away`
                              : `${biz.distanceKm.toFixed(1)} km away`}
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 flex-wrap mt-0.5">
                        <span className="font-medium text-slate-700 dark:text-slate-300">
                          {biz.categoryName || 'Business'}
                        </span>
                        {biz.subcategory && (
                          <>
                            <span>·</span>
                            <span>{biz.subcategory}</span>
                          </>
                        )}
                        <span>·</span>
                        <span className="inline-flex items-center gap-0.5 tabular-nums text-slate-700 dark:text-slate-300">
                          <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                          {ratingVal > 0 ? ratingVal.toFixed(1) : 'New'}
                          {biz.ratingCount > 0 ? ` (${biz.ratingCount})` : ''}
                        </span>
                        {biz.productsCount !== undefined && biz.productsCount > 0 && (
                          <>
                            <span>·</span>
                            <span className="tabular-nums">{biz.productsCount} items</span>
                          </>
                        )}
                        <span>·</span>
                        <span
                          className={
                            biz.isOpenNow
                              ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                              : 'text-slate-500'
                          }
                        >
                          {biz.isOpenNow ? 'Open now' : 'Closed'}
                        </span>
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void toggleFollow({
                          id: biz.id,
                          slug: biz.slug,
                          name: biz.name,
                          logoUrl: biz.logoUrl,
                        });
                      }}
                      className={`h-8 px-3.5 rounded-full text-xs font-bold transition-colors shrink-0 ${
                        isFollowing
                          ? 'border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 hover:border-red-400 hover:text-red-500'
                          : 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:opacity-90'
                      }`}
                    >
                      {isFollowing ? 'Following' : 'Follow'}
                    </button>
                  </div>

                  {/* Bio / Details */}
                  {biz.bio && (
                    <p className="text-[14px] text-slate-800 dark:text-slate-200 leading-snug">
                      {biz.bio}
                    </p>
                  )}

                  {/* Detailed Address & Operating Hours Block */}
                  <div className="pt-1 space-y-1 text-xs text-slate-600 dark:text-slate-400">
                    {fullAddress && (
                      <p className="flex items-start gap-1.5 leading-snug">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                        <span>{fullAddress}</span>
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                      <span className="inline-flex items-center gap-1 tabular-nums">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        Today: {getTodayHoursText(biz)}
                      </span>
                      {biz.phone && (
                        <span className="inline-flex items-center gap-1 tabular-nums">
                          <Phone className="w-3.5 h-3.5 text-slate-400" />
                          {biz.phone}
                        </span>
                      )}
                      {biz.email && (
                        <span className="inline-flex items-center gap-1 truncate max-w-[200px]">
                          <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          {biz.email}
                        </span>
                      )}
                      {biz.website && (
                        <a
                          href={biz.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline truncate max-w-[180px]"
                        >
                          <Globe className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">
                            {biz.website.replace(/^https?:\/\/(www\.)?/, '')}
                          </span>
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Minimal Twitter-Style Action Strip */}
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="pt-2 flex items-center justify-between max-w-md text-xs text-slate-500 dark:text-slate-400"
                  >
                    {biz.phone && (
                      <a
                        href={`tel:${biz.phone}`}
                        onClick={() => trackAnalyticsEvent(biz.id, 'call_click')}
                        className="inline-flex items-center gap-1.5 py-1 pr-2 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                      >
                        <Phone className="w-3.5 h-3.5" />
                        <span>Call</span>
                      </a>
                    )}

                    <a
                      href={directionsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => trackAnalyticsEvent(biz.id, 'directions_click')}
                      className="inline-flex items-center gap-1.5 py-1 px-2 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
                    >
                      <MapPin className="w-3.5 h-3.5" />
                      <span>Directions</span>
                    </a>

                    {biz.whatsapp && (
                      <a
                        href={`https://wa.me/${biz.whatsapp.replace(/[^0-9]/g, '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => trackAnalyticsEvent(biz.id, 'whatsapp_click')}
                        className="inline-flex items-center gap-1.5 py-1 px-2 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        <span>WhatsApp</span>
                      </a>
                    )}

                    <Link
                      to={`/b/${biz.slug}`}
                      className="inline-flex items-center gap-1 py-1 pl-2 font-medium text-slate-700 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                    >
                      <span>Profile</span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              </article>
            );
          })}

          {hasMore && (
            <div className="p-4 flex justify-center">
              <button
                type="button"
                onClick={() => void fetchResults(page + 1, true)}
                disabled={loading}
                className="px-5 py-2 rounded-full border border-slate-300 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                {loading ? 'Loading...' : 'Show more results'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
