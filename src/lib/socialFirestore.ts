import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  increment,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import type { User } from 'firebase/auth';
import type { UserProfile } from '../context/AuthContext';

export interface FirestoreSocialPost {
  id: string;
  businessId: string;
  businessSlug: string;
  businessName: string;
  businessLogo?: string;
  businessVerified?: boolean;
  authorUid: string;
  categoryName?: string;
  city?: string;
  mediaUrl: string;
  mediaType: 'photo' | 'video';
  posterUrl?: string;
  caption?: string;
  tags?: string[];
  productId?: string;
  productName?: string;
  productPrice?: number;
  likesCount: number;
  commentsCount: number;
  visibility: 'public' | 'hidden';
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface FirestoreStory {
  id: string;
  businessId: string;
  businessSlug: string;
  businessName: string;
  businessLogo?: string;
  businessVerified?: boolean;
  authorUid: string;
  mediaUrl: string;
  mediaType: 'photo' | 'video';
  caption?: string;
  visibility: 'public' | 'expired';
  createdAt?: unknown;
  expiresAt?: unknown;
}

export interface FirestoreComment {
  id: string;
  postId: string;
  authorUid: string;
  authorName: string;
  authorAvatar?: string;
  text: string;
  createdAt?: unknown;
}

export interface FirestoreFollow {
  id: string;
  followerUid: string;
  businessId: string;
  businessSlug: string;
  businessName: string;
  businessLogo?: string;
}

export interface FirestoreSavedPost {
  postId: string;
  userId: string;
  businessSlug: string;
  businessName: string;
  mediaUrl: string;
  caption?: string;
}

function clamp(val: string | undefined | null, max: number): string {
  return (val || '').trim().slice(0, max);
}

function toMillis(ts: unknown): number {
  if (!ts) return 0;
  if (typeof ts === 'number') return ts;
  if (typeof ts === 'string') return Date.parse(ts) || 0;
  if (typeof ts === 'object' && ts !== null && 'toMillis' in ts) {
    return (ts as Timestamp).toMillis();
  }
  return 0;
}

export async function syncUserProfileToFirestore(
  firebaseUser: User,
  profile: UserProfile
): Promise<void> {
  const uid = firebaseUser.uid;
  const publicPath = `users/${uid}`;
  const privatePath = `users/${uid}/private/info`;

  try {
    const publicRef = doc(db, 'users', uid);
    const existing = await getDoc(publicRef);
    const safeHandle = (profile.handle || profile.email.split('@')[0] || 'member')
      .replace(/[^a-zA-Z0-9_.]/g, '')
      .slice(0, 40) || 'member';
    const safeBio = clamp(profile.bio, 200);

    if (!existing.exists()) {
      const role = profile.role === 'admin' ? 'admin' : profile.role === 'owner' ? 'owner' : 'customer';
      await setDoc(publicRef, {
        uid,
        displayName: clamp(profile.fullName || firebaseUser.displayName || 'SoleWeb Member', 80),
        handle: safeHandle,
        photoUrl: clamp(profile.avatarUrl || firebaseUser.photoURL || '', 500),
        ...(safeBio ? { bio: safeBio } : {}),
        role,
        visibility: 'public',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(
        publicRef,
        {
          displayName: clamp(profile.fullName || firebaseUser.displayName || 'SoleWeb Member', 80),
          handle: safeHandle,
          photoUrl: clamp(profile.avatarUrl || firebaseUser.photoURL || '', 500),
          ...(safeBio ? { bio: safeBio } : {}),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, publicPath);
  }

  try {
    const privateRef = doc(db, 'users', uid, 'private', 'info');
    await setDoc(privateRef, {
      uid,
      email: clamp(profile.email || firebaseUser.email || '', 160),
      ...(profile.phone ? { phone: clamp(profile.phone, 32) } : {}),
      preferredLang: profile.preferredLang === 'hi' ? 'hi' : 'en',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, privatePath);
  }
}

export function subscribePublicSocialPosts(
  onData: (posts: FirestoreSocialPost[]) => void
): () => void {
  const path = 'socialPosts';
  const q = query(collection(db, path), where('visibility', '==', 'public'), limit(40));
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => d.data() as FirestoreSocialPost);
      items.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
      onData(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribePublicStories(onData: (stories: FirestoreStory[]) => void): () => void {
  const path = 'stories';
  const q = query(collection(db, path), where('visibility', '==', 'public'), limit(24));
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => d.data() as FirestoreStory);
      items.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
      onData(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribeUserFollows(
  uid: string,
  onData: (follows: FirestoreFollow[]) => void
): () => void {
  const path = 'follows';
  const q = query(collection(db, path), where('followerUid', '==', uid), limit(100));
  return onSnapshot(
    q,
    (snap) => {
      onData(snap.docs.map((d) => d.data() as FirestoreFollow));
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribeSavedPosts(
  uid: string,
  onData: (saved: FirestoreSavedPost[]) => void
): () => void {
  const path = `savedPosts/${uid}/items`;
  const q = query(collection(db, 'savedPosts', uid, 'items'), limit(100));
  return onSnapshot(
    q,
    (snap) => {
      onData(snap.docs.map((d) => d.data() as FirestoreSavedPost));
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribePostComments(
  postId: string,
  onData: (comments: FirestoreComment[]) => void
): () => void {
  const path = `socialPosts/${postId}/comments`;
  const q = query(collection(db, 'socialPosts', postId, 'comments'), where('postId', '==', postId), limit(60));
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => d.data() as FirestoreComment);
      items.sort((a, b) => toMillis(a.createdAt) - toMillis(b.createdAt));
      onData(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribeBusinessFollowersCount(
  businessId: string,
  onCount: (count: number) => void
): () => void {
  const path = `businessStats/${businessId}`;
  return onSnapshot(
    doc(db, 'businessStats', businessId),
    (snap) => {
      if (snap.exists()) {
        onCount(Number(snap.data().followersCount || 0));
      } else {
        onCount(0);
      }
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    }
  );
}

export async function checkIsPostLiked(postId: string, uid: string): Promise<boolean> {
  const path = `socialPosts/${postId}/likes/${uid}`;
  try {
    const snap = await getDoc(doc(db, 'socialPosts', postId, 'likes', uid));
    return snap.exists();
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function toggleLikePostAtomic(
  postId: string,
  uid: string,
  currentlyLiked: boolean
): Promise<boolean> {
  const path = `socialPosts/${postId}/likes/${uid}`;
  try {
    const batch = writeBatch(db);
    const postRef = doc(db, 'socialPosts', postId);
    const likeRef = doc(db, 'socialPosts', postId, 'likes', uid);

    if (currentlyLiked) {
      batch.delete(likeRef);
      batch.update(postRef, {
        likesCount: increment(-1),
        updatedAt: serverTimestamp(),
      });
    } else {
      batch.set(likeRef, {
        userId: uid,
        postId,
        createdAt: serverTimestamp(),
      });
      batch.update(postRef, {
        likesCount: increment(1),
        updatedAt: serverTimestamp(),
      });
    }

    await batch.commit();
    return !currentlyLiked;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function addPostCommentAtomic(
  postId: string,
  uid: string,
  authorName: string,
  authorAvatar: string | null | undefined,
  text: string
): Promise<void> {
  const commentId = `c_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const path = `socialPosts/${postId}/comments/${commentId}`;
  try {
    const batch = writeBatch(db);
    const postRef = doc(db, 'socialPosts', postId);
    const commentRef = doc(db, 'socialPosts', postId, 'comments', commentId);

    batch.set(commentRef, {
      id: commentId,
      postId,
      authorUid: uid,
      authorName: clamp(authorName || 'Customer', 80),
      ...(authorAvatar ? { authorAvatar: clamp(authorAvatar, 500) } : {}),
      text: clamp(text, 500),
      createdAt: serverTimestamp(),
    });
    batch.update(postRef, {
      commentsCount: increment(1),
      updatedAt: serverTimestamp(),
    });

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function toggleFollowBusinessAtomic(
  uid: string,
  business: { id: string; slug: string; name: string; logoUrl?: string | null },
  currentlyFollowing: boolean
): Promise<boolean> {
  const followId = `${uid}_${business.id}`;
  const path = `follows/${followId}`;
  try {
    const batch = writeBatch(db);
    const followRef = doc(db, 'follows', followId);
    const statsRef = doc(db, 'businessStats', business.id);
    const statsSnap = await getDoc(statsRef);

    if (currentlyFollowing) {
      batch.delete(followRef);
      if (statsSnap.exists()) {
        batch.update(statsRef, {
          followersCount: increment(-1),
          updatedAt: serverTimestamp(),
        });
      }
    } else {
      batch.set(followRef, {
        id: followId,
        followerUid: uid,
        businessId: business.id,
        businessSlug: clamp(business.slug, 120),
        businessName: clamp(business.name, 120),
        ...(business.logoUrl ? { businessLogo: clamp(business.logoUrl, 500) } : {}),
        createdAt: serverTimestamp(),
      });
      if (statsSnap.exists()) {
        batch.update(statsRef, {
          followersCount: increment(1),
          updatedAt: serverTimestamp(),
        });
      } else {
        batch.set(statsRef, {
          businessId: business.id,
          followersCount: 1,
          visibility: 'public',
          updatedAt: serverTimestamp(),
        });
      }
    }

    await batch.commit();
    return !currentlyFollowing;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function toggleSavePostFirestore(
  uid: string,
  post: {
    id: string;
    businessSlug: string;
    businessName: string;
    mediaUrl: string;
    caption?: string | null;
  },
  currentlySaved: boolean
): Promise<boolean> {
  const path = `savedPosts/${uid}/items/${post.id}`;
  try {
    const ref = doc(db, 'savedPosts', uid, 'items', post.id);
    if (currentlySaved) {
      await deleteDoc(ref);
      return false;
    }
    await setDoc(ref, {
      postId: post.id,
      userId: uid,
      businessSlug: clamp(post.businessSlug, 120),
      businessName: clamp(post.businessName, 120),
      mediaUrl: clamp(post.mediaUrl, 500),
      ...(post.caption ? { caption: clamp(post.caption, 300) } : {}),
      createdAt: serverTimestamp(),
    });
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function publishStoryFirestore(
  uid: string,
  business: { id: string; slug: string; name: string; logoUrl?: string | null; isVerified?: boolean },
  mediaUrl: string,
  caption: string
): Promise<void> {
  const storyId = `story_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const path = `stories/${storyId}`;
  try {
    await setDoc(doc(db, 'stories', storyId), {
      id: storyId,
      businessId: business.id,
      businessSlug: clamp(business.slug, 120),
      businessName: clamp(business.name, 120),
      ...(business.logoUrl ? { businessLogo: clamp(business.logoUrl, 500) } : {}),
      businessVerified: Boolean(business.isVerified),
      authorUid: uid,
      mediaUrl: clamp(mediaUrl, 500),
      mediaType: 'photo',
      ...(caption ? { caption: clamp(caption, 280) } : {}),
      visibility: 'public',
      createdAt: serverTimestamp(),
      expiresAt: Timestamp.fromMillis(Date.now() + 1000 * 60 * 60 * 24),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}
