import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  BadgeCheck,
  Bookmark,
  Check,
  ChevronDown,
  ChevronUp,
  Compass,
  Heart,
  MapPin,
  MessageCircle,
  Pause,
  Play,
  Plus,
  Send,
  ShoppingBag,
  Store,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useAuth } from '../context/AuthContext';
import { useRealtime } from '../context/RealtimeContext';
import { useSocial, type UnifiedFeedPost } from '../context/SocialContext';
import { trackAnalyticsEvent } from '../lib/api';
import { buildGoogleMapsDirectionsUrl } from '../lib/maps';
import {
  addPostCommentAtomic,
  subscribePostComments,
  type FirestoreComment,
} from '../lib/socialFirestore';
import { SafeImage } from './BusinessCard';
import { Link, navigate } from './RouterLink';
import { StorefrontChatDrawer } from './StorefrontChatDrawer';

export interface ReelsViewerProps {
  posts?: UnifiedFeedPost[];
  initialPostId?: string;
  onClose?: () => void;
  mode?: 'page' | 'modal';
}

interface RenderedReelItem {
  renderKey: string;
  cycle: number;
  post: UnifiedFeedPost;
}

interface HeartBurst {
  id: number;
  x: number;
  y: number;
}

type FeedMode = 'for_you' | 'videos' | 'nearby';

const QUICK_REACTIONS = ['🔥', '❤️', '🙌', '📍', '✨'];

function formatCompactCount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(value);
}

interface ReelSlideProps {
  item: RenderedReelItem;
  isActive: boolean;
  muted: boolean;
  isLiked: boolean;
  isFollowing: boolean;
  isSaved: boolean;
  commentsOpen: boolean;
  onVisible: (index: number, postId: string) => void;
  index: number;
  onToggleLike: (post: UnifiedFeedPost) => Promise<void>;
  onEnsureLiked: (post: UnifiedFeedPost) => Promise<void>;
  onOpenComments: (post: UnifiedFeedPost) => void;
  onToggleFollow: (post: UnifiedFeedPost) => Promise<void>;
  onToggleSave: (post: UnifiedFeedPost) => Promise<void>;
  onShare: (post: UnifiedFeedPost) => Promise<void>;
  onOpenChat: (post: UnifiedFeedPost) => void;
  onToggleMute: () => void;
}

const ReelSlide: React.FC<ReelSlideProps> = ({
  item,
  isActive,
  muted,
  isLiked,
  isFollowing,
  isSaved,
  commentsOpen,
  onVisible,
  index,
  onToggleLike,
  onEnsureLiked,
  onOpenComments,
  onToggleFollow,
  onToggleSave,
  onShare,
  onOpenChat,
  onToggleMute,
}) => {
  const { post } = item;
  const slideRef = useRef<HTMLElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const tapTimerRef = useRef<number | null>(null);
  const lastTapRef = useRef<number>(0);

  const [paused, setPaused] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const [progress, setProgress] = useState(0);
  const [captionExpanded, setCaptionExpanded] = useState(false);
  const [tapFeedback, setTapFeedback] = useState<'play' | 'pause' | null>(null);
  const [bursts, setBursts] = useState<HeartBurst[]>([]);

  const trimStart = typeof post.trimStartSec === 'number' && post.trimStartSec > 0 ? post.trimStartSec : 0;

  // Reset paused/failed state when slide leaves active view
  useEffect(() => {
    if (!isActive) {
      setPaused(false);
      setTapFeedback(null);
      if (videoRef.current) {
        videoRef.current.pause();
        try {
          videoRef.current.currentTime = trimStart;
        } catch {
          // Ignore seek reset if metadata not loaded yet
        }
      }
      setProgress(0);
    }
  }, [isActive, trimStart]);

  // Observe visibility to trigger autoplay + hydrate likes
  useEffect(() => {
    const el = slideRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.65) {
            onVisible(index, post.id);
          }
        }
      },
      { threshold: [0.65] }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [index, post.id, onVisible]);

  // Play / pause HTML5 video strictly based on active visibility + user tap pause
  useEffect(() => {
    const video = videoRef.current;
    if (!video || post.mediaType !== 'video' || videoFailed) return;
    if (isActive && !paused) {
      void video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, [isActive, paused, post.mediaType, videoFailed]);

  useEffect(() => {
    return () => {
      if (tapTimerRef.current) window.clearTimeout(tapTimerRef.current);
    };
  }, []);

  const spawnBurst = useCallback((x: number, y: number) => {
    const id = Date.now() + Math.random();
    setBursts((prev) => [...prev.slice(-4), { id, x, y }]);
    window.setTimeout(() => {
      setBursts((prev) => prev.filter((b) => b.id !== id));
    }, 750);
  }, []);

  const handleStageTap = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const now = Date.now();

    if (now - lastTapRef.current < 240) {
      if (tapTimerRef.current) {
        window.clearTimeout(tapTimerRef.current);
        tapTimerRef.current = null;
      }
      lastTapRef.current = 0;
      spawnBurst(x, y);
      void onEnsureLiked(post);
      return;
    }

    lastTapRef.current = now;
    tapTimerRef.current = window.setTimeout(() => {
      setPaused((prev) => {
        const next = !prev;
        setTapFeedback(next ? 'pause' : 'play');
        window.setTimeout(() => setTapFeedback(null), 550);
        return next;
      });
      tapTimerRef.current = null;
    }, 240);
  };

  const handleScrub = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const video = videoRef.current;
    if (!video || !video.duration || Number.isNaN(video.duration)) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const end =
      typeof post.trimEndSec === 'number' && post.trimEndSec > trimStart
        ? Math.min(post.trimEndSec, video.duration)
        : video.duration;
    const span = Math.max(0.5, end - trimStart);
    video.currentTime = trimStart + ratio * span;
    setProgress(ratio * 100);
  };

  const directionsUrl =
    post.lat !== undefined && post.lng !== undefined
      ? buildGoogleMapsDirectionsUrl(post.lat, post.lng, post.googleMapsUrl)
      : post.googleMapsUrl || `/b/${post.businessSlug}`;

  const locationSummary = [post.area, post.city].filter(Boolean).join(', ');
  const distanceLabel =
    post.distanceKm !== null && post.distanceKm !== undefined
      ? post.distanceKm < 1
        ? `${Math.round(post.distanceKm * 1000)} m`
        : `${post.distanceKm.toFixed(1)} km`
      : null;

  const isPhotoSlide = post.mediaType !== 'video' || videoFailed;

  return (
    <section
      ref={slideRef}
      data-reel-index={index}
      className="snap-start snap-always relative w-full h-full shrink-0 flex items-center justify-center bg-neutral-950 select-none overflow-hidden"
    >
      {/* Ambient Desktop Theater Blur Backdrop */}
      <div className="hidden md:block absolute inset-0 overflow-hidden pointer-events-none opacity-35">
        <SafeImage
          src={post.posterUrl || post.mediaUrl}
          alt=""
          className="w-full h-full object-cover scale-125 blur-3xl saturate-150"
        />
        <div className="absolute inset-0 bg-neutral-950/60" />
      </div>

      {/* Main 9:16 Vertical Media Frame (Full-bleed on Mobile, Centered Theater Frame on Desktop) */}
      <div
        onClick={handleStageTap}
        className="relative w-full h-full md:w-auto md:aspect-[9/16] md:h-[calc(100vh-2rem)] md:max-h-[900px] md:rounded-2xl overflow-hidden bg-black md:border md:border-white/15 md:shadow-2xl cursor-pointer"
      >
        {/* Blurred fill under non-9:16 photos or video fallback */}
        <div className="absolute inset-0 pointer-events-none opacity-45">
          <SafeImage
            src={post.posterUrl || post.mediaUrl}
            alt=""
            className="w-full h-full object-cover scale-110 blur-2xl"
          />
        </div>

        {/* Video or Animated Photo Surface */}
        {!isPhotoSlide ? (
          <video
            ref={videoRef}
            src={post.mediaUrl}
            poster={post.posterUrl || post.businessLogo || undefined}
            loop
            muted={muted}
            playsInline
            preload={isActive ? 'auto' : 'metadata'}
            onLoadedMetadata={(e) => {
              const v = e.currentTarget;
              if (trimStart > 0) v.currentTime = trimStart;
            }}
            onTimeUpdate={(e) => {
              const v = e.currentTarget;
              if (v.duration && !Number.isNaN(v.duration)) {
                const end =
                  typeof post.trimEndSec === 'number' && post.trimEndSec > trimStart
                    ? Math.min(post.trimEndSec, v.duration)
                    : v.duration;
                if (end > trimStart && v.currentTime >= end) {
                  v.currentTime = trimStart;
                }
                const span = Math.max(0.5, end - trimStart);
                const pct = Math.min(100, Math.max(0, ((v.currentTime - trimStart) / span) * 100));
                setProgress(pct);
              }
            }}
            onError={() => setVideoFailed(true)}
            className="relative z-10 w-full h-full object-cover"
          />
        ) : (
          <motion.div
            animate={
              isActive && !paused
                ? { scale: [1, 1.07] }
                : { scale: 1 }
            }
            transition={{ duration: 9, ease: 'linear' }}
            className="relative z-10 w-full h-full flex items-center justify-center"
          >
            <SafeImage
              src={post.mediaType === 'video' ? post.posterUrl || post.businessLogo || post.mediaUrl : post.mediaUrl}
              alt={post.caption || post.businessName}
              className="w-full h-full object-cover"
            />
          </motion.div>
        )}

        {/* Measured Contrast Scrims */}
        <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/65 via-black/25 to-transparent pointer-events-none z-10" />
        <div className="absolute inset-x-0 bottom-0 h-72 bg-gradient-to-t from-black/90 via-black/50 to-transparent pointer-events-none z-10" />

        {/* Single-Tap Play/Pause Status Pulse */}
        <AnimatePresence>
          {tapFeedback && (
            <motion.div
              key={tapFeedback}
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.15 }}
              transition={{ duration: 0.18 }}
              className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none"
            >
              <div className="w-16 h-16 rounded-full bg-black/55 backdrop-blur-md text-white flex items-center justify-center border border-white/20">
                {tapFeedback === 'pause' ? (
                  <Pause className="w-7 h-7 fill-white" />
                ) : (
                  <Play className="w-7 h-7 fill-white ml-0.5" />
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Paused persistent indicator when paused explicitly */}
        {paused && !tapFeedback && (
          <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
            <div className="w-16 h-16 rounded-full bg-black/45 backdrop-blur-sm text-white/95 flex items-center justify-center border border-white/20">
              <Play className="w-7 h-7 fill-white ml-0.5" />
            </div>
          </div>
        )}

        {/* Double-Tap Coordinate Heart Bursts */}
        <AnimatePresence>
          {bursts.map((burst) => (
            <motion.div
              key={burst.id}
              initial={{ opacity: 0, scale: 0.4, rotate: -14 }}
              animate={{ opacity: [0, 1, 1, 0], scale: [0.4, 1.25, 1.05, 1.45], rotate: [-14, 8, -4, 0], y: -28 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.68, ease: [0.16, 1, 0.3, 1] }}
              style={{ left: burst.x - 44, top: burst.y - 44 }}
              className="absolute z-30 pointer-events-none"
            >
              <Heart className="w-[88px] h-[88px] text-rose-500 fill-rose-500 drop-shadow-[0_10px_28px_rgba(244,63,94,0.65)]" />
            </motion.div>
          ))}
        </AnimatePresence>

        {/* TikTok-Style Right Thumb-Zone Action Column */}
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute right-2.5 sm:right-3.5 bottom-6 sm:bottom-8 z-30 flex flex-col items-center gap-3.5 text-white"
        >
          {/* Business Avatar + Quick Follow Badge */}
          <div className="relative mb-1.5">
            <Link
              to={`/b/${post.businessSlug}`}
              aria-label={`Visit ${post.businessName}`}
              className="block w-12 h-12 rounded-full p-[2px] bg-gradient-to-tr from-amber-400 via-rose-500 to-violet-500 shadow-lg"
            >
              <div className="w-full h-full rounded-full overflow-hidden bg-neutral-900 border border-black">
                <SafeImage
                  src={post.businessLogo || post.posterUrl || post.mediaUrl}
                  alt={post.businessName}
                  className="w-full h-full object-cover"
                />
              </div>
            </Link>
            <button
              type="button"
              onClick={() => void onToggleFollow(post)}
              aria-label={isFollowing ? `Unfollow ${post.businessName}` : `Follow ${post.businessName}`}
              className={`absolute -bottom-2 left-1/2 -translate-x-1/2 w-6 h-6 rounded-full flex items-center justify-center shadow-md border border-neutral-950 transition-transform active:scale-90 ${
                isFollowing ? 'bg-white text-neutral-950' : 'bg-rose-500 text-white'
              }`}
            >
              {isFollowing ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : <Plus className="w-3.5 h-3.5 stroke-[3]" />}
            </button>
          </div>

          {/* Like Button */}
          <motion.button
            type="button"
            whileTap={{ scale: 0.85 }}
            onClick={() => void onToggleLike(post)}
            aria-label={isLiked ? 'Unlike reel' : 'Like reel'}
            className="min-w-[44px] min-h-[44px] flex flex-col items-center justify-center gap-1"
          >
            <motion.div
              animate={isLiked ? { scale: [1, 1.28, 1] } : { scale: 1 }}
              transition={{ duration: 0.28 }}
              className="w-11 h-11 rounded-full bg-black/35 backdrop-blur-sm border border-white/10 flex items-center justify-center"
            >
              <Heart
                className={`w-6 h-6 transition-colors ${
                  isLiked ? 'fill-rose-500 text-rose-500' : 'text-white'
                }`}
              />
            </motion.div>
            <span className="text-[11px] font-semibold tabular-nums drop-shadow">
              {formatCompactCount(post.likesCount)}
            </span>
          </motion.button>

          {/* Interactive Comment Button */}
          <motion.button
            type="button"
            whileTap={{ scale: 0.88 }}
            onClick={() => onOpenComments(post)}
            aria-label="Open comments"
            className="min-w-[44px] min-h-[44px] flex flex-col items-center justify-center gap-1"
          >
            <div
              className={`w-11 h-11 rounded-full backdrop-blur-sm border flex items-center justify-center transition-colors ${
                commentsOpen
                  ? 'bg-white text-neutral-950 border-white'
                  : 'bg-black/35 text-white border-white/10'
              }`}
            >
              <MessageCircle className="w-6 h-6" />
            </div>
            <span className="text-[11px] font-semibold tabular-nums drop-shadow">
              {formatCompactCount(post.commentsCount)}
            </span>
          </motion.button>

          {/* Bookmark / Save Button */}
          <motion.button
            type="button"
            whileTap={{ scale: 0.88 }}
            onClick={() => void onToggleSave(post)}
            aria-label={isSaved ? 'Remove bookmark' : 'Save reel'}
            className="min-w-[44px] min-h-[44px] flex flex-col items-center justify-center gap-1"
          >
            <div className="w-11 h-11 rounded-full bg-black/35 backdrop-blur-sm border border-white/10 flex items-center justify-center">
              <Bookmark
                className={`w-5 h-5 ${isSaved ? 'fill-amber-400 text-amber-400' : 'text-white'}`}
              />
            </div>
            <span className="text-[10px] font-medium text-white/85 drop-shadow">
              {isSaved ? 'Saved' : 'Save'}
            </span>
          </motion.button>

          {/* Share Button */}
          <motion.button
            type="button"
            whileTap={{ scale: 0.88 }}
            onClick={() => void onShare(post)}
            aria-label="Share reel"
            className="min-w-[44px] min-h-[44px] flex flex-col items-center justify-center gap-1"
          >
            <div className="w-11 h-11 rounded-full bg-black/35 backdrop-blur-sm border border-white/10 flex items-center justify-center">
              <Send className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-medium text-white/85 drop-shadow">Share</span>
          </motion.button>

          {/* Maps Directions Button */}
          <a
            href={directionsUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackAnalyticsEvent(post.businessId, 'directions_click')}
            aria-label={`Get directions to ${post.businessName}`}
            className="min-w-[44px] min-h-[44px] flex flex-col items-center justify-center gap-1"
          >
            <div className="w-11 h-11 rounded-full bg-black/35 backdrop-blur-sm border border-white/10 flex items-center justify-center">
              <MapPin className="w-5 h-5 text-emerald-400" />
            </div>
            <span className="text-[10px] font-medium text-white/85 drop-shadow">Map</span>
          </a>

          {/* Sound Quick Toggle for Video Slides */}
          {!isPhotoSlide && (
            <button
              type="button"
              onClick={onToggleMute}
              aria-label={muted ? 'Unmute audio' : 'Mute audio'}
              className="md:hidden w-10 h-10 rounded-full bg-black/45 backdrop-blur-sm border border-white/10 flex items-center justify-center text-white"
            >
              {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
          )}
        </div>

        {/* Bottom Storefront Overlay (Clean Unboxed Metadata & Interactive Actions) */}
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute left-3.5 right-16 sm:left-4 sm:right-20 bottom-5 z-30 text-white space-y-2.5"
        >
          {/* Business Header + Inline Follow */}
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              to={`/b/${post.businessSlug}`}
              className="inline-flex items-center gap-1.5 font-display text-[15px] font-bold tracking-tight hover:underline min-w-0"
            >
              <span className="truncate max-w-[190px] sm:max-w-[240px]">{post.businessName}</span>
              {post.businessVerified && (
                <BadgeCheck className="w-4 h-4 text-sky-400 shrink-0" />
              )}
            </Link>
            <span aria-hidden="true" className="text-white/40">
              ·
            </span>
            <button
              type="button"
              onClick={() => void onToggleFollow(post)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                isFollowing
                  ? 'bg-white/20 text-white hover:bg-white/30'
                  : 'bg-white text-neutral-950 hover:bg-white/90'
              }`}
            >
              {isFollowing ? 'Following' : 'Follow'}
            </button>
          </div>

          {/* Unboxed Metadata Line (Category · Location · Distance · Status) */}
          <div className="flex items-center gap-1.5 flex-wrap text-xs text-white/80">
            <span>{post.categoryName}</span>
            {locationSummary && (
              <>
                <span aria-hidden="true">·</span>
                <span className="truncate max-w-[150px]">{locationSummary}</span>
              </>
            )}
            {distanceLabel && (
              <>
                <span aria-hidden="true">·</span>
                <span className="tabular-nums font-medium text-white">{distanceLabel}</span>
              </>
            )}
            {post.isOpenNow && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-emerald-300 font-medium">Open now</span>
              </>
            )}
          </div>

          {/* Expandable Caption */}
          {post.caption && (
            <div className="text-xs sm:text-[13px] text-white/95 leading-relaxed">
              <p className={captionExpanded ? '' : 'line-clamp-2'}>{post.caption}</p>
              {post.caption.length > 85 && (
                <button
                  type="button"
                  onClick={() => setCaptionExpanded((v) => !v)}
                  className="mt-0.5 text-[11px] font-semibold text-white/75 hover:text-white"
                >
                  {captionExpanded ? 'Show less' : 'more'}
                </button>
              )}
            </div>
          )}

          {/* Clickable Hashtags */}
          {post.tags && post.tags.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap text-xs text-sky-300">
              {post.tags.slice(0, 4).map((tag) => (
                <Link
                  key={tag}
                  to={`/search?q=${encodeURIComponent(tag)}`}
                  className="hover:underline"
                >
                  #{tag.replace(/\s+/g, '')}
                </Link>
              ))}
            </div>
          )}

          {/* Storefront + Shoppable Product CTA Row */}
          <div className="flex items-center gap-2 flex-wrap pt-0.5">
            {post.featuredProduct && (
              <Link
                to={`/b/${post.businessSlug}/p/${post.featuredProduct.id}`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/60 backdrop-blur-md border border-white/15 text-xs font-medium text-white hover:bg-black/80 transition-colors max-w-full"
              >
                <ShoppingBag className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                <span className="truncate max-w-[130px]">{post.featuredProduct.name}</span>
                <span className="font-bold tabular-nums shrink-0">
                  ₹{Number(post.featuredProduct.discountPrice || post.featuredProduct.price).toLocaleString()}
                </span>
              </Link>
            )}

            <button
              type="button"
              onClick={() => onOpenChat(post)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600/90 backdrop-blur-md border border-blue-400/30 text-xs font-semibold text-white hover:bg-blue-600 transition-colors whitespace-nowrap"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              <span>Message</span>
            </button>

            <Link
              to={`/b/${post.businessSlug}`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/15 backdrop-blur-md border border-white/15 text-xs font-semibold text-white hover:bg-white/25 transition-colors whitespace-nowrap"
            >
              <Store className="w-3.5 h-3.5" />
              <span>Storefront</span>
            </Link>
          </div>
        </div>

        {/* Video Scrubbing Progress Bar */}
        {!isPhotoSlide && (
          <div
            onClick={handleScrub}
            role="slider"
            aria-label="Video playback progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress)}
            className="absolute inset-x-0 bottom-0 h-3 z-30 flex items-end cursor-pointer group"
          >
            <div className="w-full h-[3px] group-hover:h-1.5 transition-all bg-white/20">
              <div
                className="h-full bg-white transition-[width] duration-150"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </section>
  );
};

export const ReelsViewer: React.FC<ReelsViewerProps> = ({
  posts: postsProp,
  initialPostId,
  onClose,
  mode = 'page',
}) => {
  const { firebaseUser, profile } = useAuth();
  const { pushToast } = useRealtime();
  const {
    feedPosts,
    loadingFeed,
    likedPostIds,
    followedBusinessIds,
    savedPostIds,
    toggleLike,
    hydratePostLike,
    toggleFollow,
    toggleSavePost,
    refreshSqlFeed,
  } = useSocial();

  const sourcePosts = postsProp ?? feedPosts;

  const [feedMode, setFeedMode] = useState<FeedMode>('for_you');
  const [muted, setMuted] = useState(true);
  const [cycles, setCycles] = useState(1);
  const [activeIndex, setActiveIndex] = useState(0);
  const [commentsPost, setCommentsPost] = useState<UnifiedFeedPost | null>(null);
  const [comments, setComments] = useState<FirestoreComment[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [chatPost, setChatPost] = useState<UnifiedFeedPost | null>(null);

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const commentInputRef = useRef<HTMLInputElement | null>(null);

  // Build sorted base reels stream using existing post data
  const baseReels = useMemo(() => {
    let ordered: UnifiedFeedPost[];

    if (feedMode === 'videos') {
      const onlyVideos = sourcePosts.filter((p) => p.mediaType === 'video');
      ordered = onlyVideos;
    } else if (feedMode === 'nearby') {
      ordered = [...sourcePosts].sort(
        (a, b) => (a.distanceKm ?? 99999) - (b.distanceKm ?? 99999)
      );
    } else {
      // For You: prioritize videos interleaved with rich storefront photos
      const videos = sourcePosts.filter((p) => p.mediaType === 'video');
      const photos = sourcePosts.filter((p) => p.mediaType !== 'video');
      const mixed: UnifiedFeedPost[] = [];
      let vIdx = 0;
      let pIdx = 0;
      while (vIdx < videos.length || pIdx < photos.length) {
        if (vIdx < videos.length) mixed.push(videos[vIdx++]);
        if (pIdx < photos.length) mixed.push(photos[pIdx++]);
        if (pIdx < photos.length) mixed.push(photos[pIdx++]);
      }
      ordered = mixed;
    }

    if (initialPostId) {
      const idx = ordered.findIndex((p) => p.id === initialPostId);
      if (idx > 0) {
        const picked = ordered[idx];
        return [picked, ...ordered.slice(0, idx), ...ordered.slice(idx + 1)];
      }
    }

    return ordered;
  }, [sourcePosts, feedMode, initialPostId]);

  // Expand endless infinite-scroll batches cleanly without hitting a dead end
  const renderedReels = useMemo<RenderedReelItem[]>(() => {
    if (baseReels.length === 0) return [];
    const items: RenderedReelItem[] = [];
    for (let c = 0; c < cycles; c++) {
      for (const post of baseReels) {
        items.push({
          renderKey: `${post.id}__cycle_${c}`,
          cycle: c,
          post,
        });
      }
    }
    return items;
  }, [baseReels, cycles]);

  // Infinite scroll trigger when approaching bottom of current cycle
  useEffect(() => {
    const sentinel = sentinelRef.current;
    const root = scrollerRef.current;
    if (!sentinel || !root || baseReels.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setCycles((c) => Math.min(c + 1, 25));
        }
      },
      { root, rootMargin: '600px' }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [baseReels.length]);

  useEffect(() => {
    if (baseReels.length > 0 && activeIndex >= renderedReels.length - 3) {
      setCycles((c) => Math.min(c + 1, 25));
    }
  }, [activeIndex, renderedReels.length, baseReels.length]);

  // Reset scroll position when switching filter tabs
  const handleSelectMode = (nextMode: FeedMode) => {
    setFeedMode(nextMode);
    setCycles(1);
    setActiveIndex(0);
    setCommentsPost(null);
    if (scrollerRef.current) {
      scrollerRef.current.scrollTo({ top: 0, behavior: 'auto' });
    }
  };

  const scrollToSlide = useCallback(
    (targetIdx: number) => {
      const container = scrollerRef.current;
      if (!container) return;
      const clamped = Math.max(0, Math.min(targetIdx, renderedReels.length - 1));
      const child = container.querySelector<HTMLElement>(`[data-reel-index="${clamped}"]`);
      if (child) {
        child.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    },
    [renderedReels.length]
  );

  // Keyboard navigation on desktop (ArrowUp / ArrowDown / M / Escape)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') {
        if (e.key === 'Escape') setCommentsPost(null);
        return;
      }
      if (e.key === 'ArrowDown' || e.key === 'j') {
        e.preventDefault();
        scrollToSlide(activeIndex + 1);
      } else if (e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault();
        scrollToSlide(activeIndex - 1);
      } else if (e.key.toLowerCase() === 'm') {
        setMuted((m) => !m);
      } else if (e.key === 'Escape') {
        if (commentsPost) setCommentsPost(null);
        else if (onClose) onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeIndex, scrollToSlide, commentsPost, onClose]);

  const handleSlideVisible = useCallback(
    (index: number, postId: string) => {
      setActiveIndex(index);
      void hydratePostLike(postId);
    },
    [hydratePostLike]
  );

  const handleEnsureLiked = useCallback(
    async (post: UnifiedFeedPost) => {
      if (!likedPostIds.has(post.id)) {
        await toggleLike(post);
      }
    },
    [likedPostIds, toggleLike]
  );

  const handleShare = useCallback(
    async (post: UnifiedFeedPost) => {
      trackAnalyticsEvent(post.businessId, 'share');
      const shareUrl = `${window.location.origin}/reels?post=${encodeURIComponent(post.id)}`;
      if (navigator.share) {
        try {
          await navigator.share({
            title: post.businessName,
            text: post.caption || `Watch ${post.businessName} on SoleWeb Reels`,
            url: shareUrl,
          });
          return;
        } catch {
          // Fallback to clipboard
        }
      }
      await navigator.clipboard?.writeText(shareUrl);
      pushToast({ title: 'Reel link copied' });
    },
    [pushToast]
  );

  // Real-time Firestore comments listener for the opened Reel
  useEffect(() => {
    if (!commentsPost) {
      setComments([]);
      setLoadingComments(false);
      return;
    }
    if (!commentsPost.inFirestore) {
      setComments([]);
      setLoadingComments(false);
      return;
    }
    setLoadingComments(true);
    const unsub = subscribePostComments(commentsPost.id, (items) => {
      setComments(items);
      setLoadingComments(false);
    });
    return () => unsub();
  }, [commentsPost]);

  // Keep commentsPost metadata synced with live likes/comments count updates from SocialContext
  const activeCommentsPost = useMemo(() => {
    if (!commentsPost) return null;
    return sourcePosts.find((p) => p.id === commentsPost.id) || commentsPost;
  }, [commentsPost, sourcePosts]);

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCommentsPost) return;
    if (!firebaseUser || !profile) {
      pushToast({ title: 'Sign in with Google to comment' });
      navigate('/login');
      return;
    }
    const clean = commentText.trim();
    if (!clean) return;
    setSubmittingComment(true);
    try {
      await addPostCommentAtomic(
        activeCommentsPost.id,
        firebaseUser.uid,
        profile.fullName || 'Customer',
        profile.avatarUrl,
        clean
      );
      setCommentText('');
    } catch (err) {
      pushToast({ title: 'Could not post comment right now', variant: 'error' });
      console.error(err);
    } finally {
      setSubmittingComment(false);
    }
  };

  if (loadingFeed && sourcePosts.length === 0) {
    return (
      <div className="w-full h-full bg-neutral-950 flex items-center justify-center p-4">
        <div className="w-full max-w-[420px] h-[82vh] rounded-3xl bg-neutral-900 border border-white/10 animate-pulse flex flex-col justify-between p-6">
          <div className="flex items-center justify-between">
            <div className="h-5 w-24 rounded-full bg-neutral-800" />
            <div className="h-9 w-9 rounded-full bg-neutral-800" />
          </div>
          <div className="space-y-3">
            <div className="h-4 w-44 rounded bg-neutral-800" />
            <div className="h-3 w-64 rounded bg-neutral-800" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`${
        mode === 'modal' ? 'fixed inset-0 z-50' : 'relative w-full h-full'
      } bg-neutral-950 text-white flex overflow-hidden`}
    >
      {/* Main Full-Screen Reels Column */}
      <div className="relative flex-1 h-full overflow-hidden">
        {/* Floating Glassmorphic Top Overlay Bar */}
        <header className="absolute top-0 inset-x-0 z-40 h-14 px-3 sm:px-5 flex items-center justify-between pointer-events-none">
          <div className="flex items-center gap-2 pointer-events-auto">
            <button
              type="button"
              onClick={() => (onClose ? onClose() : navigate('/'))}
              aria-label={onClose ? 'Close Reels' : 'Back to Home'}
              className="min-w-[44px] min-h-[44px] rounded-full bg-black/40 backdrop-blur-md border border-white/10 flex items-center justify-center text-white hover:bg-black/60 transition-colors"
            >
              {onClose ? <X className="w-5 h-5" /> : <ArrowLeft className="w-5 h-5" />}
            </button>
          </div>

          {/* Center Feed Mode Tabs (Underlined, single-line) */}
          <nav
            aria-label="Reels feed filter"
            className="pointer-events-auto flex items-center gap-5 px-4 py-1.5 rounded-full bg-black/35 backdrop-blur-md border border-white/10"
          >
            {(
              [
                ['for_you', 'For You'],
                ['videos', 'Videos'],
                ['nearby', 'Nearby'],
              ] as const
            ).map(([key, label]) => {
              const active = feedMode === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleSelectMode(key)}
                  className={`relative py-1 text-xs sm:text-sm font-semibold whitespace-nowrap transition-colors ${
                    active ? 'text-white' : 'text-white/60 hover:text-white/90'
                  }`}
                >
                  {label}
                  {active && (
                    <motion.span
                      layoutId="reelsActiveTabBar"
                      className="absolute left-0 right-0 -bottom-0.5 h-0.5 rounded-full bg-white"
                    />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Right Audio & Counter Controls */}
          <div className="flex items-center gap-2 pointer-events-auto">
            {renderedReels.length > 0 && (
              <span className="hidden sm:inline-block text-xs font-medium text-white/75 tabular-nums px-2.5 py-1 rounded-full bg-black/35 backdrop-blur-md border border-white/10">
                {(activeIndex % baseReels.length) + 1} / {baseReels.length}
              </span>
            )}
            <button
              type="button"
              onClick={() => setMuted((m) => !m)}
              aria-label={muted ? 'Unmute reels' : 'Mute reels'}
              className="min-w-[44px] min-h-[44px] rounded-full bg-black/40 backdrop-blur-md border border-white/10 flex items-center justify-center text-white hover:bg-black/60 transition-colors"
            >
              {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
            </button>
          </div>
        </header>

        {/* Empty State */}
        {renderedReels.length === 0 ? (
          <div className="w-full h-full flex flex-col items-center justify-center px-6 text-center">
            <Compass className="w-10 h-10 text-neutral-500 mb-3" />
            <h2 className="font-display text-lg font-bold text-white">
              {feedMode === 'videos' ? 'No video reels yet' : 'No storefront reels found'}
            </h2>
            <p className="mt-1.5 text-sm text-neutral-400 max-w-xs">
              {feedMode === 'videos'
                ? 'Switch to For You to browse business photos and videos together.'
                : 'Refresh the feed or explore local storefronts nearby.'}
            </p>
            <div className="mt-5 flex items-center gap-3">
              {feedMode !== 'for_you' ? (
                <button
                  type="button"
                  onClick={() => handleSelectMode('for_you')}
                  className="px-4 py-2.5 rounded-xl bg-white text-neutral-950 text-xs font-semibold hover:bg-neutral-200 transition-colors"
                >
                  Show All Reels
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void refreshSqlFeed()}
                  className="px-4 py-2.5 rounded-xl bg-white text-neutral-950 text-xs font-semibold hover:bg-neutral-200 transition-colors"
                >
                  Refresh Feed
                </button>
              )}
            </div>
          </div>
        ) : (
          /* Vertical Snap Scroller */
          <div
            ref={scrollerRef}
            className="w-full h-full overflow-y-scroll snap-y snap-mandatory no-scrollbar"
          >
            {renderedReels.map((item, idx) => (
              <ReelSlide
                key={item.renderKey}
                item={item}
                index={idx}
                isActive={idx === activeIndex}
                muted={muted}
                isLiked={likedPostIds.has(item.post.id)}
                isFollowing={followedBusinessIds.has(item.post.businessId)}
                isSaved={savedPostIds.has(item.post.id)}
                commentsOpen={activeCommentsPost?.id === item.post.id}
                onVisible={handleSlideVisible}
                onToggleLike={toggleLike}
                onEnsureLiked={handleEnsureLiked}
                onOpenComments={(p) =>
                  setCommentsPost((cur) => (cur?.id === p.id ? null : p))
                }
                onToggleFollow={(p) =>
                  toggleFollow({
                    id: p.businessId,
                    slug: p.businessSlug,
                    name: p.businessName,
                    logoUrl: p.businessLogo,
                  })
                }
                onToggleSave={toggleSavePost}
                onShare={handleShare}
                onOpenChat={(p) => setChatPost(p)}
                onToggleMute={() => setMuted((m) => !m)}
              />
            ))}
            <div ref={sentinelRef} className="h-px w-full" aria-hidden="true" />
          </div>
        )}

        {/* Desktop Up / Down Vertical Stepper Controls */}
        {renderedReels.length > 1 && (
          <div className="hidden md:flex flex-col gap-2.5 absolute right-6 top-1/2 -translate-y-1/2 z-30">
            <button
              type="button"
              onClick={() => scrollToSlide(activeIndex - 1)}
              disabled={activeIndex === 0}
              aria-label="Previous reel"
              className="w-11 h-11 rounded-full bg-white/10 backdrop-blur-md border border-white/15 flex items-center justify-center text-white hover:bg-white/20 disabled:opacity-30 transition-all"
            >
              <ChevronUp className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => scrollToSlide(activeIndex + 1)}
              aria-label="Next reel"
              className="w-11 h-11 rounded-full bg-white/10 backdrop-blur-md border border-white/15 flex items-center justify-center text-white hover:bg-white/20 transition-all"
            >
              <ChevronDown className="w-5 h-5" />
            </button>
          </div>
        )}
      </div>

      {/* Interactive TikTok-Style Comment Drawer (Slide-up Bottom Sheet on Mobile, Docked Side Panel on Desktop) */}
      <AnimatePresence>
        {activeCommentsPost && (
          <>
            {/* Mobile backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setCommentsPost(null)}
              className="lg:hidden fixed inset-0 z-40 bg-black/55 backdrop-blur-xs"
            />

            <motion.aside
              initial={{ y: '100%', opacity: 0.5 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: '100%', opacity: 0 }}
              transition={{ type: 'spring', damping: 28, stiffness: 320 }}
              aria-label="Reel comments"
              className="fixed inset-x-0 bottom-0 h-[72vh] rounded-t-3xl lg:static lg:h-full lg:w-[380px] xl:w-[410px] lg:rounded-none z-50 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border-t lg:border-t-0 lg:border-l border-slate-200 dark:border-slate-800 flex flex-col shrink-0 shadow-2xl"
            >
              {/* Mobile Drag Handle */}
              <div className="lg:hidden pt-2.5 pb-1 flex justify-center">
                <span className="w-10 h-1.5 rounded-full bg-slate-300 dark:bg-slate-700" />
              </div>

              {/* Drawer Header */}
              <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-display text-sm font-bold truncate">
                    Comments ({activeCommentsPost.commentsCount})
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    {activeCommentsPost.businessName}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setCommentsPost(null)}
                  aria-label="Close comments"
                  className="min-w-[40px] min-h-[40px] rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Scrollable Comment List */}
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3.5">
                {loadingComments ? (
                  <div className="space-y-3 py-2">
                    {[0, 1, 2].map((s) => (
                      <div key={s} className="flex items-start gap-2.5 animate-pulse">
                        <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-800 shrink-0" />
                        <div className="flex-1 space-y-1.5">
                          <div className="h-3 w-24 rounded bg-slate-200 dark:bg-slate-800" />
                          <div className="h-3 w-48 rounded bg-slate-200 dark:bg-slate-800" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : comments.length === 0 ? (
                  <div className="py-12 text-center space-y-1.5">
                    <MessageCircle className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-700" />
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                      No comments yet
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Start the conversation with {activeCommentsPost.businessName}.
                    </p>
                  </div>
                ) : (
                  comments.map((c) => (
                    <div key={c.id} className="flex items-start gap-2.5 text-xs">
                      {c.authorAvatar ? (
                        <img
                          src={c.authorAvatar}
                          alt={c.authorName}
                          referrerPolicy="no-referrer"
                          className="w-8 h-8 rounded-full object-cover shrink-0 mt-0.5"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                          {(c.authorName || 'M')[0].toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-slate-900 dark:text-white">
                          {c.authorName}
                        </p>
                        <p className="mt-0.5 text-[13px] text-slate-700 dark:text-slate-300 leading-relaxed break-words">
                          {c.text}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Quick Reaction Bar + Composer */}
              <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/60 space-y-2.5">
                <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                  {QUICK_REACTIONS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => {
                        setCommentText((prev) => `${prev}${prev ? ' ' : ''}${emoji}`);
                        commentInputRef.current?.focus();
                      }}
                      className="min-w-[36px] min-h-[34px] px-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm hover:scale-105 transition-transform"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>

                <form onSubmit={handleAddComment} className="flex items-center gap-2">
                  {profile?.avatarUrl ? (
                    <img
                      src={profile.avatarUrl}
                      alt={profile.fullName}
                      referrerPolicy="no-referrer"
                      className="w-8 h-8 rounded-full object-cover shrink-0"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold flex items-center justify-center shrink-0">
                      {(profile?.fullName || 'S')[0].toUpperCase()}
                    </div>
                  )}

                  <input
                    ref={commentInputRef}
                    type="text"
                    maxLength={500}
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    placeholder={firebaseUser ? 'Add a comment...' : 'Sign in to comment...'}
                    className="flex-1 h-10 px-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-blue-500"
                  />

                  <button
                    type="submit"
                    disabled={submittingComment || !commentText.trim()}
                    aria-label="Send comment"
                    className="min-w-[40px] h-10 px-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center justify-center disabled:opacity-45 transition-colors"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {chatPost && (
        <StorefrontChatDrawer
          open={Boolean(chatPost)}
          onClose={() => setChatPost(null)}
          business={{
            id: chatPost.businessId,
            name: chatPost.businessName,
            slug: chatPost.businessSlug,
            logoUrl: chatPost.businessLogo,
            isVerified: chatPost.businessVerified,
            city: chatPost.city,
          }}
          initialProduct={
            chatPost.featuredProduct
              ? {
                  id: chatPost.featuredProduct.id,
                  name: chatPost.featuredProduct.name,
                  price: chatPost.featuredProduct.price,
                  discountPrice: chatPost.featuredProduct.discountPrice,
                }
              : null
          }
        />
      )}
    </div>
  );
};
