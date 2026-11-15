import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import { useLocation } from './LocationContext';
import { useRealtime } from './RealtimeContext';
import { apiFetch } from '../lib/api';
import {
  checkIsPostLiked,
  publishStoryFirestore,
  subscribePublicSocialPosts,
  subscribePublicStories,
  subscribeSavedPosts,
  subscribeUserFollows,
  toggleFollowBusinessAtomic,
  toggleLikePostAtomic,
  toggleSavePostFirestore,
  type FirestoreFollow,
  type FirestoreSavedPost,
  type FirestoreSocialPost,
  type FirestoreStory,
} from '../lib/socialFirestore';

export interface UnifiedFeedPost {
  id: string;
  businessId: string;
  businessSlug: string;
  businessName: string;
  businessLogo: string | null;
  businessVerified: boolean;
  categoryName: string;
  area?: string | null;
  city?: string | null;
  lat?: number;
  lng?: number;
  googleMapsUrl?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  distanceKm?: number | null;
  isOpenNow?: boolean;
  mediaType: 'photo' | 'video';
  mediaUrl: string;
  posterUrl?: string | null;
  trimStartSec?: number | null;
  trimEndSec?: number | null;
  durationSec?: number | null;
  caption: string | null;
  tags: string[];
  featuredProduct?: {
    id: string;
    name: string;
    price: string;
    discountPrice?: string | null;
  } | null;
  likesCount: number;
  commentsCount: number;
  createdAt: string;
  inFirestore: boolean;
}

interface SocialContextValue {
  feedPosts: UnifiedFeedPost[];
  stories: FirestoreStory[];
  follows: FirestoreFollow[];
  savedPosts: FirestoreSavedPost[];
  likedPostIds: Set<string>;
  followedBusinessIds: Set<string>;
  savedPostIds: Set<string>;
  loadingFeed: boolean;
  toggleLike: (post: UnifiedFeedPost) => Promise<void>;
  hydratePostLike: (postId: string) => Promise<void>;
  toggleFollow: (business: { id: string; slug: string; name: string; logoUrl?: string | null }) => Promise<void>;
  toggleSavePost: (post: UnifiedFeedPost) => Promise<void>;
  publishStory: (
    business: { id: string; slug: string; name: string; logoUrl?: string | null; isVerified?: boolean },
    mediaUrl: string,
    caption: string
  ) => Promise<void>;
  refreshSqlFeed: () => Promise<void>;
}

const SocialContext = createContext<SocialContextValue>({
  feedPosts: [],
  stories: [],
  follows: [],
  savedPosts: [],
  likedPostIds: new Set(),
  followedBusinessIds: new Set(),
  savedPostIds: new Set(),
  loadingFeed: true,
  toggleLike: async () => {},
  hydratePostLike: async () => {},
  toggleFollow: async () => {},
  toggleSavePost: async () => {},
  publishStory: async () => {},
  refreshSqlFeed: async () => {},
});

export const SocialProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { firebaseUser, loading: authLoading } = useAuth();
  const { location } = useLocation();
  const { pushToast } = useRealtime();

  const [sqlFeed, setSqlFeed] = useState<Array<Record<string, unknown>>>([]);
  const [fsPosts, setFsPosts] = useState<FirestoreSocialPost[]>([]);
  const [stories, setStories] = useState<FirestoreStory[]>([]);
  const [follows, setFollows] = useState<FirestoreFollow[]>([]);
  const [savedPosts, setSavedPosts] = useState<FirestoreSavedPost[]>([]);
  const [likedPostIds, setLikedPostIds] = useState<Set<string>>(new Set());
  const [loadingFeed, setLoadingFeed] = useState(true);
  const checkedLikesRef = useRef<Set<string>>(new Set());

  const refreshSqlFeed = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (!location.isGlobal && location.lat !== null && location.lng !== null) {
        params.set('lat', String(location.lat));
        params.set('lng', String(location.lng));
      }
      const res = await apiFetch<{ feed: Array<Record<string, unknown>> }>(
        `/api/feed${params.toString() ? `?${params.toString()}` : ''}`
      );
      setSqlFeed(res.feed || []);
    } catch (err) {
      console.error('SQL feed load error:', err);
    } finally {
      setLoadingFeed(false);
    }
  }, [location.isGlobal, location.lat, location.lng]);

  useEffect(() => {
    void refreshSqlFeed();
  }, [refreshSqlFeed]);

  // Real-time public Firestore feed + stories subscriptions
  useEffect(() => {
    let unsubPosts = () => {};
    let unsubStories = () => {};
    try {
      unsubPosts = subscribePublicSocialPosts((items) => {
        setFsPosts(items);
        setLoadingFeed(false);
      });
      unsubStories = subscribePublicStories((items) => {
        setStories(items);
      });
    } catch (err) {
      console.warn('Public Firestore listener warning:', err);
    }
    return () => {
      unsubPosts();
      unsubStories();
    };
  }, []);

  // Authenticated-only user follows & saved posts subscriptions
  useEffect(() => {
    checkedLikesRef.current.clear();
    if (authLoading || !firebaseUser) {
      setFollows([]);
      setSavedPosts([]);
      setLikedPostIds(new Set());
      return;
    }
    const uid = firebaseUser.uid;
    let unsubFollows = () => {};
    let unsubSaved = () => {};
    try {
      unsubFollows = subscribeUserFollows(uid, setFollows);
      unsubSaved = subscribeSavedPosts(uid, setSavedPosts);
    } catch (err) {
      console.warn('User social listener warning:', err);
    }
    return () => {
      unsubFollows();
      unsubSaved();
    };
  }, [firebaseUser, authLoading]);

  // Merge Cloud SQL spatial/product metadata with real-time Firestore likes/comments counts
  const feedPosts = useMemo<UnifiedFeedPost[]>(() => {
    const fsMap = new Map(fsPosts.map((p) => [p.id, p]));
    const merged: UnifiedFeedPost[] = [];
    const seen = new Set<string>();

    for (const row of sqlFeed) {
      const id = String(row.id);
      seen.add(id);
      const fs = fsMap.get(id);
      merged.push({
        id,
        businessId: String(row.businessId),
        businessSlug: String(row.businessSlug),
        businessName: String(row.businessName),
        businessLogo: (row.businessLogo as string) || (row.businessCover as string) || null,
        businessVerified: Boolean(row.businessVerified),
        categoryName: String(row.categoryName || 'Local Business'),
        area: (row.area as string) || null,
        city: (row.city as string) || null,
        lat: row.lat !== undefined ? Number(row.lat) : undefined,
        lng: row.lng !== undefined ? Number(row.lng) : undefined,
        googleMapsUrl: (row.googleMapsUrl as string) || null,
        phone: (row.phone as string) || null,
        whatsapp: (row.whatsapp as string) || null,
        distanceKm:
          row.distanceKm !== null && row.distanceKm !== undefined ? Number(row.distanceKm) : null,
        isOpenNow: Boolean(row.isOpenNow),
        mediaType: (row.mediaType as 'photo' | 'video') || 'photo',
        mediaUrl: String(row.mediaUrl),
        posterUrl: (row.posterUrl as string) || null,
        trimStartSec: row.trimStartSec !== null && row.trimStartSec !== undefined ? Number(row.trimStartSec) : null,
        trimEndSec: row.trimEndSec !== null && row.trimEndSec !== undefined ? Number(row.trimEndSec) : null,
        durationSec: row.durationSec !== null && row.durationSec !== undefined ? Number(row.durationSec) : null,
        caption: (fs?.caption ?? row.caption ?? null) as string | null,
        tags: Array.isArray(row.tags) ? (row.tags as string[]) : fs?.tags || [],
        featuredProduct: (row.featuredProduct as UnifiedFeedPost['featuredProduct']) || null,
        likesCount: fs ? Number(fs.likesCount || 0) : 24,
        commentsCount: fs ? Number(fs.commentsCount || 0) : 0,
        createdAt: String(row.createdAt || new Date().toISOString()),
        inFirestore: Boolean(fs),
      });
    }

    for (const fs of fsPosts) {
      if (seen.has(fs.id)) continue;
      merged.push({
        id: fs.id,
        businessId: fs.businessId,
        businessSlug: fs.businessSlug,
        businessName: fs.businessName,
        businessLogo: fs.businessLogo || null,
        businessVerified: Boolean(fs.businessVerified),
        categoryName: fs.categoryName || 'Local Business',
        city: fs.city || null,
        mediaType: fs.mediaType,
        mediaUrl: fs.mediaUrl,
        posterUrl: fs.posterUrl || null,
        caption: fs.caption || null,
        tags: fs.tags || [],
        featuredProduct: fs.productName
          ? {
              id: fs.productId || '',
              name: fs.productName,
              price: String(fs.productPrice || 0),
            }
          : null,
        likesCount: Number(fs.likesCount || 0),
        commentsCount: Number(fs.commentsCount || 0),
        createdAt: new Date().toISOString(),
        inFirestore: true,
      });
    }

    return merged;
  }, [sqlFeed, fsPosts]);

  const followedBusinessIds = useMemo(
    () => new Set(follows.map((f) => f.businessId)),
    [follows]
  );

  const savedPostIds = useMemo(() => new Set(savedPosts.map((s) => s.postId)), [savedPosts]);

  const hydratePostLike = useCallback(
    async (postId: string) => {
      if (!firebaseUser || checkedLikesRef.current.has(postId)) return;
      checkedLikesRef.current.add(postId);
      try {
        const liked = await checkIsPostLiked(postId, firebaseUser.uid);
        if (liked) {
          setLikedPostIds((prev) => {
            if (prev.has(postId)) return prev;
            const next = new Set(prev);
            next.add(postId);
            return next;
          });
        }
      } catch {
        // Non-blocking hydration
      }
    },
    [firebaseUser]
  );

  const toggleLike = useCallback(
    async (post: UnifiedFeedPost) => {
      if (!firebaseUser) {
        pushToast({ title: 'Sign in with Google to like posts' });
        return;
      }
      const currentlyLiked = likedPostIds.has(post.id);
      checkedLikesRef.current.add(post.id);
      setLikedPostIds((prev) => {
        const next = new Set(prev);
        if (currentlyLiked) next.delete(post.id);
        else next.add(post.id);
        return next;
      });
      try {
        const finalLiked = await toggleLikePostAtomic(
          post,
          firebaseUser.uid,
          currentlyLiked
        );
        setLikedPostIds((prev) => {
          const next = new Set(prev);
          if (finalLiked) next.add(post.id);
          else next.delete(post.id);
          return next;
        });
      } catch (err) {
        setLikedPostIds((prev) => {
          const next = new Set(prev);
          if (currentlyLiked) next.add(post.id);
          else next.delete(post.id);
          return next;
        });
        pushToast({ title: 'Could not update like right now', variant: 'error' });
        console.error(err);
      }
    },
    [firebaseUser, likedPostIds, pushToast]
  );

  const toggleFollow = useCallback(
    async (business: { id: string; slug: string; name: string; logoUrl?: string | null }) => {
      if (!firebaseUser) {
        pushToast({ title: 'Sign in with Google to follow storefronts' });
        return;
      }
      const currentlyFollowing = followedBusinessIds.has(business.id);
      try {
        const next = await toggleFollowBusinessAtomic(firebaseUser.uid, business, currentlyFollowing);
        pushToast({ title: next ? `Following ${business.name}` : `Unfollowed ${business.name}` });
      } catch (err) {
        pushToast({ title: 'Could not update follow status', variant: 'error' });
        console.error(err);
      }
    },
    [firebaseUser, followedBusinessIds, pushToast]
  );

  const toggleSavePost = useCallback(
    async (post: UnifiedFeedPost) => {
      if (!firebaseUser) {
        pushToast({ title: 'Sign in with Google to save posts' });
        return;
      }
      const currentlySaved = savedPostIds.has(post.id);
      try {
        const next = await toggleSavePostFirestore(firebaseUser.uid, post, currentlySaved);
        pushToast({ title: next ? 'Post saved to bookmarks' : 'Removed from saved posts' });
      } catch (err) {
        pushToast({ title: 'Could not save post', variant: 'error' });
        console.error(err);
      }
    },
    [firebaseUser, savedPostIds, pushToast]
  );

  const publishStory = useCallback(
    async (
      business: { id: string; slug: string; name: string; logoUrl?: string | null; isVerified?: boolean },
      mediaUrl: string,
      caption: string
    ) => {
      if (!firebaseUser) {
        pushToast({ title: 'Sign in to share a story' });
        return;
      }
      await publishStoryFirestore(firebaseUser.uid, business, mediaUrl, caption);
      pushToast({ title: 'Story published live' });
    },
    [firebaseUser, pushToast]
  );

  return (
    <SocialContext.Provider
      value={{
        feedPosts,
        stories,
        follows,
        savedPosts,
        likedPostIds,
        followedBusinessIds,
        savedPostIds,
        loadingFeed,
        toggleLike,
        hydratePostLike,
        toggleFollow,
        toggleSavePost,
        publishStory,
        refreshSqlFeed,
      }}
    >
      {children}
    </SocialContext.Provider>
  );
};

export const useSocial = () => useContext(SocialContext);
