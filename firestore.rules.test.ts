/**
 * Security Rules Verification Suite (Dirty Dozen Adversarial Payloads)
 * Designed for @firebase/rules-unit-testing against firestore.rules
 */
export interface DirtyDozenCase {
  id: number;
  name: string;
  collectionPath: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  auth: { uid: string; email?: string; email_verified?: boolean } | null;
  payload?: Record<string, unknown>;
  expected: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_TESTS: DirtyDozenCase[] = [
  {
    id: 1,
    name: 'Self-admin role escalation on user registration',
    collectionPath: 'users/user_1',
    operation: 'create',
    auth: { uid: 'user_1', email: 'attacker@example.com', email_verified: true },
    payload: {
      uid: 'user_1',
      displayName: 'Attacker',
      role: 'admin',
      visibility: 'public',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Shadow ghost field injection (isVerified: true)',
    collectionPath: 'users/user_1',
    operation: 'create',
    auth: { uid: 'user_1', email: 'bob@example.com', email_verified: true },
    payload: {
      uid: 'user_1',
      displayName: 'Bob',
      role: 'customer',
      visibility: 'public',
      isVerified: true,
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Unverified email spoofing admin email',
    collectionPath: 'admins/spoof_1',
    operation: 'create',
    auth: { uid: 'spoof_1', email: 'zishanansari00000123@gmail.com', email_verified: false },
    payload: { uid: 'spoof_1', email: 'zishanansari00000123@gmail.com' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Cross-user PII read on private info',
    collectionPath: 'users/victim_1/private/info',
    operation: 'get',
    auth: { uid: 'attacker_1', email: 'a@example.com', email_verified: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Oversized document ID poisoning (>128 chars)',
    collectionPath: `socialPosts/${'a'.repeat(200)}`,
    operation: 'create',
    auth: { uid: 'owner_1', email: 'o@example.com', email_verified: true },
    payload: { id: 'a'.repeat(200), authorUid: 'owner_1' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Author UID spoofing on SocialPost create',
    collectionPath: 'socialPosts/post_spoof_1',
    operation: 'create',
    auth: { uid: 'attacker_1', email: 'a@example.com', email_verified: true },
    payload: {
      id: 'post_spoof_1',
      businessId: 'biz_1',
      businessSlug: 'chai-co',
      businessName: 'Chai Co',
      authorUid: 'legit_owner',
      mediaUrl: 'https://example.com/a.jpg',
      mediaType: 'photo',
      likesCount: 0,
      commentsCount: 0,
      visibility: 'public',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Non-atomic likesCount inflation without batch like doc',
    collectionPath: 'socialPosts/post_1',
    operation: 'update',
    auth: { uid: 'user_2', email: 'u2@example.com', email_verified: true },
    payload: { likesCount: 9999 },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'Orphaned comment under non-existent post',
    collectionPath: 'socialPosts/nonexistent_post/comments/c_1',
    operation: 'create',
    auth: { uid: 'user_1', email: 'u1@example.com', email_verified: true },
    payload: {
      id: 'c_1',
      postId: 'nonexistent_post',
      authorUid: 'user_1',
      authorName: 'User One',
      text: 'Nice!',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'Client-side backdated timestamp forgery',
    collectionPath: 'socialPosts/post_time_1',
    operation: 'create',
    auth: { uid: 'owner_1', email: 'o@example.com', email_verified: true },
    payload: {
      id: 'post_time_1',
      authorUid: 'owner_1',
      createdAt: '2020-01-01T00:00:00Z',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Unbounded tags list (>10 items)',
    collectionPath: 'socialPosts/post_tags_1',
    operation: 'create',
    auth: { uid: 'owner_1', email: 'o@example.com', email_verified: true },
    payload: {
      id: 'post_tags_1',
      authorUid: 'owner_1',
      tags: Array.from({ length: 15 }, (_, i) => `tag${i}`),
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Unscoped follows collection list scraping',
    collectionPath: 'follows',
    operation: 'list',
    auth: { uid: 'user_1', email: 'u1@example.com', email_verified: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Immortal field tampering (changing authorUid on update)',
    collectionPath: 'socialPosts/post_1',
    operation: 'update',
    auth: { uid: 'owner_1', email: 'o@example.com', email_verified: true },
    payload: { authorUid: 'new_owner_99' },
    expected: 'PERMISSION_DENIED',
  },
];
