import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  BadgeCheck,
  Bookmark,
  Calendar,
  Edit3,
  Heart,
  MapPin,
  MessageCircle,
  Share2,
  ShieldCheck,
  Star,
  Store,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { SafeImage } from '../components/BusinessCard';
import { Link, navigate } from '../components/RouterLink';
import { useAuth } from '../context/AuthContext';
import { useRealtime } from '../context/RealtimeContext';
import { apiFetch } from '../lib/api';

interface PublicProfileResponse {
  profile: {
    id: string;
    uid: string;
    fullName: string;
    handle: string | null;
    bio: string | null;
    city: string | null;
    avatarUrl: string | null;
    role: 'customer' | 'owner' | 'admin';
    createdAt: string;
  };
  stats: {
    reviewsCount: number;
    followingCount: number;
    favoritesCount: number;
    storefrontsCount: number;
  };
  reviews: Array<{
    id: string;
    rating: number;
    comment: string;
    createdAt: string;
    businessId: string;
    businessName: string;
    businessSlug: string;
    businessLogo: string | null;
    businessCover: string | null;
    businessCity: string | null;
    businessVerified: boolean;
  }>;
  favorites: Array<{
    businessId: string;
    name: string;
    slug: string;
    logoUrl: string | null;
    coverUrl: string | null;
    city: string | null;
    area: string | null;
    isVerified: boolean;
    ratingAvg: string | number;
    ratingCount: number;
    categoryName: string | null;
  }>;
  following: Array<{
    businessId: string;
    businessSlug: string;
    businessName: string;
    businessLogo?: string | null;
  }>;
  storefronts: Array<{
    id: string;
    name: string;
    slug: string;
    logoUrl: string | null;
    coverUrl: string | null;
    city: string | null;
    area: string | null;
    isVerified: boolean;
    ratingAvg: string | number;
    ratingCount: number;
    categoryName: string | null;
  }>;
}

export const CustomerProfilePage: React.FC<{ handle: string }> = ({ handle }) => {
  const { profile: currentUser, refreshProfile } = useAuth();
  const { pushToast } = useRealtime();

  const [data, setData] = useState<PublicProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'reviews' | 'following' | 'saved' | 'storefronts'>('reviews');

  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState({
    fullName: '',
    handle: '',
    bio: '',
    city: '',
  });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    apiFetch<PublicProfileResponse>(`/api/users/${encodeURIComponent(handle)}`)
      .then((res) => {
        if (cancelled) return;
        setData(res);
        setEditForm({
          fullName: res.profile.fullName || '',
          handle: res.profile.handle || '',
          bio: res.profile.bio || '',
          city: res.profile.city || '',
        });
        if (res.reviews.length === 0 && res.following.length > 0) {
          setTab('following');
        } else {
          setTab('reviews');
        }
      })
      .catch((err) => {
        if (!cancelled) setError((err as Error).message || 'Profile not found');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [handle]);

  const handleShare = async () => {
    const shareUrl = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${data?.profile.fullName || 'Member'} on SoleWeb`,
          url: shareUrl,
        });
        return;
      } catch {
        // Fallback to clipboard
      }
    }
    await navigator.clipboard?.writeText(shareUrl);
    pushToast({ title: 'Profile link copied' });
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const cleanedHandle = editForm.handle
        .trim()
        .toLowerCase()
        .replace(/^@/, '')
        .replace(/[^a-z0-9_]/g, '');
      const res = await apiFetch<{ profile: PublicProfileResponse['profile'] }>('/api/me', {
        method: 'PATCH',
        body: JSON.stringify({
          fullName: editForm.fullName.trim(),
          handle: cleanedHandle || undefined,
          bio: editForm.bio.trim(),
          city: editForm.city.trim(),
        }),
      });
      await refreshProfile();
      setEditOpen(false);
      pushToast({ title: 'Profile updated' });

      if (res.profile.handle && res.profile.handle !== data?.profile.handle) {
        navigate(`/u/${res.profile.handle}`);
      } else {
        setData((prev) =>
          prev
            ? {
                ...prev,
                profile: {
                  ...prev.profile,
                  fullName: res.profile.fullName,
                  handle: res.profile.handle,
                  bio: res.profile.bio,
                  city: res.profile.city,
                },
              }
            : prev
        );
      }
    } catch (err) {
      pushToast({ title: (err as Error).message || 'Failed to update profile', variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto min-h-screen bg-white dark:bg-slate-900 border-x border-slate-200 dark:border-slate-800 animate-pulse">
        <div className="h-14 border-b border-slate-200 dark:border-slate-800" />
        <div className="h-36 bg-slate-200 dark:bg-slate-800" />
        <div className="p-4 space-y-3">
          <div className="w-24 h-24 rounded-full bg-slate-300 dark:bg-slate-700 -mt-14 border-4 border-white dark:border-slate-900" />
          <div className="h-6 w-48 rounded bg-slate-200 dark:bg-slate-800" />
          <div className="h-4 w-72 rounded bg-slate-200 dark:bg-slate-800" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-2xl mx-auto min-h-screen bg-white dark:bg-slate-900 border-x border-slate-200 dark:border-slate-800 px-6 py-20 text-center">
        <h1 className="font-display text-2xl font-bold">Profile not found</h1>
        <p className="mt-2 text-sm text-slate-500">{error || 'This SoleWeb member does not exist.'}</p>
        <Link
          to="/search"
          className="inline-block mt-6 px-6 py-2.5 rounded-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-sm font-semibold"
        >
          Explore Storefronts
        </Link>
      </div>
    );
  }

  const { profile, stats, reviews, favorites, following, storefronts } = data;
  const isOwnProfile = Boolean(currentUser && currentUser.uid === profile.uid);
  const joinedLabel = new Date(profile.createdAt).toLocaleDateString(undefined, {
    month: 'short',
    year: 'numeric',
  });

  const tabs: Array<{ key: 'reviews' | 'following' | 'saved' | 'storefronts'; label: string; count: number }> = [
    { key: 'reviews', label: 'Reviews', count: stats.reviewsCount },
    { key: 'following', label: 'Following', count: stats.followingCount },
    { key: 'saved', label: 'Saved Spots', count: stats.favoritesCount },
    ...(storefronts.length > 0
      ? [{ key: 'storefronts' as const, label: 'Storefronts', count: storefronts.length }]
      : []),
  ];

  return (
    <div className="max-w-3xl mx-auto min-h-screen bg-white dark:bg-slate-900 border-x border-slate-200 dark:border-slate-800">
      {/* Sticky Header */}
      <header className="sticky top-14 md:top-0 z-20 h-14 px-3 sm:px-4 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => {
              if (window.history.length > 1) window.history.back();
              else navigate('/');
            }}
            aria-label="Go back"
            className="min-h-[40px] min-w-[40px] rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <h1 className="font-display text-base font-extrabold text-slate-900 dark:text-white truncate">
              {profile.fullName}
            </h1>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
              {stats.reviewsCount} reviews · {stats.followingCount} following
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => void handleShare()}
          aria-label="Share profile"
          className="min-h-[40px] min-w-[40px] rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center shrink-0"
        >
          <Share2 className="w-4 h-4" />
        </button>
      </header>

      {/* Atmospheric Cover Banner */}
      <div className="h-32 sm:h-40 w-full bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 relative overflow-hidden">
        <div className="absolute -right-12 -top-12 w-52 h-52 rounded-full bg-blue-500/20 blur-2xl" />
        <div className="absolute -left-12 -bottom-12 w-52 h-52 rounded-full bg-emerald-500/15 blur-2xl" />
      </div>

      {/* Identity Block */}
      <div className="px-4 pb-4">
        <div className="flex items-end justify-between gap-3 -mt-12 sm:-mt-14 mb-3 relative z-10">
          <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full border-4 border-white dark:border-slate-900 overflow-hidden bg-slate-200 dark:bg-slate-800 shadow-lg shrink-0 flex items-center justify-center">
            {profile.avatarUrl ? (
              <SafeImage
                src={profile.avatarUrl}
                alt={profile.fullName}
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="font-display text-3xl font-extrabold text-slate-700 dark:text-slate-200">
                {(profile.fullName || 'M')[0].toUpperCase()}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 pb-1">
            {isOwnProfile ? (
              <>
                <Link
                  to="/messages"
                  className="min-h-[38px] px-3.5 rounded-full border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold inline-flex items-center gap-1.5"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  <span>Inbox</span>
                </Link>
                <button
                  type="button"
                  onClick={() => setEditOpen(true)}
                  className="min-h-[38px] px-4 rounded-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold inline-flex items-center gap-1.5"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Edit Profile</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => void handleShare()}
                className="min-h-[38px] px-4 rounded-full border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold inline-flex items-center gap-1.5"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>Share</span>
              </button>
            )}
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="font-display text-xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              {profile.fullName}
            </h2>
            {profile.role === 'owner' && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-blue-400">
                <Store className="w-3.5 h-3.5" />
                <span>Storefront Owner</span>
              </span>
            )}
            {profile.role === 'admin' && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Verifier</span>
              </span>
            )}
          </div>

          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 flex items-center gap-2 flex-wrap">
            <span>@{profile.handle || 'member'}</span>
            {profile.city && (
              <>
                <span aria-hidden="true">·</span>
                <span className="inline-flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5" />
                  <span>{profile.city}</span>
                </span>
              </>
            )}
            <span aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              <span>Joined {joinedLabel}</span>
            </span>
          </p>
        </div>

        {profile.bio && (
          <p className="mt-3 text-sm text-slate-800 dark:text-slate-200 leading-relaxed">
            {profile.bio}
          </p>
        )}

        {/* Unboxed Social Metrics */}
        <div className="mt-3.5 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm tabular-nums">
          <button type="button" onClick={() => setTab('reviews')} className="hover:underline">
            <strong className="font-bold text-slate-900 dark:text-white">{stats.reviewsCount}</strong>{' '}
            <span className="text-slate-500 dark:text-slate-400">Reviews</span>
          </button>
          <button type="button" onClick={() => setTab('following')} className="hover:underline">
            <strong className="font-bold text-slate-900 dark:text-white">{stats.followingCount}</strong>{' '}
            <span className="text-slate-500 dark:text-slate-400">Following</span>
          </button>
          <button type="button" onClick={() => setTab('saved')} className="hover:underline">
            <strong className="font-bold text-slate-900 dark:text-white">{stats.favoritesCount}</strong>{' '}
            <span className="text-slate-500 dark:text-slate-400">Saved Spots</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div
        className={`grid border-b border-slate-200 dark:border-slate-800 text-center text-xs sm:text-sm font-semibold sticky top-28 md:top-14 z-10 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md`}
        style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
      >
        {tabs.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            className={`min-h-[44px] py-3 relative hover:bg-slate-100/70 dark:hover:bg-slate-800/50 transition-colors ${
              tab === item.key
                ? 'text-slate-900 dark:text-white font-bold'
                : 'text-slate-500 dark:text-slate-400 font-medium'
            }`}
          >
            <span>{item.label}</span>
            {tab === item.key && (
              <motion.span
                layoutId="customerProfileTabBar"
                className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-0.5 rounded-full bg-blue-500"
              />
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {tab === 'reviews' && (
          reviews.length === 0 ? (
            <div className="p-12 text-center space-y-2">
              <Star className="w-8 h-8 text-slate-300 dark:text-slate-700 mx-auto" />
              <p className="text-sm font-semibold">No reviews written yet</p>
              <p className="text-xs text-slate-500">
                Reviews shared on local storefronts will appear here.
              </p>
            </div>
          ) : (
            reviews.map((rev) => (
              <Link
                key={rev.id}
                to={`/b/${rev.businessSlug}`}
                className="block p-4 hover:bg-slate-50 dark:hover:bg-slate-800/35 transition-colors space-y-2"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-9 h-9 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 shrink-0">
                      <SafeImage
                        src={rev.businessLogo || rev.businessCover}
                        alt={rev.businessName}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-900 dark:text-white truncate flex items-center gap-1">
                        <span>{rev.businessName}</span>
                        {rev.businessVerified && <BadgeCheck className="w-3.5 h-3.5 text-blue-500 shrink-0" />}
                      </p>
                      <p className="text-[11px] text-slate-500 truncate">
                        {rev.businessCity || 'Local'} · {new Date(rev.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    {Array.from({ length: rev.rating }).map((_, idx) => (
                      <Star key={idx} className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                    ))}
                  </div>
                </div>
                <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                  {rev.comment}
                </p>
              </Link>
            ))
          )
        )}

        {tab === 'following' && (
          following.length === 0 ? (
            <div className="p-12 text-center space-y-2">
              <Heart className="w-8 h-8 text-slate-300 dark:text-slate-700 mx-auto" />
              <p className="text-sm font-semibold">Not following any storefronts yet</p>
            </div>
          ) : (
            <div className="p-4 grid sm:grid-cols-2 gap-3">
              {following.map((f) => (
                <Link
                  key={f.businessId}
                  to={`/b/${f.businessSlug}`}
                  className="p-3 rounded-2xl border border-slate-200 dark:border-slate-800 hover:border-blue-500 flex items-center gap-3 transition-colors"
                >
                  <div className="w-11 h-11 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800 shrink-0">
                    <SafeImage
                      src={f.businessLogo}
                      alt={f.businessName}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold truncate text-slate-900 dark:text-white">
                      {f.businessName}
                    </p>
                    <p className="text-xs text-slate-500 truncate">@{f.businessSlug}</p>
                  </div>
                </Link>
              ))}
            </div>
          )
        )}

        {tab === 'saved' && (
          favorites.length === 0 ? (
            <div className="p-12 text-center space-y-2">
              <Bookmark className="w-8 h-8 text-slate-300 dark:text-slate-700 mx-auto" />
              <p className="text-sm font-semibold">No saved storefronts yet</p>
            </div>
          ) : (
            <div className="p-4 grid sm:grid-cols-2 gap-3">
              {favorites.map((fav) => (
                <Link
                  key={fav.businessId}
                  to={`/b/${fav.slug}`}
                  className="p-3 rounded-2xl border border-slate-200 dark:border-slate-800 hover:border-blue-500 flex items-center gap-3 transition-colors"
                >
                  <div className="w-12 h-12 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 shrink-0">
                    <SafeImage
                      src={fav.logoUrl || fav.coverUrl}
                      alt={fav.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold truncate text-slate-900 dark:text-white flex items-center gap-1">
                      <span>{fav.name}</span>
                      {fav.isVerified && <BadgeCheck className="w-3.5 h-3.5 text-blue-500 shrink-0" />}
                    </p>
                    <p className="text-xs text-slate-500 truncate">
                      {fav.categoryName || 'Business'}
                      {fav.city ? ` · ${fav.city}` : ''}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )
        )}

        {tab === 'storefronts' && (
          <div className="p-4 grid sm:grid-cols-2 gap-3">
            {storefronts.map((biz) => (
              <Link
                key={biz.id}
                to={`/b/${biz.slug}`}
                className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 hover:border-blue-500 flex items-center gap-3 transition-colors"
              >
                <div className="w-12 h-12 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 shrink-0">
                  <SafeImage
                    src={biz.logoUrl || biz.coverUrl}
                    alt={biz.name}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold truncate text-slate-900 dark:text-white flex items-center gap-1">
                    <span>{biz.name}</span>
                    {biz.isVerified && <BadgeCheck className="w-3.5 h-3.5 text-blue-500 shrink-0" />}
                  </p>
                  <p className="text-xs text-slate-500 truncate">
                    {biz.categoryName || 'Storefront'}
                    {biz.city ? ` · ${biz.city}` : ''}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Edit Profile Modal (Own Profile Only) */}
      <AnimatePresence>
        {editOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setEditOpen(false)}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
          >
            <motion.form
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              onSubmit={handleSaveProfile}
              className="w-full sm:max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-t-3xl sm:rounded-2xl p-6 space-y-4 shadow-2xl"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-display text-lg font-bold">Edit Profile</h3>
                <button
                  type="button"
                  onClick={() => setEditOpen(false)}
                  aria-label="Close edit profile"
                  className="w-9 h-9 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="font-semibold text-slate-600 dark:text-slate-300 block mb-1">
                    Display Name
                  </label>
                  <input
                    type="text"
                    required
                    minLength={2}
                    maxLength={80}
                    value={editForm.fullName}
                    onChange={(e) => setEditForm({ ...editForm, fullName: e.target.value })}
                    className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-600 dark:text-slate-300 block mb-1">
                    Public Handle
                  </label>
                  <div className="flex items-center h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950">
                    <span className="text-slate-400 mr-1">@</span>
                    <input
                      type="text"
                      required
                      minLength={3}
                      maxLength={30}
                      value={editForm.handle}
                      onChange={(e) =>
                        setEditForm({
                          ...editForm,
                          handle: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''),
                        })
                      }
                      className="flex-1 bg-transparent text-sm focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="font-semibold text-slate-600 dark:text-slate-300 block mb-1">
                    City
                  </label>
                  <input
                    type="text"
                    maxLength={80}
                    placeholder="e.g. Bengaluru, Mumbai, London"
                    value={editForm.city}
                    onChange={(e) => setEditForm({ ...editForm, city: e.target.value })}
                    className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-600 dark:text-slate-300 block mb-1">
                    Bio
                  </label>
                  <textarea
                    rows={3}
                    maxLength={240}
                    placeholder="Tell neighbors what places you love discovering..."
                    value={editForm.bio}
                    onChange={(e) => setEditForm({ ...editForm, bio: e.target.value })}
                    className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={saving}
                className="w-full min-h-[44px] rounded-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
