import React, { useEffect, useRef, useState } from 'react';
import {
  BadgeCheck,
  Bookmark,
  Heart,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  Send,
  ShoppingBag,
  Volume2,
  VolumeX,
} from 'lucide-react';
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

interface SocialPostCardProps {
  post: UnifiedFeedPost;
}

export const SocialPostCard: React.FC<SocialPostCardProps> = ({ post }) => {
  const { firebaseUser, profile } = useAuth();
  const { pushToast } = useRealtime();
  const {
    likedPostIds,
    followedBusinessIds,
    savedPostIds,
    hydratePostLike,
    toggleLike,
    toggleFollow,
    toggleSavePost,
  } = useSocial();

  const isLiked = likedPostIds.has(post.id);
  const isFollowing = followedBusinessIds.has(post.businessId);
  const isSaved = savedPostIds.has(post.id);

  const [heartBurst, setHeartBurst] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [comments, setComments] = useState<FirestoreComment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [muted, setMuted] = useState(true);
  const lastTapRef = useRef<number>(0);

  useEffect(() => {
    void hydratePostLike(post.id);
  }, [post.id, hydratePostLike]);

  useEffect(() => {
    if (!commentsOpen || !post.inFirestore) return;
    const unsub = subscribePostComments(post.id, setComments);
    return () => unsub();
  }, [commentsOpen, post.id, post.inFirestore]);

  const handleDoubleTap = () => {
    const now = Date.now();
    if (now - lastTapRef.current < 320) {
      setHeartBurst(true);
      setTimeout(() => setHeartBurst(false), 700);
      if (!isLiked) {
        void toggleLike(post);
      }
    }
    lastTapRef.current = now;
  };

  const handleShare = async () => {
    trackAnalyticsEvent(post.businessId, 'share');
    const url = `${window.location.origin}/b/${post.businessSlug}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: post.businessName,
          text: post.caption || `Check out ${post.businessName} on SoleWeb`,
          url,
        });
        return;
      } catch {
        // Fallback to copy
      }
    }
    await navigator.clipboard?.writeText(url);
    pushToast({ title: 'Storefront link copied' });
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser || !profile) {
      navigate('/login');
      return;
    }
    const clean = commentText.trim();
    if (!clean) return;
    setSubmittingComment(true);
    try {
      await addPostCommentAtomic(
        post,
        firebaseUser.uid,
        profile.fullName || 'Customer',
        profile.avatarUrl,
        clean
      );
      setCommentText('');
      setCommentsOpen(true);
    } catch (err) {
      pushToast({ title: 'Could not post comment', variant: 'error' });
      console.error(err);
    } finally {
      setSubmittingComment(false);
    }
  };

  const directionsUrl =
    post.lat !== undefined && post.lng !== undefined
      ? buildGoogleMapsDirectionsUrl(post.lat, post.lng, post.googleMapsUrl)
      : post.googleMapsUrl || `/b/${post.businessSlug}`;

  const locationLine = [post.area, post.city].filter(Boolean).join(', ');

  return (
    <article className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between gap-3 relative">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            to={`/b/${post.businessSlug}`}
            className="w-10 h-10 rounded-full p-[2px] bg-gradient-to-tr from-amber-400 via-rose-500 to-violet-600 shrink-0"
          >
            <div className="w-full h-full rounded-full bg-white dark:bg-slate-900 p-[1.5px] overflow-hidden">
              <SafeImage
                src={post.businessLogo || post.mediaUrl}
                alt={post.businessName}
                className="w-full h-full rounded-full object-cover"
              />
            </div>
          </Link>

          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <Link
                to={`/b/${post.businessSlug}`}
                className="font-display text-sm font-semibold text-slate-900 dark:text-white hover:underline truncate"
              >
                {post.businessName}
              </Link>
              {post.businessVerified && (
                <BadgeCheck className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
              <span>{post.categoryName}</span>
              {locationLine && (
                <>
                  <span> · </span>
                  <span>{locationLine}</span>
                </>
              )}
              {post.distanceKm !== null && post.distanceKm !== undefined && (
                <>
                  <span> · </span>
                  <span className="tabular-nums font-medium text-slate-700 dark:text-slate-300">
                    {post.distanceKm < 1
                      ? `${Math.round(post.distanceKm * 1000)} m`
                      : `${post.distanceKm.toFixed(1)} km`}
                  </span>
                </>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() =>
              toggleFollow({
                id: post.businessId,
                slug: post.businessSlug,
                name: post.businessName,
                logoUrl: post.businessLogo,
              })
            }
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              isFollowing
                ? 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200'
                : 'text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40'
            }`}
          >
            {isFollowing ? 'Following' : 'Follow'}
          </button>

          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Post options"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
        </div>

        {menuOpen && (
          <div className="absolute right-3 top-14 w-48 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl z-20 p-1.5 text-xs">
            <Link
              to={`/b/${post.businessSlug}`}
              onClick={() => setMenuOpen(false)}
              className="block px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 font-medium"
            >
              View Storefront
            </Link>
            <a
              href={directionsUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => {
                setMenuOpen(false);
                trackAnalyticsEvent(post.businessId, 'directions_click');
              }}
              className="block px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 font-medium"
            >
              Get Google Maps Directions
            </a>
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                void handleShare();
              }}
              className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 font-medium"
            >
              Copy Link
            </button>
          </div>
        )}
      </div>

      {/* Media Stage */}
      <div
        onClick={handleDoubleTap}
        className="relative aspect-[4/5] bg-slate-100 dark:bg-slate-950 overflow-hidden select-none cursor-pointer"
      >
        {post.mediaType === 'video' ? (
          <>
            <video
              src={post.mediaUrl}
              poster={post.posterUrl || post.businessLogo || undefined}
              autoPlay
              loop
              muted={muted}
              playsInline
              onLoadedMetadata={(e) => {
                const v = e.currentTarget;
                if (typeof post.trimStartSec === 'number' && post.trimStartSec > 0) {
                  v.currentTime = post.trimStartSec;
                }
              }}
              onTimeUpdate={(e) => {
                const v = e.currentTarget;
                const start = typeof post.trimStartSec === 'number' ? post.trimStartSec : 0;
                const end = typeof post.trimEndSec === 'number' && post.trimEndSec > start ? post.trimEndSec : 0;
                if (end > 0 && v.currentTime >= end) {
                  v.currentTime = start;
                }
              }}
              className="w-full h-full object-cover"
            />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setMuted((m) => !m);
              }}
              aria-label={muted ? 'Unmute video' : 'Mute video'}
              className="absolute bottom-3 right-3 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center"
            >
              {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
          </>
        ) : (
          <SafeImage
            src={post.mediaUrl}
            alt={post.caption || post.businessName}
            className="w-full h-full object-cover"
          />
        )}

        {/* Double-Tap Heart Burst */}
        {heartBurst && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <Heart className="w-24 h-24 text-white fill-white drop-shadow-2xl animate-ping" />
          </div>
        )}

        {/* Shoppable Product Link Tag */}
        {post.featuredProduct && (
          <Link
            to={`/b/${post.businessSlug}/p/${post.featuredProduct.id}`}
            onClick={(e) => e.stopPropagation()}
            className="absolute bottom-3 left-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-black/70 backdrop-blur-md text-white text-xs font-medium hover:bg-black/85 transition-colors"
          >
            <ShoppingBag className="w-3.5 h-3.5 text-amber-300" />
            <span className="truncate max-w-[180px]">{post.featuredProduct.name}</span>
            <span className="font-semibold tabular-nums">
              ₹{Number(post.featuredProduct.discountPrice || post.featuredProduct.price).toLocaleString()}
            </span>
          </Link>
        )}
      </div>

      {/* Action Bar */}
      <div className="px-4 pt-3 pb-4 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => toggleLike(post)}
              aria-label={isLiked ? 'Unlike post' : 'Like post'}
              className="inline-flex items-center gap-1.5 text-slate-800 dark:text-slate-100 hover:opacity-75 transition-opacity"
            >
              <Heart
                className={`w-6 h-6 transition-transform active:scale-125 ${
                  isLiked ? 'fill-rose-500 text-rose-500' : ''
                }`}
              />
            </button>

            <button
              type="button"
              onClick={() => setCommentsOpen((v) => !v)}
              aria-label="Comments"
              className="inline-flex items-center gap-1.5 text-slate-800 dark:text-slate-100 hover:opacity-75 transition-opacity"
            >
              <MessageCircle className="w-6 h-6" />
            </button>

            <button
              type="button"
              onClick={handleShare}
              aria-label="Share post"
              className="inline-flex items-center gap-1.5 text-slate-800 dark:text-slate-100 hover:opacity-75 transition-opacity"
            >
              <Send className="w-5 h-5" />
            </button>

            <a
              href={directionsUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackAnalyticsEvent(post.businessId, 'directions_click')}
              aria-label="Get Location"
              className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
            >
              <MapPin className="w-4 h-4" />
              <span className="hidden sm:inline">Location</span>
            </a>
          </div>

          <button
            type="button"
            onClick={() => toggleSavePost(post)}
            aria-label={isSaved ? 'Remove saved post' : 'Save post'}
            className="text-slate-800 dark:text-slate-100 hover:opacity-75 transition-opacity"
          >
            <Bookmark className={`w-6 h-6 ${isSaved ? 'fill-current' : ''}`} />
          </button>
        </div>

        {/* Like & Comment Counters */}
        <p className="text-xs font-semibold text-slate-900 dark:text-white tabular-nums">
          {post.likesCount.toLocaleString()} likes
          {post.commentsCount > 0 && (
            <span className="text-slate-400 font-normal"> · {post.commentsCount} comments</span>
          )}
        </p>

        {/* Caption */}
        {post.caption && (
          <p className="text-sm text-slate-800 dark:text-slate-200 leading-relaxed">
            <Link
              to={`/b/${post.businessSlug}`}
              className="font-semibold text-slate-900 dark:text-white mr-1.5 hover:underline"
            >
              {post.businessName}
            </Link>
            <span>{post.caption}</span>
          </p>
        )}

        {/* Hashtags */}
        {post.tags && post.tags.length > 0 && (
          <div className="flex flex-wrap gap-x-2 gap-y-1 text-xs text-blue-600 dark:text-blue-400">
            {post.tags.slice(0, 6).map((tag) => (
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

        {/* View Comments Trigger */}
        <button
          type="button"
          onClick={() => setCommentsOpen((v) => !v)}
          className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
        >
          {commentsOpen
            ? 'Hide comments'
            : post.commentsCount > 0
              ? `View all ${post.commentsCount} comments`
              : 'Add a comment...'}
        </button>

        {/* Expandable Real-Time Comments */}
        {commentsOpen && (
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
            {comments.length > 0 && (
              <div className="max-h-44 overflow-y-auto space-y-2 pr-1">
                {comments.map((c) => (
                  <div key={c.id} className="text-xs flex items-start gap-2">
                    <span className="font-semibold text-slate-900 dark:text-white shrink-0">
                      {c.authorName}
                    </span>
                    <span className="text-slate-700 dark:text-slate-300">{c.text}</span>
                  </div>
                ))}
              </div>
            )}

            <form onSubmit={handleAddComment} className="flex items-center gap-2">
              <input
                type="text"
                maxLength={500}
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder={firebaseUser ? 'Write a comment...' : 'Sign in to comment...'}
                className="flex-1 h-9 px-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs focus:outline-none focus:border-blue-500"
              />
              <button
                type="submit"
                disabled={submittingComment || !commentText.trim()}
                className="px-3 h-9 rounded-xl bg-blue-600 text-white text-xs font-semibold disabled:opacity-50"
              >
                Post
              </button>
            </form>
          </div>
        )}
      </div>
    </article>
  );
};
