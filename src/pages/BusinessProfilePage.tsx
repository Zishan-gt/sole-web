import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowLeft,
  BadgeCheck,
  Bookmark,
  Briefcase,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  ExternalLink,
  Facebook,
  Flag,
  Globe,
  Heart,
  Instagram,
  Link2,
  Linkedin,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Pin,
  Play,
  Search,
  Send,
  Share2,
  ShoppingBag,
  Sparkles,
  Star,
  X,
  Youtube,
} from 'lucide-react';
import { SafeImage } from '../components/BusinessCard';
import { LeafletMap } from '../components/LeafletMap';
import { Link, navigate } from '../components/RouterLink';
import { StorefrontChatDrawer } from '../components/StorefrontChatDrawer';
import { useAuth } from '../context/AuthContext';
import { useRealtime } from '../context/RealtimeContext';
import { useSocial, type UnifiedFeedPost } from '../context/SocialContext';
import { useTheme } from '../context/ThemeContext';
import { getT } from '../i18n/translations';
import { apiFetch, trackAnalyticsEvent } from '../lib/api';
import { buildGoogleMapsDirectionsUrl } from '../lib/maps';
import {
  addPostCommentAtomic,
  subscribeBusinessFollowersCount,
  subscribePostComments,
  type FirestoreComment,
} from '../lib/socialFirestore';
import type { BusinessSummary, PostItem, ProductItem, ReviewItem } from '../types/app';

interface ProfileResponse {
  business: BusinessSummary;
  counts: { posts: number; products: number; reviews: number };
  posts: PostItem[];
  products: ProductItem[];
  reviews: ReviewItem[];
  isFavorited: boolean;
}

const DAY_LABELS: Record<string, string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
};

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function getTodayKey(): string {
  return DAY_KEYS[new Date().getDay()];
}

function getTodayHoursLabel(hours?: BusinessSummary['hours']): string {
  if (!hours) return '09:00 – 21:00';
  const slot = hours[getTodayKey()];
  if (!slot) return '09:00 – 21:00';
  if (slot.closed) return 'Closed today';
  return `${slot.open} – ${slot.close}`;
}

export const BusinessProfilePage: React.FC<{ slug: string }> = ({ slug }) => {
  const { firebaseUser, profile } = useAuth();
  const { pushToast } = useRealtime();
  const {
    feedPosts,
    followedBusinessIds,
    likedPostIds,
    savedPostIds,
    toggleFollow,
    toggleLike,
    toggleSavePost,
  } = useSocial();
  const { locale } = useTheme();
  const t = getT(locale);

  const [data, setData] = useState<ProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'posts' | 'media' | 'products' | 'reviews' | 'about'>('posts');
  const [saved, setSaved] = useState(false);
  const [followersCount, setFollowersCount] = useState(0);
  const [brief, setBrief] = useState<{
    maps?: { text?: string; mapPlaces?: Array<{ title: string; uri: string; reviewSnippets: string[] }> };
  } | null>(null);
  const [briefLoading, setBriefLoading] = useState(false);

  // Interactive UI states
  const [activePostIdx, setActivePostIdx] = useState<number | null>(null);
  const [storyOpenIdx, setStoryOpenIdx] = useState<number | null>(null);
  const [coverViewerOpen, setCoverViewerOpen] = useState(false);
  const [heartBurstId, setHeartBurstId] = useState<string | null>(null);
  const lastTapRef = useRef<{ id: string; time: number }>({ id: '', time: 0 });
  const [copiedAddr, setCopiedAddr] = useState(false);

  // Lightbox live comments
  const [lightboxComments, setLightboxComments] = useState<FirestoreComment[]>([]);
  const [commentDraft, setCommentDraft] = useState('');
  const [commentSending, setCommentSending] = useState(false);

  // Shop filter
  const [shopFilter, setShopFilter] = useState<'all' | 'product' | 'service'>('all');
  const [shopQuery, setShopQuery] = useState('');

  // Modals
  const [chatOpen, setChatOpen] = useState(false);
  const [enquiryOpen, setEnquiryOpen] = useState(false);
  const [enquiryProductId, setEnquiryProductId] = useState<string | null>(null);
  const [enqForm, setEnqForm] = useState({ name: '', phone: '', message: '' });
  const [enqSending, setEnqSending] = useState(false);

  const [reportOpen, setReportOpen] = useState(false);
  const [reportTarget, setReportTarget] = useState<{
    type: 'business' | 'review' | 'post';
    id: string;
  } | null>(null);
  const [reportForm, setReportForm] = useState({ reason: 'Incorrect info', details: '' });

  const [revRating, setRevRating] = useState(5);
  const [revComment, setRevComment] = useState('');
  const [revSubmitting, setRevSubmitting] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError('');
    setBrief(null);
    setActivePostIdx(null);
    setStoryOpenIdx(null);
    apiFetch<ProfileResponse>(`/api/businesses/${encodeURIComponent(slug)}`)
      .then((res) => {
        setData(res);
        setSaved(res.isFavorited);
        trackAnalyticsEvent(res.business.id, 'profile_view');
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [slug]);

  useEffect(() => {
    if (!data?.business.id) return;
    let unsub = () => {};
    try {
      unsub = subscribeBusinessFollowersCount(data.business.id, setFollowersCount);
    } catch {
      // Ignore offline
    }
    return () => unsub();
  }, [data?.business.id]);

  useEffect(() => {
    if (profile) {
      setEnqForm((f) => ({
        ...f,
        name: f.name || profile.fullName || '',
        phone: f.phone || profile.phone || '',
      }));
    }
  }, [profile]);

  // Subscribe to comments for active lightbox post
  const activePost = activePostIdx !== null && data?.posts[activePostIdx] ? data.posts[activePostIdx] : null;
  useEffect(() => {
    if (!activePost) {
      setLightboxComments([]);
      return;
    }
    let unsub = () => {};
    try {
      unsub = subscribePostComments(activePost.id, setLightboxComments);
    } catch {
      // Ignore if post isn't mirrored yet
    }
    return () => unsub();
  }, [activePost?.id]);

  // Keyboard navigation for lightbox & story viewer
  useEffect(() => {
    if (activePostIdx === null && storyOpenIdx === null && !coverViewerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActivePostIdx(null);
        setStoryOpenIdx(null);
        setCoverViewerOpen(false);
      } else if (e.key === 'ArrowRight') {
        if (activePostIdx !== null && data && activePostIdx < data.posts.length - 1) {
          setActivePostIdx(activePostIdx + 1);
        }
        if (storyOpenIdx !== null && data) {
          if (storyOpenIdx < data.posts.length - 1) setStoryOpenIdx(storyOpenIdx + 1);
          else setStoryOpenIdx(null);
        }
      } else if (e.key === 'ArrowLeft') {
        if (activePostIdx !== null && activePostIdx > 0) setActivePostIdx(activePostIdx - 1);
        if (storyOpenIdx !== null && storyOpenIdx > 0) setStoryOpenIdx(storyOpenIdx - 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activePostIdx, storyOpenIdx, coverViewerOpen, data]);

  // Auto-advance Instagram-style story viewer
  useEffect(() => {
    if (storyOpenIdx === null || !data) return;
    const current = data.posts[storyOpenIdx];
    if (!current || current.type === 'video') return;
    const timer = setTimeout(() => {
      if (storyOpenIdx < data.posts.length - 1) setStoryOpenIdx(storyOpenIdx + 1);
      else setStoryOpenIdx(null);
    }, 5000);
    return () => clearTimeout(timer);
  }, [storyOpenIdx, data]);

  const filteredProducts = useMemo(() => {
    if (!data) return [];
    const q = shopQuery.trim().toLowerCase();
    return data.products.filter((p) => {
      if (shopFilter !== 'all' && p.type !== shopFilter) return false;
      if (q && !p.name.toLowerCase().includes(q) && !(p.description || '').toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [data, shopFilter, shopQuery]);

  const ratingBreakdown = useMemo(() => {
    const countsByStar: Record<number, number> = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    if (!data?.reviews.length) return countsByStar;
    for (const r of data.reviews) {
      const star = Math.min(5, Math.max(1, Math.round(r.rating)));
      countsByStar[star] = (countsByStar[star] || 0) + 1;
    }
    return countsByStar;
  }, [data?.reviews]);

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-0 lg:px-6">
        <div className="grid lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 min-h-screen bg-white dark:bg-slate-900 border-x border-slate-200 dark:border-slate-800 animate-pulse">
            <div className="h-14 border-b border-slate-200 dark:border-slate-800" />
            <div className="h-48 bg-slate-200 dark:bg-slate-800" />
            <div className="p-4 space-y-3">
              <div className="w-28 h-28 rounded-full bg-slate-300 dark:bg-slate-700 -mt-16 border-4 border-white dark:border-slate-900" />
              <div className="h-6 w-52 bg-slate-200 dark:bg-slate-800 rounded" />
              <div className="h-4 w-80 bg-slate-200 dark:bg-slate-800 rounded" />
            </div>
          </div>
          <div className="hidden lg:block lg:col-span-4 py-6 space-y-4 animate-pulse">
            <div className="h-72 rounded-2xl bg-slate-200 dark:bg-slate-800" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-2xl mx-auto min-h-screen bg-white dark:bg-slate-900 border-x border-slate-200 dark:border-slate-800 px-6 py-16 text-center">
        <h1 className="font-display text-2xl font-bold">Storefront not found</h1>
        <p className="mt-2 text-sm text-slate-500">{error || 'This business may have been removed.'}</p>
        <Link
          to="/search"
          className="inline-block mt-6 px-6 py-2.5 rounded-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-sm font-semibold"
        >
          Back to search
        </Link>
      </div>
    );
  }

  const { business, counts, posts, products, reviews } = data;
  const directionsUrl = buildGoogleMapsDirectionsUrl(
    business.lat,
    business.lng,
    business.googleMapsUrl
  );
  const fullAddress = [
    business.addressLine,
    business.area,
    business.city,
    [business.state, business.pincode].filter(Boolean).join(' '),
    business.country,
  ]
    .filter(Boolean)
    .join(', ');
  const isFollowing = followedBusinessIds.has(business.id);
  const todayKey = getTodayKey();
  const feedStatsMap = new Map(feedPosts.map((fp) => [fp.id, fp]));

  const toUnifiedPost = (p: PostItem): UnifiedFeedPost => {
    const existing = feedStatsMap.get(p.id);
    if (existing) return existing;
    return {
      id: p.id,
      businessId: business.id,
      businessSlug: business.slug,
      businessName: business.name,
      businessLogo: business.logoUrl || business.coverUrl,
      businessVerified: business.isVerified,
      categoryName: business.categoryName || 'Business',
      area: business.area,
      city: business.city,
      lat: business.lat,
      lng: business.lng,
      googleMapsUrl: business.googleMapsUrl,
      phone: business.phone,
      whatsapp: business.whatsapp,
      isOpenNow: business.isOpenNow,
      mediaType: p.type,
      mediaUrl: p.mediaUrl,
      posterUrl: p.posterUrl,
      caption: p.caption,
      tags: business.tags || [],
      likesCount: 0,
      commentsCount: 0,
      createdAt: p.createdAt,
      inFirestore: false,
    };
  };

  const handleMediaTap = (post: PostItem, idx: number) => {
    const now = Date.now();
    if (lastTapRef.current.id === post.id && now - lastTapRef.current.time < 300) {
      setHeartBurstId(post.id);
      setTimeout(() => setHeartBurstId(null), 650);
      if (!likedPostIds.has(post.id)) {
        void toggleLike(toUnifiedPost(post));
      }
      lastTapRef.current = { id: '', time: 0 };
      return;
    }
    lastTapRef.current = { id: post.id, time: now };
    setTimeout(() => {
      if (lastTapRef.current.id === post.id && lastTapRef.current.time === now) {
        setActivePostIdx(idx);
      }
    }, 260);
  };

  const handleShare = async () => {
    trackAnalyticsEvent(business.id, 'share');
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: business.name, text: business.bio || '', url });
        return;
      } catch {
        // Fallback to clipboard
      }
    }
    await navigator.clipboard?.writeText(url);
    pushToast({ title: 'Profile link copied' });
  };

  const handleCopyAddress = async () => {
    if (!fullAddress) return;
    await navigator.clipboard?.writeText(fullAddress);
    setCopiedAddr(true);
    pushToast({ title: 'Address copied' });
    setTimeout(() => setCopiedAddr(false), 2000);
  };

  const handleToggleSave = async () => {
    if (!profile) {
      navigate('/login');
      return;
    }
    try {
      const res = await apiFetch<{ saved: boolean }>('/api/favorites', {
        method: 'POST',
        body: JSON.stringify({ businessId: business.id }),
      });
      setSaved(res.saved);
      pushToast({ title: res.saved ? 'Saved to your favourites' : 'Removed from saved' });
    } catch (err) {
      pushToast({ title: (err as Error).message, variant: 'error' });
    }
  };

  const handleSendEnquiry = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnqSending(true);
    try {
      await apiFetch('/api/enquiries', {
        method: 'POST',
        body: JSON.stringify({
          businessId: business.id,
          productId: enquiryProductId,
          ...enqForm,
        }),
      });
      setEnquiryOpen(false);
      setEnqForm((f) => ({ ...f, message: '' }));
      pushToast({ title: 'Enquiry sent', body: `${business.name} has been notified.` });
    } catch (err) {
      pushToast({ title: (err as Error).message, variant: 'error' });
    } finally {
      setEnqSending(false);
    }
  };

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) {
      navigate('/login');
      return;
    }
    setRevSubmitting(true);
    try {
      const res = await apiFetch<{ review: ReviewItem }>('/api/reviews', {
        method: 'POST',
        body: JSON.stringify({
          businessId: business.id,
          rating: revRating,
          comment: revComment,
        }),
      });
      setData((prev) =>
        prev
          ? {
              ...prev,
              reviews: [res.review, ...prev.reviews],
              counts: { ...prev.counts, reviews: prev.counts.reviews + 1 },
            }
          : prev
      );
      setRevComment('');
      pushToast({ title: 'Review published' });
    } catch (err) {
      pushToast({ title: (err as Error).message, variant: 'error' });
    } finally {
      setRevSubmitting(false);
    }
  };

  const handleReportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportTarget) return;
    try {
      await apiFetch('/api/reports', {
        method: 'POST',
        body: JSON.stringify({
          targetType: reportTarget.type,
          targetId: reportTarget.id,
          reason: reportForm.reason,
          details: reportForm.details,
        }),
      });
      setReportOpen(false);
      setReportForm({ reason: 'Incorrect info', details: '' });
      pushToast({ title: 'Report submitted to moderators' });
    } catch (err) {
      pushToast({ title: (err as Error).message, variant: 'error' });
    }
  };

  const handleAddLightboxComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activePost) return;
    if (!firebaseUser || !profile) {
      navigate('/login');
      return;
    }
    const clean = commentDraft.trim();
    if (!clean) return;
    setCommentSending(true);
    try {
      await addPostCommentAtomic(
        activePost.id,
        firebaseUser.uid,
        profile.fullName || 'Customer',
        profile.avatarUrl,
        clean
      );
      setCommentDraft('');
    } catch {
      pushToast({ title: 'Could not post comment', variant: 'error' });
    } finally {
      setCommentSending(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-0 lg:px-6">
      <div className="grid lg:grid-cols-12 gap-6 items-start">
        {/* Main Social Profile Column (Twitter/X × Instagram) */}
        <div className="lg:col-span-8 min-h-screen bg-white dark:bg-slate-900 border-x border-slate-200 dark:border-slate-800">
          {/* Sticky Glassmorphic Profile Header */}
          <header className="sticky top-14 md:top-0 z-20 h-14 px-3 sm:px-4 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => {
                  if (window.history.length > 1) window.history.back();
                  else navigate('/search');
                }}
                aria-label="Go back"
                className="min-h-[40px] min-w-[40px] rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition-colors shrink-0"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <h1 className="font-display text-base font-extrabold text-slate-900 dark:text-white truncate">
                    {business.name}
                  </h1>
                  {business.isVerified && (
                    <BadgeCheck
                      className="w-4 h-4 text-blue-500 shrink-0"
                      aria-label={t.profile.verifiedBadge}
                    />
                  )}
                </div>
                <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 tabular-nums truncate">
                  {counts.posts} posts · {counts.products} products & services
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleShare}
              aria-label="Share profile"
              className="min-h-[40px] min-w-[40px] rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition-colors shrink-0"
            >
              <Share2 className="w-4 h-4" />
            </button>
          </header>

          {/* Hero Cover Banner */}
          <button
            type="button"
            onClick={() => setCoverViewerOpen(true)}
            className="relative block h-40 sm:h-52 w-full bg-slate-200 dark:bg-slate-800 overflow-hidden group text-left"
          >
            <SafeImage
              src={business.coverUrl || business.logoUrl}
              alt={`${business.name} cover`}
              className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent pointer-events-none" />
          </button>

          {/* Identity & Actions Section */}
          <div className="px-4 pb-4">
            <div className="flex items-end justify-between gap-3 -mt-12 sm:-mt-16 mb-3 relative z-10">
              {/* Story-Ring Profile Avatar */}
              <motion.button
                whileTap={{ scale: 0.95 }}
                type="button"
                onClick={() => {
                  if (posts.length > 0) setStoryOpenIdx(0);
                  else setCoverViewerOpen(true);
                }}
                aria-label={posts.length > 0 ? 'View business stories' : 'View avatar'}
                className={`w-24 h-24 sm:w-32 sm:h-32 rounded-full shrink-0 p-[3px] ${
                  posts.length > 0
                    ? 'bg-gradient-to-tr from-amber-500 via-rose-500 to-violet-600 shadow-lg cursor-pointer'
                    : 'bg-white dark:bg-slate-900'
                }`}
              >
                <div className="w-full h-full rounded-full border-[3px] border-white dark:border-slate-900 overflow-hidden bg-white dark:bg-slate-800">
                  <SafeImage
                    src={business.logoUrl || business.coverUrl}
                    alt={business.name}
                    className="w-full h-full object-cover"
                  />
                </div>
              </motion.button>

              {/* Top-Right Action Cluster */}
              <div className="flex items-center gap-1.5 sm:gap-2 pb-1 flex-wrap justify-end">
                <button
                  type="button"
                  onClick={handleToggleSave}
                  aria-label={saved ? t.profile.saved : t.profile.save}
                  className={`min-h-[40px] min-w-[40px] rounded-full border flex items-center justify-center transition-colors ${
                    saved
                      ? 'border-slate-900 dark:border-white bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                      : 'border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <Bookmark className={`w-4 h-4 ${saved ? 'fill-current' : ''}`} />
                </button>

                <button
                  type="button"
                  onClick={() => setChatOpen(true)}
                  aria-label="Live storefront chat"
                  className="min-h-[40px] min-w-[40px] rounded-full border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition-colors"
                >
                  <MessageCircle className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setReportTarget({ type: 'business', id: business.id });
                    setReportOpen(true);
                  }}
                  aria-label="Report business"
                  className="min-h-[40px] min-w-[40px] rounded-full border border-slate-300 dark:border-slate-700 text-slate-500 hover:text-red-500 flex items-center justify-center transition-colors"
                >
                  <Flag className="w-4 h-4" />
                </button>

                <motion.button
                  whileTap={{ scale: 0.96 }}
                  type="button"
                  onClick={() =>
                    toggleFollow({
                      id: business.id,
                      slug: business.slug,
                      name: business.name,
                      logoUrl: business.logoUrl,
                    })
                  }
                  className={`min-h-[40px] px-5 rounded-full text-xs sm:text-sm font-bold transition-colors whitespace-nowrap ${
                    isFollowing
                      ? 'border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white hover:border-red-400 hover:text-red-500'
                      : 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:opacity-90'
                  }`}
                >
                  {isFollowing ? 'Following' : 'Follow'}
                </motion.button>
              </div>
            </div>

            {/* Brand Identity & Rating Line */}
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <h2 className="font-display text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white leading-tight tracking-tight">
                  {business.name}
                </h2>
                {business.isVerified && (
                  <BadgeCheck className="w-5 h-5 text-blue-500 shrink-0" />
                )}
              </div>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 flex items-center gap-1.5 flex-wrap">
                <span>@{business.slug}</span>
                <span aria-hidden="true">·</span>
                <span
                  className={
                    business.isOpenNow
                      ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                      : 'text-slate-500'
                  }
                >
                  {business.isOpenNow ? t.search.open : t.search.closed}
                </span>
                <span aria-hidden="true">·</span>
                <span className="inline-flex items-center gap-1 tabular-nums text-slate-700 dark:text-slate-200 font-semibold">
                  <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                  {Number(business.ratingAvg) > 0 ? Number(business.ratingAvg).toFixed(1) : 'New'} ({business.ratingCount})
                </span>
              </p>
            </div>

            {business.bio && (
              <p className="mt-3 text-sm sm:text-[15px] text-slate-800 dark:text-slate-200 leading-relaxed">
                {business.bio}
              </p>
            )}

            {/* Inline Business Metadata */}
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs sm:text-[13px] text-slate-500 dark:text-slate-400">
              <span className="inline-flex items-center gap-1.5">
                <Briefcase className="w-3.5 h-3.5 shrink-0" />
                <span>
                  {business.categoryName}
                  {business.subcategory ? ` · ${business.subcategory}` : ''}
                </span>
              </span>

              {fullAddress && (
                <button
                  type="button"
                  onClick={handleCopyAddress}
                  title="Copy full address"
                  className="inline-flex items-start gap-1.5 text-left hover:text-slate-900 dark:hover:text-white transition-colors"
                >
                  <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5 text-blue-500" />
                  <span>{fullAddress}</span>
                </button>
              )}

              <span className="inline-flex items-center gap-1.5 tabular-nums">
                <Clock className="w-3.5 h-3.5 shrink-0" />
                <span>Today {getTodayHoursLabel(business.hours)}</span>
              </span>

              {business.website && (
                <a
                  href={business.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline"
                >
                  <Link2 className="w-3.5 h-3.5 shrink-0" />
                  <span>{business.website.replace(/^https?:\/\/(www\.)?/, '')}</span>
                </a>
              )}
            </div>

            {/* Bold Social + Storefront Metrics */}
            <div className="mt-3.5 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm tabular-nums">
              <span>
                <strong className="font-bold text-slate-900 dark:text-white">{followersCount}</strong>{' '}
                <span className="text-slate-500 dark:text-slate-400">Followers</span>
              </span>
              <button
                type="button"
                onClick={() => setTab('posts')}
                className="hover:underline"
              >
                <strong className="font-bold text-slate-900 dark:text-white">{counts.posts}</strong>{' '}
                <span className="text-slate-500 dark:text-slate-400">{t.profile.posts}</span>
              </button>
              <button
                type="button"
                onClick={() => setTab('products')}
                className="hover:underline"
              >
                <strong className="font-bold text-slate-900 dark:text-white">{counts.products}</strong>{' '}
                <span className="text-slate-500 dark:text-slate-400">{t.profile.products}</span>
              </button>
              <button
                type="button"
                onClick={() => setTab('reviews')}
                className="hover:underline"
              >
                <strong className="font-bold text-slate-900 dark:text-white">{counts.reviews}</strong>{' '}
                <span className="text-slate-500 dark:text-slate-400">{t.profile.reviews}</span>
              </button>
            </div>

            {/* Primary Commerce Action Strip */}
            <div className="mt-4 pt-3.5 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={directionsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => trackAnalyticsEvent(business.id, 'directions_click')}
                  className="min-h-[40px] inline-flex items-center gap-1.5 px-4 rounded-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-colors whitespace-nowrap"
                >
                  <MapPin className="w-3.5 h-3.5" />
                  <span>{t.profile.getLocation}</span>
                </a>

                {business.phone && (
                  <a
                    href={`tel:${business.phone}`}
                    onClick={() => trackAnalyticsEvent(business.id, 'call_click')}
                    className="min-h-[40px] inline-flex items-center gap-1.5 px-4 rounded-full border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold whitespace-nowrap"
                  >
                    <Phone className="w-3.5 h-3.5" />
                    <span>Call</span>
                  </a>
                )}

                {business.whatsapp && (
                  <a
                    href={`https://wa.me/${business.whatsapp.replace(/[^0-9]/g, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => trackAnalyticsEvent(business.id, 'whatsapp_click')}
                    className="min-h-[40px] inline-flex items-center gap-1.5 px-4 rounded-full border border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-xs font-semibold whitespace-nowrap"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    <span>{t.profile.whatsapp}</span>
                  </a>
                )}

                <button
                  type="button"
                  onClick={() => setChatOpen(true)}
                  className="min-h-[40px] inline-flex items-center gap-1.5 px-4 rounded-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:opacity-90 text-xs font-bold whitespace-nowrap"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  <span>Message</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setEnquiryProductId(null);
                    setEnquiryOpen(true);
                  }}
                  className="min-h-[40px] inline-flex items-center gap-1.5 px-4 rounded-full border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold whitespace-nowrap"
                >
                  <Mail className="w-3.5 h-3.5" />
                  <span>Enquire</span>
                </button>
              </div>

              <div className="flex items-center gap-3 text-slate-500">
                {business.socialLinks?.instagram && (
                  <a href={business.socialLinks.instagram} target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="hover:text-slate-900 dark:hover:text-white">
                    <Instagram className="w-4 h-4" />
                  </a>
                )}
                {business.socialLinks?.facebook && (
                  <a href={business.socialLinks.facebook} target="_blank" rel="noopener noreferrer" aria-label="Facebook" className="hover:text-slate-900 dark:hover:text-white">
                    <Facebook className="w-4 h-4" />
                  </a>
                )}
                {business.socialLinks?.youtube && (
                  <a href={business.socialLinks.youtube} target="_blank" rel="noopener noreferrer" aria-label="YouTube" className="hover:text-slate-900 dark:hover:text-white">
                    <Youtube className="w-4 h-4" />
                  </a>
                )}
                {business.socialLinks?.linkedin && (
                  <a href={business.socialLinks.linkedin} target="_blank" rel="noopener noreferrer" aria-label="LinkedIn" className="hover:text-slate-900 dark:hover:text-white">
                    <Linkedin className="w-4 h-4" />
                  </a>
                )}
                {business.website && (
                  <a href={business.website} target="_blank" rel="noopener noreferrer" aria-label="Website" className="hover:text-slate-900 dark:hover:text-white">
                    <Globe className="w-4 h-4" />
                  </a>
                )}
              </div>
            </div>

            {/* Instagram-Style Story Highlights Strip */}
            {posts.length > 0 && (
              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center gap-4 overflow-x-auto no-scrollbar pb-1">
                {posts.slice(0, 6).map((p, idx) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setStoryOpenIdx(idx)}
                    className="flex flex-col items-center gap-1.5 shrink-0 group"
                  >
                    <div className="w-14 h-14 rounded-full p-[2px] bg-gradient-to-tr from-amber-500 via-rose-500 to-violet-600 group-hover:scale-105 transition-transform">
                      <div className="w-full h-full rounded-full border-2 border-white dark:border-slate-900 overflow-hidden bg-slate-100 dark:bg-slate-800 relative">
                        <SafeImage
                          src={p.type === 'video' ? p.posterUrl || business.logoUrl : p.mediaUrl}
                          alt={p.caption || 'Story'}
                          className="w-full h-full object-cover"
                        />
                        {p.type === 'video' && (
                          <span className="absolute inset-0 bg-black/25 flex items-center justify-center">
                            <Play className="w-3.5 h-3.5 text-white fill-white" />
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="text-[11px] text-slate-600 dark:text-slate-400 max-w-[64px] truncate">
                      {p.isPinned ? 'Featured' : p.type === 'video' ? 'Reel' : `Update ${idx + 1}`}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Animated Underline Tabs */}
          <div className="grid grid-cols-5 border-b border-slate-200 dark:border-slate-800 text-center text-xs sm:text-sm font-semibold sticky top-28 md:top-14 z-10 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md">
            {(
              [
                ['posts', 'Posts'],
                ['media', 'Media'],
                ['products', 'Shop'],
                ['reviews', 'Reviews'],
                ['about', 'About'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`min-h-[44px] py-3 relative hover:bg-slate-100/70 dark:hover:bg-slate-800/50 transition-colors whitespace-nowrap ${
                  tab === key
                    ? 'text-slate-900 dark:text-white font-bold'
                    : 'text-slate-500 dark:text-slate-400 font-medium'
                }`}
              >
                <span>{label}</span>
                {tab === key && (
                  <motion.span
                    layoutId="profileTabIndicator"
                    transition={{ type: 'spring', stiffness: 450, damping: 35 }}
                    className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-0.5 rounded-full bg-blue-500"
                  />
                )}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <AnimatePresence mode="wait">
            {tab === 'posts' && (
              <motion.section
                key="posts"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="divide-y divide-slate-200 dark:divide-slate-800"
              >
                {posts.length === 0 ? (
                  <div className="p-12 text-center text-sm text-slate-500">
                    No posts published yet.
                  </div>
                ) : (
                  posts.map((post, idx) => {
                    const unified = toUnifiedPost(post);
                    const isLiked = likedPostIds.has(post.id);
                    const isPostSaved = savedPostIds.has(post.id);

                    return (
                      <article
                        key={post.id}
                        className="px-4 py-4 hover:bg-slate-50/60 dark:hover:bg-slate-800/25 transition-colors"
                      >
                        {post.isPinned && (
                          <p className="ml-12 mb-1.5 text-[11px] font-semibold text-slate-500 flex items-center gap-1.5">
                            <Pin className="w-3 h-3" />
                            <span>Pinned post</span>
                          </p>
                        )}
                        <div className="flex gap-3">
                          <div className="w-10 h-10 rounded-full overflow-hidden border border-slate-200 dark:border-slate-700 shrink-0">
                            <SafeImage
                              src={business.logoUrl || business.coverUrl}
                              alt={business.name}
                              className="w-full h-full object-cover"
                            />
                          </div>

                          <div className="flex-1 min-w-0 space-y-2.5">
                            <div className="flex items-center gap-1.5 flex-wrap text-xs sm:text-sm">
                              <span className="font-bold text-slate-900 dark:text-white truncate">
                                {business.name}
                              </span>
                              {business.isVerified && (
                                <BadgeCheck className="w-4 h-4 text-blue-500 shrink-0" />
                              )}
                              <span className="text-slate-500 dark:text-slate-400 text-xs">
                                @{business.slug} · {new Date(post.createdAt).toLocaleDateString()}
                              </span>
                            </div>

                            {post.caption && (
                              <p className="text-[14px] sm:text-[15px] text-slate-800 dark:text-slate-200 leading-relaxed">
                                {post.caption}
                              </p>
                            )}

                            <button
                              type="button"
                              onClick={() => handleMediaTap(post, idx)}
                              className="relative w-full aspect-[4/3] rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-950 block text-left select-none"
                            >
                              {post.type === 'video' ? (
                                <>
                                  <SafeImage
                                    src={post.posterUrl || business.coverUrl}
                                    alt={post.caption || 'Video'}
                                    className="w-full h-full object-cover"
                                  />
                                  <div className="absolute inset-0 bg-black/25 flex items-center justify-center">
                                    <div className="w-12 h-12 rounded-full bg-white/95 text-slate-900 flex items-center justify-center shadow-lg">
                                      <Play className="w-5 h-5 fill-current ml-0.5" />
                                    </div>
                                  </div>
                                </>
                              ) : (
                                <SafeImage
                                  src={post.mediaUrl}
                                  alt={post.caption || business.name}
                                  className="w-full h-full object-cover"
                                />
                              )}

                              <AnimatePresence>
                                {heartBurstId === post.id && (
                                  <motion.div
                                    initial={{ scale: 0.4, opacity: 0 }}
                                    animate={{ scale: 1.15, opacity: 1 }}
                                    exit={{ scale: 1.4, opacity: 0 }}
                                    transition={{ duration: 0.35 }}
                                    className="absolute inset-0 flex items-center justify-center pointer-events-none"
                                  >
                                    <Heart className="w-20 h-20 text-white fill-rose-500 drop-shadow-2xl" />
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </button>

                            {/* Interactive Post Bar */}
                            <div className="pt-1 flex items-center justify-between max-w-sm text-xs text-slate-500 dark:text-slate-400">
                              <motion.button
                                whileTap={{ scale: 0.85 }}
                                type="button"
                                onClick={() => void toggleLike(unified)}
                                className={`min-h-[36px] inline-flex items-center gap-1.5 px-1.5 hover:text-rose-500 transition-colors tabular-nums ${
                                  isLiked ? 'text-rose-500 font-semibold' : ''
                                }`}
                              >
                                <Heart className={`w-4 h-4 ${isLiked ? 'fill-current' : ''}`} />
                                <span>{unified.likesCount}</span>
                              </motion.button>

                              <button
                                type="button"
                                onClick={() => setActivePostIdx(idx)}
                                className="min-h-[36px] inline-flex items-center gap-1.5 px-1.5 hover:text-blue-500 transition-colors tabular-nums"
                              >
                                <MessageCircle className="w-4 h-4" />
                                <span>{unified.commentsCount}</span>
                              </button>

                              <motion.button
                                whileTap={{ scale: 0.85 }}
                                type="button"
                                onClick={() => void toggleSavePost(unified)}
                                aria-label="Save post"
                                className={`min-h-[36px] inline-flex items-center gap-1.5 px-1.5 hover:text-blue-500 transition-colors ${
                                  isPostSaved ? 'text-blue-500' : ''
                                }`}
                              >
                                <Bookmark className={`w-4 h-4 ${isPostSaved ? 'fill-current' : ''}`} />
                              </motion.button>

                              <button
                                type="button"
                                onClick={handleShare}
                                aria-label="Share post"
                                className="min-h-[36px] inline-flex items-center gap-1.5 px-1.5 hover:text-blue-500 transition-colors"
                              >
                                <Share2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </article>
                    );
                  })
                )}
              </motion.section>
            )}

            {tab === 'media' && (
              <motion.section
                key="media"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="p-2 sm:p-3"
              >
                {posts.length === 0 ? (
                  <div className="p-12 text-center text-sm text-slate-500">
                    No photos or videos uploaded yet.
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-1 sm:gap-2">
                    {posts.map((post, idx) => {
                      const unified = toUnifiedPost(post);
                      return (
                        <button
                          key={post.id}
                          type="button"
                          onClick={() => setActivePostIdx(idx)}
                          className="group relative aspect-square bg-slate-200 dark:bg-slate-800 rounded-lg overflow-hidden text-left"
                        >
                          <SafeImage
                            src={post.type === 'video' ? post.posterUrl || business.logoUrl : post.mediaUrl}
                            alt={post.caption || business.name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                          {post.type === 'video' && (
                            <div className="absolute inset-0 bg-black/25 flex items-center justify-center">
                              <Play className="w-7 h-7 text-white fill-white/80" />
                            </div>
                          )}
                          <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute inset-0 bg-black/45 flex items-center justify-center gap-4 text-white text-xs font-bold tabular-nums">
                            <span className="inline-flex items-center gap-1">
                              <Heart className="w-4 h-4 fill-white" />
                              {unified.likesCount}
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <MessageCircle className="w-4 h-4 fill-white" />
                              {unified.commentsCount}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </motion.section>
            )}

            {tab === 'products' && (
              <motion.section
                key="products"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="divide-y divide-slate-200 dark:divide-slate-800"
              >
                {products.length > 0 && (
                  <div className="p-3 sm:p-4 flex flex-wrap items-center justify-between gap-2.5 bg-slate-50/70 dark:bg-slate-950/40">
                    <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
                      {(['all', 'product', 'service'] as const).map((f) => (
                        <button
                          key={f}
                          type="button"
                          onClick={() => setShopFilter(f)}
                          className={`px-3 py-1.5 text-xs font-semibold rounded-md capitalize transition-colors ${
                            shopFilter === f
                              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                              : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                          }`}
                        >
                          {f === 'all' ? `All (${products.length})` : `${f}s`}
                        </button>
                      ))}
                    </div>
                    {products.length > 3 && (
                      <div className="flex items-center gap-2 h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex-1 max-w-[220px]">
                        <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <input
                          type="text"
                          value={shopQuery}
                          onChange={(e) => setShopQuery(e.target.value)}
                          placeholder="Filter catalogue..."
                          className="w-full bg-transparent text-xs focus:outline-none"
                        />
                      </div>
                    )}
                  </div>
                )}

                {filteredProducts.length === 0 ? (
                  <div className="p-12 text-center text-sm text-slate-500">
                    {products.length === 0
                      ? 'No products or services listed yet.'
                      : 'No catalogue items match your filter.'}
                  </div>
                ) : (
                  filteredProducts.map((prod) => {
                    const isOutOfStock = prod.availability === 'out_of_stock';
                    const priceNum = Number(prod.price);
                    const discNum = prod.discountPrice ? Number(prod.discountPrice) : null;
                    const savePct =
                      discNum && priceNum > 0 && discNum < priceNum
                        ? Math.round(((priceNum - discNum) / priceNum) * 100)
                        : 0;

                    return (
                      <div
                        key={prod.id}
                        className="p-4 flex gap-3.5 items-start hover:bg-slate-50/60 dark:hover:bg-slate-800/25 transition-colors"
                      >
                        <Link
                          to={`/b/${business.slug}/p/${prod.id}`}
                          className="w-24 h-24 rounded-xl bg-slate-100 dark:bg-slate-800 overflow-hidden shrink-0"
                        >
                          <SafeImage
                            src={prod.images?.[0] || business.coverUrl}
                            alt={prod.name}
                            className="w-full h-full object-cover hover:scale-105 transition-transform duration-200"
                          />
                        </Link>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            <span>{prod.type === 'service' ? 'Service' : 'Product'}</span>
                            {prod.categoryLabel && <span> · {prod.categoryLabel}</span>}
                            {prod.durationMinutes && <span> · {prod.durationMinutes} mins</span>}
                            {prod.type === 'product' && (
                              <>
                                <span> · </span>
                                <span
                                  className={
                                    isOutOfStock
                                      ? 'text-red-600 font-semibold'
                                      : 'text-emerald-600 dark:text-emerald-400 font-medium'
                                  }
                                >
                                  {isOutOfStock ? t.profile.outOfStock : t.profile.inStock}
                                </span>
                              </>
                            )}
                          </p>
                          <Link
                            to={`/b/${business.slug}/p/${prod.id}`}
                            className="mt-0.5 font-display text-sm sm:text-base font-bold text-slate-900 dark:text-white hover:underline block truncate"
                          >
                            {prod.name}
                          </Link>
                          {prod.description && (
                            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400 line-clamp-2">
                              {prod.description}
                            </p>
                          )}

                          <div className="mt-2.5 flex items-center justify-between gap-2 flex-wrap">
                            <div className="tabular-nums text-sm font-bold text-slate-900 dark:text-white">
                              {discNum ? (
                                <span className="flex items-baseline gap-2">
                                  <span>₹{discNum.toLocaleString()}</span>
                                  <span className="text-xs text-slate-400 line-through font-normal">
                                    ₹{priceNum.toLocaleString()}
                                  </span>
                                  {savePct > 0 && (
                                    <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                                      Save {savePct}%
                                    </span>
                                  )}
                                </span>
                              ) : (
                                <span>₹{priceNum.toLocaleString()}</span>
                              )}
                            </div>

                            <div className="flex items-center gap-2">
                              <Link
                                to={`/b/${business.slug}/p/${prod.id}`}
                                className="min-h-[36px] px-3.5 rounded-full border border-slate-200 dark:border-slate-700 text-xs font-semibold flex items-center hover:bg-slate-50 dark:hover:bg-slate-800"
                              >
                                Details
                              </Link>
                              <button
                                type="button"
                                onClick={() => {
                                  setEnquiryProductId(prod.id);
                                  setEnquiryOpen(true);
                                }}
                                className="min-h-[36px] px-4 rounded-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold hover:opacity-90"
                              >
                                {t.profile.enquire}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </motion.section>
            )}

            {tab === 'reviews' && (
              <motion.section
                key="reviews"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="divide-y divide-slate-200 dark:divide-slate-800"
              >
                {/* Rating Summary & Breakdown */}
                <div className="p-4 sm:p-5 grid sm:grid-cols-12 gap-4 items-center bg-slate-50/70 dark:bg-slate-950/40">
                  <div className="sm:col-span-4 text-center sm:text-left">
                    <p className="font-display text-3xl font-extrabold tabular-nums text-slate-900 dark:text-white">
                      {Number(business.ratingAvg) > 0 ? Number(business.ratingAvg).toFixed(1) : 'New'}
                    </p>
                    <div className="flex items-center justify-center sm:justify-start gap-0.5 mt-1">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Star
                          key={s}
                          className={`w-4 h-4 ${
                            s <= Math.round(Number(business.ratingAvg || 0))
                              ? 'fill-amber-400 text-amber-400'
                              : 'text-slate-300 dark:text-slate-700'
                          }`}
                        />
                      ))}
                    </div>
                    <p className="mt-1 text-xs text-slate-500 tabular-nums">
                      Based on {reviews.length} reviews
                    </p>
                  </div>
                  <div className="sm:col-span-8 space-y-1.5">
                    {[5, 4, 3, 2, 1].map((star) => {
                      const count = ratingBreakdown[star] || 0;
                      const pct = reviews.length > 0 ? Math.round((count / reviews.length) * 100) : 0;
                      return (
                        <div key={star} className="flex items-center gap-2 text-xs tabular-nums">
                          <span className="w-6 text-slate-500 font-medium">{star}★</span>
                          <div className="flex-1 h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-amber-400 transition-all duration-300"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="w-8 text-right text-slate-500">{count}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <form onSubmit={handleSubmitReview} className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="font-display text-sm font-bold">{t.profile.writeReview}</h2>
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => setRevRating(star)}
                          aria-label={`Rate ${star} stars`}
                          className="p-1"
                        >
                          <Star
                            className={`w-5 h-5 transition-transform active:scale-90 ${
                              star <= revRating
                                ? 'fill-amber-400 text-amber-400'
                                : 'text-slate-300 dark:text-slate-700'
                            }`}
                          />
                        </button>
                      ))}
                    </div>
                  </div>
                  <textarea
                    rows={3}
                    required
                    value={revComment}
                    onChange={(e) => setRevComment(e.target.value)}
                    placeholder="Share your experience with others..."
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 p-3 text-sm focus:outline-none focus:border-blue-500"
                  />
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={revSubmitting}
                      className="min-h-[40px] px-5 rounded-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold disabled:opacity-60"
                    >
                      {profile ? (revSubmitting ? 'Posting...' : 'Post review') : 'Sign in to review'}
                    </button>
                  </div>
                </form>

                {reviews.length === 0 ? (
                  <div className="p-8 text-center text-sm text-slate-500">
                    No reviews yet. Be the first to review {business.name}.
                  </div>
                ) : (
                  reviews.map((rev) => (
                    <article key={rev.id} className="p-4 space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            {rev.authorHandle ? (
                              <Link
                                to={`/u/${rev.authorHandle}`}
                                className="text-sm font-bold hover:underline text-slate-900 dark:text-white"
                              >
                                {rev.authorName || 'Customer'}
                              </Link>
                            ) : (
                              <span className="text-sm font-bold">{rev.authorName || 'Customer'}</span>
                            )}
                            <span className="text-xs text-slate-400">
                              · {new Date(rev.createdAt).toLocaleDateString()}
                            </span>
                          </div>
                          <div className="flex items-center gap-0.5 mt-0.5">
                            {Array.from({ length: rev.rating }).map((_, i) => (
                              <Star key={i} className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                            ))}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setReportTarget({ type: 'review', id: rev.id });
                            setReportOpen(true);
                          }}
                          className="text-xs text-slate-400 hover:text-red-500"
                        >
                          Report
                        </button>
                      </div>
                      <p className="text-sm text-slate-700 dark:text-slate-300">{rev.comment}</p>
                      {rev.ownerReply && (
                        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs">
                          <span className="font-semibold text-slate-900 dark:text-white">
                            Owner reply:
                          </span>{' '}
                          <span className="text-slate-600 dark:text-slate-300">{rev.ownerReply}</span>
                        </div>
                      )}
                    </article>
                  ))
                )}
              </motion.section>
            )}

            {tab === 'about' && (
              <motion.section
                key="about"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="p-4 space-y-5"
              >
                <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="font-display text-sm font-bold">Address & Contact Details</h2>
                    {fullAddress && (
                      <button
                        type="button"
                        onClick={handleCopyAddress}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        {copiedAddr ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedAddr ? 'Copied' : 'Copy address'}</span>
                      </button>
                    )}
                  </div>
                  {fullAddress && (
                    <p className="text-slate-700 dark:text-slate-300 flex items-start gap-2">
                      <MapPin className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                      <span>{fullAddress}</span>
                    </p>
                  )}
                  {business.phone && (
                    <p className="text-slate-700 dark:text-slate-300 flex items-center gap-2">
                      <Phone className="w-4 h-4 text-slate-400 shrink-0" />
                      <span>{business.phone}</span>
                    </p>
                  )}
                  {business.email && (
                    <p className="text-slate-700 dark:text-slate-300 flex items-center gap-2">
                      <Mail className="w-4 h-4 text-slate-400 shrink-0" />
                      <span>{business.email}</span>
                    </p>
                  )}
                </div>

                <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3">
                  <h2 className="font-display text-sm font-bold flex items-center gap-2">
                    <Clock className="w-4 h-4 text-blue-600" />
                    <span>Business Hours</span>
                  </h2>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs sm:text-sm">
                    {Object.entries(DAY_LABELS).map(([k, label]) => {
                      const slot = business.hours?.[k];
                      const isToday = k === todayKey;
                      return (
                        <div
                          key={k}
                          className={`py-2 flex items-center justify-between ${
                            isToday ? 'font-bold text-slate-900 dark:text-white' : ''
                          }`}
                        >
                          <span className={isToday ? '' : 'text-slate-600 dark:text-slate-400'}>
                            {label} {isToday ? '(Today)' : ''}
                          </span>
                          <span className="font-medium tabular-nums">
                            {!slot ? '09:00 – 21:00' : slot.closed ? 'Closed' : `${slot.open} – ${slot.close}`}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3">
                  <h2 className="font-display text-sm font-bold">Location Map</h2>
                  <LeafletMap
                    center={[business.lat, business.lng]}
                    zoom={15}
                    markers={[
                      {
                        id: business.id,
                        lat: business.lat,
                        lng: business.lng,
                        title: business.name,
                        subtitle: business.addressLine || business.city || '',
                      },
                    ]}
                    className="h-60 w-full rounded-xl"
                  />
                  <a
                    href={directionsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => trackAnalyticsEvent(business.id, 'directions_click')}
                    className="inline-flex items-center justify-center w-full min-h-[44px] rounded-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold"
                  >
                    Open in Google Maps
                  </a>
                </div>

                <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <h2 className="font-display text-sm font-bold flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-blue-600" />
                        <span>Neighborhood & Google Maps Context</span>
                      </h2>
                      <p className="text-xs text-slate-500">
                        Discover nearby landmarks around {business.area || business.city}
                      </p>
                    </div>
                    {!brief && (
                      <button
                        type="button"
                        disabled={briefLoading}
                        onClick={async () => {
                          setBriefLoading(true);
                          try {
                            const res = await apiFetch<typeof brief>(
                              `/api/ai/business-brief/${encodeURIComponent(business.slug)}`
                            );
                            setBrief(res);
                          } catch {
                            pushToast({ title: 'Could not load neighborhood brief', variant: 'error' });
                          } finally {
                            setBriefLoading(false);
                          }
                        }}
                        className="min-h-[36px] px-4 rounded-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold disabled:opacity-50"
                      >
                        {briefLoading ? 'Loading...' : 'Load Maps Context'}
                      </button>
                    )}
                  </div>

                  {brief?.maps?.text && (
                    <p className="text-xs text-slate-600 dark:text-slate-300 whitespace-pre-line leading-relaxed bg-slate-50 dark:bg-slate-950 p-3.5 rounded-xl">
                      {brief.maps.text}
                    </p>
                  )}
                  {brief?.maps?.mapPlaces && brief.maps.mapPlaces.length > 0 && (
                    <div className="grid sm:grid-cols-2 gap-2.5">
                      {brief.maps.mapPlaces.map((pl) => (
                        <a
                          key={pl.uri}
                          href={pl.uri}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-blue-500 flex items-center justify-between gap-2 text-xs font-semibold text-blue-600 dark:text-blue-400"
                        >
                          <span className="truncate">{pl.title}</span>
                          <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </motion.section>
            )}
          </AnimatePresence>
        </div>

        {/* Desktop Sticky Storefront Context Rail */}
        <aside className="hidden lg:block lg:col-span-4 py-5 space-y-4 sticky top-4">
          {/* Quick Location & Hours Card */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-display text-sm font-bold">Storefront Info</h3>
              <span
                className={`text-xs font-semibold ${
                  business.isOpenNow
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-slate-500'
                }`}
              >
                {business.isOpenNow ? 'Open now' : 'Closed'} · {getTodayHoursLabel(business.hours)}
              </span>
            </div>

            <LeafletMap
              center={[business.lat, business.lng]}
              zoom={15}
              markers={[
                {
                  id: business.id,
                  lat: business.lat,
                  lng: business.lng,
                  title: business.name,
                  subtitle: business.addressLine || business.city || '',
                },
              ]}
              className="h-44 w-full rounded-xl"
            />

            {fullAddress && (
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                {fullAddress}
              </p>
            )}

            <div className="grid grid-cols-2 gap-2">
              <a
                href={directionsUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => trackAnalyticsEvent(business.id, 'directions_click')}
                className="min-h-[40px] rounded-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center justify-center gap-1.5"
              >
                <MapPin className="w-3.5 h-3.5" />
                <span>Directions</span>
              </a>
              <button
                type="button"
                onClick={() => setChatOpen(true)}
                className="min-h-[40px] rounded-full border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-bold flex items-center justify-center gap-1.5"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                <span>Live Chat</span>
              </button>
            </div>
          </div>

          {/* Featured Catalogue Preview */}
          {products.length > 0 && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-sm font-bold flex items-center gap-1.5">
                  <ShoppingBag className="w-4 h-4 text-blue-500" />
                  <span>Popular Offerings</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setTab('products')}
                  className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                >
                  View all
                </button>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {products.slice(0, 3).map((prod) => (
                  <Link
                    key={prod.id}
                    to={`/b/${business.slug}/p/${prod.id}`}
                    className="py-2.5 flex items-center gap-3 hover:opacity-85 transition-opacity"
                  >
                    <div className="w-12 h-12 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 shrink-0">
                      <SafeImage
                        src={prod.images?.[0] || business.logoUrl}
                        alt={prod.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                        {prod.name}
                      </p>
                      <p className="text-xs text-slate-500 tabular-nums mt-0.5">
                        ₹{Number(prod.discountPrice ?? prod.price).toLocaleString()}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>

      {/* Instagram-Style Story / Highlights Fullscreen Viewer */}
      <AnimatePresence>
        {storyOpenIdx !== null && posts[storyOpenIdx] && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-0 sm:p-4"
          >
            <div className="relative w-full max-w-md h-full sm:h-[85vh] sm:rounded-3xl overflow-hidden bg-slate-950 flex flex-col justify-between">
              {/* Story Progress Bars */}
              <div className="absolute top-0 inset-x-0 z-20 p-3 space-y-2.5 bg-gradient-to-b from-black/75 to-transparent">
                <div className="flex gap-1">
                  {posts.slice(0, 6).map((_, i) => (
                    <div
                      key={i}
                      className="flex-1 h-0.5 rounded-full bg-white/30 overflow-hidden"
                    >
                      <div
                        className={`h-full bg-white transition-all ${
                          i < storyOpenIdx
                            ? 'w-full'
                            : i === storyOpenIdx
                              ? 'w-full duration-[5000ms] ease-linear'
                              : 'w-0'
                        }`}
                      />
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between text-white">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-full overflow-hidden border border-white/40 shrink-0">
                      <SafeImage
                        src={business.logoUrl || business.coverUrl}
                        alt={business.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold truncate flex items-center gap-1">
                        <span>{business.name}</span>
                        {business.isVerified && <BadgeCheck className="w-3.5 h-3.5 text-blue-400" />}
                      </p>
                      <p className="text-[11px] text-white/70">
                        {new Date(posts[storyOpenIdx].createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setStoryOpenIdx(null)}
                    aria-label="Close story"
                    className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-full hover:bg-white/10"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Media */}
              <div className="flex-1 flex items-center justify-center relative">
                {posts[storyOpenIdx].type === 'video' ? (
                  <video
                    src={posts[storyOpenIdx].mediaUrl}
                    poster={posts[storyOpenIdx].posterUrl || undefined}
                    controls
                    autoPlay
                    playsInline
                    onLoadedMetadata={(e) => {
                      const p = posts[storyOpenIdx];
                      if (typeof p.trimStartSec === 'number' && p.trimStartSec > 0) {
                        e.currentTarget.currentTime = p.trimStartSec;
                      }
                    }}
                    onTimeUpdate={(e) => {
                      const p = posts[storyOpenIdx];
                      const start = typeof p.trimStartSec === 'number' ? p.trimStartSec : 0;
                      const end = typeof p.trimEndSec === 'number' && p.trimEndSec > start ? p.trimEndSec : 0;
                      if (end > 0 && e.currentTarget.currentTime >= end) {
                        e.currentTarget.currentTime = start;
                      }
                    }}
                    className="max-h-full w-full object-contain"
                  />
                ) : (
                  <SafeImage
                    src={posts[storyOpenIdx].mediaUrl}
                    alt={posts[storyOpenIdx].caption || business.name}
                    className="max-h-full w-full object-contain"
                  />
                )}
                {/* Tap Left / Right Navigation */}
                <button
                  type="button"
                  aria-label="Previous story"
                  onClick={() => setStoryOpenIdx((i) => (i !== null && i > 0 ? i - 1 : i))}
                  className="absolute inset-y-16 left-0 w-1/3"
                />
                <button
                  type="button"
                  aria-label="Next story"
                  onClick={() =>
                    setStoryOpenIdx((i) =>
                      i !== null && i < Math.min(posts.length, 6) - 1 ? i + 1 : null
                    )
                  }
                  className="absolute inset-y-16 right-0 w-1/3"
                />
              </div>

              {/* Caption + Quick Action Footer */}
              <div className="p-4 bg-gradient-to-t from-black/85 via-black/50 to-transparent text-white space-y-3">
                {posts[storyOpenIdx].caption && (
                  <p className="text-xs sm:text-sm leading-relaxed">
                    {posts[storyOpenIdx].caption}
                  </p>
                )}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setStoryOpenIdx(null);
                      setEnquiryProductId(null);
                      setEnquiryOpen(true);
                    }}
                    className="flex-1 min-h-[40px] rounded-full bg-white text-slate-900 text-xs font-bold"
                  >
                    Send Enquiry
                  </button>
                  <a
                    href={directionsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 min-h-[40px] rounded-full bg-white/15 backdrop-blur text-white text-xs font-bold flex items-center justify-center"
                  >
                    Get Location
                  </a>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Post Lightbox Modal Viewer with Live Firestore Comments */}
      {activePostIdx !== null && posts[activePostIdx] && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-4xl w-full overflow-hidden grid md:grid-cols-12 relative max-h-[90vh]">
            <button
              type="button"
              onClick={() => setActivePostIdx(null)}
              aria-label="Close post viewer"
              className="absolute top-3 right-3 z-10 w-9 h-9 rounded-full bg-black/60 text-white flex items-center justify-center"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="md:col-span-7 bg-black flex items-center justify-center relative min-h-[280px] sm:min-h-[420px]">
              {posts[activePostIdx].type === 'video' ? (
                <video
                  src={posts[activePostIdx].mediaUrl}
                  poster={posts[activePostIdx].posterUrl || undefined}
                  controls
                  autoPlay
                  onLoadedMetadata={(e) => {
                    const p = posts[activePostIdx];
                    if (typeof p.trimStartSec === 'number' && p.trimStartSec > 0) {
                      e.currentTarget.currentTime = p.trimStartSec;
                    }
                  }}
                  onTimeUpdate={(e) => {
                    const p = posts[activePostIdx];
                    const start = typeof p.trimStartSec === 'number' ? p.trimStartSec : 0;
                    const end = typeof p.trimEndSec === 'number' && p.trimEndSec > start ? p.trimEndSec : 0;
                    if (end > 0 && e.currentTarget.currentTime >= end) {
                      e.currentTarget.currentTime = start;
                    }
                  }}
                  className="max-h-[70vh] w-full"
                />
              ) : (
                <SafeImage
                  src={posts[activePostIdx].mediaUrl}
                  alt={posts[activePostIdx].caption || business.name}
                  className="max-h-[70vh] w-full object-contain"
                />
              )}

              {activePostIdx > 0 && (
                <button
                  type="button"
                  onClick={() => setActivePostIdx((i) => (i !== null ? i - 1 : null))}
                  aria-label="Previous post"
                  className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/60 text-white flex items-center justify-center"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
              )}
              {activePostIdx < posts.length - 1 && (
                <button
                  type="button"
                  onClick={() => setActivePostIdx((i) => (i !== null ? i + 1 : null))}
                  aria-label="Next post"
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/60 text-white flex items-center justify-center"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              )}
            </div>

            <div className="md:col-span-5 flex flex-col max-h-[45vh] md:max-h-[75vh]">
              <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full overflow-hidden shrink-0">
                  <SafeImage
                    src={business.logoUrl || business.coverUrl}
                    alt={business.name}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="min-w-0">
                  <p className="font-display text-sm font-bold truncate flex items-center gap-1">
                    <span>{business.name}</span>
                    {business.isVerified && <BadgeCheck className="w-3.5 h-3.5 text-blue-500" />}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    {new Date(posts[activePostIdx].createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {posts[activePostIdx].caption && (
                  <p className="text-sm text-slate-800 dark:text-slate-200 leading-relaxed">
                    {posts[activePostIdx].caption}
                  </p>
                )}

                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
                  <p className="text-xs font-semibold text-slate-500">
                    Comments ({lightboxComments.length})
                  </p>
                  {lightboxComments.length === 0 ? (
                    <p className="text-xs text-slate-400">No comments yet. Start the conversation.</p>
                  ) : (
                    lightboxComments.map((c) => (
                      <div key={c.id} className="flex items-start gap-2 text-xs">
                        {c.authorAvatar ? (
                          <img
                            src={c.authorAvatar}
                            alt={c.authorName}
                            className="w-5 h-5 rounded-full object-cover shrink-0 mt-0.5"
                          />
                        ) : (
                          <div className="w-5 h-5 rounded-full bg-slate-200 dark:bg-slate-800 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                            {(c.authorName || 'M')[0].toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0">
                          <span className="font-bold text-slate-900 dark:text-white mr-1.5">
                            {c.authorName}
                          </span>
                          <span className="text-slate-700 dark:text-slate-300 break-words">{c.text}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="p-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
                <form onSubmit={handleAddLightboxComment} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={commentDraft}
                    onChange={(e) => setCommentDraft(e.target.value)}
                    placeholder={profile ? 'Add a comment...' : 'Sign in to comment'}
                    className="flex-1 h-9 px-3 rounded-full bg-slate-100 dark:bg-slate-800 text-xs focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={commentSending || !commentDraft.trim()}
                    aria-label="Send comment"
                    className="w-9 h-9 rounded-full bg-blue-600 text-white flex items-center justify-center disabled:opacity-40"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </form>

                <div className="flex items-center justify-between text-xs text-slate-400 px-1">
                  <button
                    type="button"
                    onClick={() => void toggleLike(toUnifiedPost(posts[activePostIdx]))}
                    className={`inline-flex items-center gap-1 ${
                      likedPostIds.has(posts[activePostIdx].id) ? 'text-rose-500 font-semibold' : ''
                    }`}
                  >
                    <Heart
                      className={`w-3.5 h-3.5 ${
                        likedPostIds.has(posts[activePostIdx].id) ? 'fill-current' : ''
                      }`}
                    />
                    <span>{toUnifiedPost(posts[activePostIdx]).likesCount} likes</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const id = posts[activePostIdx].id;
                      setActivePostIdx(null);
                      setReportTarget({ type: 'post', id });
                      setReportOpen(true);
                    }}
                    className="hover:text-red-500"
                  >
                    Report post
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cover Image Lightbox */}
      {coverViewerOpen && (
        <div
          onClick={() => setCoverViewerOpen(false)}
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <button
            type="button"
            onClick={() => setCoverViewerOpen(false)}
            aria-label="Close cover photo"
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
          <SafeImage
            src={business.coverUrl || business.logoUrl}
            alt={business.name}
            className="max-h-[85vh] max-w-4xl w-full object-contain rounded-2xl"
          />
        </div>
      )}

      {/* Enquiry Modal / Mobile Bottom Sheet */}
      <AnimatePresence>
        {enquiryOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
            onClick={() => setEnquiryOpen(false)}
          >
            <motion.form
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              onClick={(e) => e.stopPropagation()}
              onSubmit={handleSendEnquiry}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-t-3xl sm:rounded-2xl max-w-md w-full p-6 space-y-4"
            >
              <div className="sm:hidden w-10 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto -mt-2" />
              <div className="flex items-center justify-between">
                <h3 className="font-display text-lg font-bold">Enquire with {business.name}</h3>
                <button
                  type="button"
                  onClick={() => setEnquiryOpen(false)}
                  className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              </div>
              <input
                type="text"
                required
                placeholder="Your name"
                value={enqForm.name}
                onChange={(e) => setEnqForm({ ...enqForm, name: e.target.value })}
                className="w-full h-11 px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
              />
              <input
                type="tel"
                required
                placeholder="Phone or WhatsApp number"
                value={enqForm.phone}
                onChange={(e) => setEnqForm({ ...enqForm, phone: e.target.value })}
                className="w-full h-11 px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
              />
              <textarea
                rows={3}
                required
                placeholder="What would you like to ask?"
                value={enqForm.message}
                onChange={(e) => setEnqForm({ ...enqForm, message: e.target.value })}
                className="w-full p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
              />
              <button
                type="submit"
                disabled={enqSending}
                className="w-full min-h-[44px] rounded-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold"
              >
                {enqSending ? 'Sending...' : 'Send Enquiry'}
              </button>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Report Modal / Mobile Bottom Sheet */}
      <AnimatePresence>
        {reportOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
            onClick={() => setReportOpen(false)}
          >
            <motion.form
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              onClick={(e) => e.stopPropagation()}
              onSubmit={handleReportSubmit}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-t-3xl sm:rounded-2xl max-w-md w-full p-6 space-y-4"
            >
              <div className="sm:hidden w-10 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto -mt-2" />
              <div className="flex items-center justify-between">
                <h3 className="font-display text-lg font-bold">Report content</h3>
                <button
                  type="button"
                  onClick={() => setReportOpen(false)}
                  className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              </div>
              <select
                value={reportForm.reason}
                onChange={(e) => setReportForm({ ...reportForm, reason: e.target.value })}
                className="w-full h-11 px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
              >
                <option value="Incorrect info">Incorrect address, phone, or hours</option>
                <option value="Spam or misleading">Spam or misleading listing</option>
                <option value="Inappropriate content">Inappropriate or offensive content</option>
                <option value="Closed permanently">Business closed permanently</option>
              </select>
              <textarea
                rows={3}
                placeholder="Additional details (optional)"
                value={reportForm.details}
                onChange={(e) => setReportForm({ ...reportForm, details: e.target.value })}
                className="w-full p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
              />
              <button
                type="submit"
                className="w-full min-h-[44px] rounded-full bg-red-600 hover:bg-red-700 text-white text-sm font-bold"
              >
                Submit Report
              </button>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>

      <StorefrontChatDrawer
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        business={business}
      />
    </div>
  );
};
