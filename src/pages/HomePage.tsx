import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, BadgeCheck, MapPin, Search } from 'lucide-react';
import { SafeImage } from '../components/BusinessCard';
import { GroundingGuidePanel } from '../components/GroundingGuidePanel';
import { LocationPicker } from '../components/LocationPicker';
import { Link, navigate } from '../components/RouterLink';
import { SocialPostCard } from '../components/SocialPostCard';
import { StoriesBar } from '../components/StoriesBar';
import { useAuth } from '../context/AuthContext';
import { useLocation } from '../context/LocationContext';
import { useSocial } from '../context/SocialContext';
import { useTheme } from '../context/ThemeContext';
import { getT } from '../i18n/translations';
import { apiFetch } from '../lib/api';
import type { BusinessSummary, CategoryItem } from '../types/app';

interface HomeData {
  categories: CategoryItem[];
  verifiedBusinesses: BusinessSummary[];
  recentBusinesses: BusinessSummary[];
  popularCities: Array<{ city: string; count: number }>;
}

export const HomePage: React.FC = () => {
  const { locale } = useTheme();
  const { profile } = useAuth();
  const { location } = useLocation();
  const { feedPosts, loadingFeed, followedBusinessIds, toggleFollow } = useSocial();
  const t = getT(locale);

  const [query, setQuery] = useState('');
  const [feedTab, setFeedTab] = useState<'for_you' | 'following' | 'nearby'>('for_you');
  const [homeData, setHomeData] = useState<HomeData | null>(null);

  useEffect(() => {
    apiFetch<HomeData>('/api/home')
      .then((res) => setHomeData(res))
      .catch((err) => console.error(err));
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (query.trim()) params.set('q', query.trim());
    if (!location.isGlobal && location.lat !== null && location.lng !== null) {
      params.set('lat', String(location.lat));
      params.set('lng', String(location.lng));
      params.set('radius_km', '15');
    }
    navigate(`/search?${params.toString()}`);
  };

  const displayedPosts = useMemo(() => {
    if (feedTab === 'following') {
      return feedPosts.filter((p) => followedBusinessIds.has(p.businessId));
    }
    if (feedTab === 'nearby') {
      return [...feedPosts].sort(
        (a, b) => (a.distanceKm ?? 99999) - (b.distanceKm ?? 99999)
      );
    }
    return feedPosts;
  }, [feedPosts, feedTab, followedBusinessIds]);

  return (
    <div className="max-w-5xl mx-auto px-3 sm:px-6 py-4 sm:py-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Center Instagram Feed Column */}
        <div className="lg:col-span-7 space-y-4 max-w-[560px] mx-auto w-full">
          {/* Search + Location Quick Bar */}
          <form
            onSubmit={handleSearch}
            className="p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl flex flex-col sm:flex-row gap-2"
          >
            <div className="flex-1 flex items-center gap-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 min-h-[42px]">
              <Search className="w-4 h-4 text-slate-400 shrink-0" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t.home.searchPlaceholder}
                aria-label="Search local businesses"
                className="w-full bg-transparent text-xs sm:text-sm focus:outline-none"
              />
            </div>
            <LocationPicker compact />
            <button
              type="submit"
              className="min-h-[42px] px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors whitespace-nowrap"
            >
              {t.home.searchBtn}
            </button>
          </form>

          {/* Stories Bar */}
          <StoriesBar />

          {/* Feed Filter Tabs */}
          <div className="flex items-center justify-between gap-2 px-1">
            <div className="inline-flex items-center gap-1 p-1 bg-slate-200/70 dark:bg-slate-800 rounded-xl">
              {(
                [
                  ['for_you', 'For You'],
                  ['following', 'Following'],
                  ['nearby', 'Nearby'],
                ] as const
              ).map(([tabKey, label]) => (
                <button
                  key={tabKey}
                  type="button"
                  onClick={() => setFeedTab(tabKey)}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    feedTab === tabKey
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <Link
              to="/search"
              className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1"
            >
              <span>Directory</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {/* Feed Stream */}
          {loadingFeed && displayedPosts.length === 0 ? (
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="h-[520px] rounded-2xl bg-slate-200 dark:bg-slate-800 animate-pulse"
                />
              ))}
            </div>
          ) : displayedPosts.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-10 text-center space-y-3">
              <p className="font-display text-base font-semibold">
                {feedTab === 'following'
                  ? 'You are not following any storefronts yet'
                  : 'No posts available in this view'}
              </p>
              <p className="text-xs text-slate-500">
                Follow verified local shops in For You or Explore to see their daily drops here.
              </p>
              {feedTab === 'following' && (
                <button
                  type="button"
                  onClick={() => setFeedTab('for_you')}
                  className="px-4 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-semibold"
                >
                  Browse For You
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-5">
              {displayedPosts.map((post) => (
                <SocialPostCard key={post.id} post={post} />
              ))}
            </div>
          )}

          {/* Mobile Live Grounding Guide */}
          <div className="lg:hidden pt-2">
            <GroundingGuidePanel compact />
          </div>
        </div>

        {/* Right Discovery Rail (Desktop) */}
        <aside className="hidden lg:block lg:col-span-5 sticky top-6 space-y-5">
          {/* User / Account Card */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex items-center justify-between gap-3">
            {profile ? (
              <>
                <div className="flex items-center gap-3 min-w-0">
                  {profile.avatarUrl ? (
                    <img
                      src={profile.avatarUrl}
                      alt={profile.fullName}
                      className="w-11 h-11 rounded-full object-cover shrink-0"
                    />
                  ) : (
                    <div className="w-11 h-11 rounded-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 flex items-center justify-center font-bold text-sm shrink-0">
                      {(profile.fullName || 'U')[0]}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{profile.fullName}</p>
                    <p className="text-xs text-slate-500 capitalize truncate">
                      {profile.role} · {followedBusinessIds.size} following
                    </p>
                  </div>
                </div>
                <Link
                  to="/dashboard"
                  className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline shrink-0"
                >
                  Studio
                </Link>
              </>
            ) : (
              <>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">Join SoleWeb</p>
                  <p className="text-xs text-slate-500">
                    Sign in with Google to like, comment, follow & manage a storefront.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => navigate('/login')}
                  className="px-3.5 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-semibold shrink-0"
                >
                  Sign in
                </button>
              </>
            )}
          </div>

          {/* Gemini Search & Maps Grounding Live Guide */}
          <GroundingGuidePanel compact />

          {/* Suggested Verified Storefronts */}
          {homeData?.verifiedBusinesses && homeData.verifiedBusinesses.length > 0 && (
            <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                  Suggested Verified Shops
                </h2>
                <Link
                  to="/search?verified=true"
                  className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                >
                  See all
                </Link>
              </div>

              <div className="space-y-3">
                {homeData.verifiedBusinesses.slice(0, 5).map((biz) => {
                  const isFollowing = followedBusinessIds.has(biz.id);
                  return (
                    <div key={biz.id} className="flex items-center justify-between gap-2.5">
                      <Link to={`/b/${biz.slug}`} className="flex items-center gap-2.5 min-w-0">
                        <div className="w-10 h-10 rounded-full overflow-hidden border border-slate-200 dark:border-slate-800 shrink-0">
                          <SafeImage
                            src={biz.logoUrl || biz.coverUrl}
                            alt={biz.name}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1">
                            <span className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                              {biz.name}
                            </span>
                            {biz.isVerified && (
                              <BadgeCheck className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                            )}
                          </div>
                          <p className="text-[11px] text-slate-500 truncate">
                            {[biz.categoryName, biz.city].filter(Boolean).join(' · ')}
                          </p>
                        </div>
                      </Link>
                      <button
                        type="button"
                        onClick={() =>
                          toggleFollow({
                            id: biz.id,
                            slug: biz.slug,
                            name: biz.name,
                            logoUrl: biz.logoUrl,
                          })
                        }
                        className={`text-xs font-semibold px-2.5 py-1 rounded-lg shrink-0 ${
                          isFollowing
                            ? 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                            : 'text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40'
                        }`}
                      >
                        {isFollowing ? 'Following' : 'Follow'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Categories & Popular Cities */}
          {homeData && (
            <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3">
              <h2 className="font-display text-sm font-bold">Browse Categories & Cities</h2>
              <div className="flex flex-wrap gap-1.5">
                {(homeData.categories || []).slice(0, 8).map((cat) => (
                  <Link
                    key={cat.id}
                    to={`/category/${cat.slug}`}
                    className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-[11px] font-medium text-slate-700 dark:text-slate-300 hover:text-blue-600"
                  >
                    {cat.name}
                  </Link>
                ))}
              </div>
              {homeData.popularCities.length > 0 && (
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap gap-2">
                  {homeData.popularCities.slice(0, 6).map((c) => (
                    <Link
                      key={c.city}
                      to={`/city/${encodeURIComponent(c.city)}`}
                      className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-blue-600"
                    >
                      <MapPin className="w-3 h-3" />
                      <span>{c.city}</span>
                    </Link>
                  ))}
                </div>
              )}
            </section>
          )}
        </aside>
      </div>
    </div>
  );
};
