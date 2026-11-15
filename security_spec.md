# SoleWeb Firestore Security Specification

## 1. Data Invariants
1. **Default Deny**: All unmatched paths under `/databases/{database}/documents` are denied for both reads and writes.
2. **PII Isolation (Split Collection)**: `/users/{userId}` stores only public social attributes (`uid`, `displayName`, `handle`, `photoUrl`, `bio`, `role`, `visibility`, `createdAt`, `updatedAt`). Sensitive PII (`email`, `phone`, `preferredLang`) lives strictly in `/users/{userId}/private/info` and is readable/writable only by `request.auth.uid == userId` or verified admin.
3. **Self-Assigned Role Prevention**: Users registering `/users/{userId}` may only set `role == 'customer'` or `'owner'` unless `isAdmin()` is true. Users cannot escalate their own `role` to `'admin'` on create or update.
4. **Verified Identity**: All writes require `request.auth != null && request.auth.token.email_verified == true`.
5. **Path ID & Payload Size Hardening**: Every document ID path variable must satisfy `isValidId(id)` (`^[a-zA-Z0-9_\-]+$`, max 128 chars). Every string field has strict `.size()` bounds; `tags` is bounded to `<= 10` elements with first-element type validation.
6. **Master Gate & Relational Sync**: Subcollections `/socialPosts/{postId}/likes/{userId}` and `/socialPosts/{postId}/comments/{commentId}` verify parent existence via `exists(/databases/$(database)/documents/socialPosts/$(postId))` and require atomic batch updates (`getAfter` / `existsAfter`) on `/socialPosts/{postId}` (`likesCount` / `commentsCount`).
7. **Follow & Follower Count Atomicity**: Creating or deleting `/follows/{followId}` (`${uid}_${businessId}`) requires `followId == request.auth.uid + '_' + data.businessId` and atomic update on `/businessStats/{businessId}`.
8. **Strict Query Enforcement**: `allow list` on `/follows` enforces `resource.data.followerUid == request.auth.uid`. `allow list` on `/socialPosts` and `/stories` enforces `resource.data.visibility == 'public'` (or owner/admin).

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Self-Admin Role Escalation (`users/{uid}`)**: `{ "uid": "u1", "displayName": "Attacker", "role": "admin", "visibility": "public" }` -> `PERMISSION_DENIED`.
2. **Ghost / Shadow Field Injection (`users/{uid}`)**: `{ "uid": "u1", "displayName": "Bob", "role": "customer", "visibility": "public", "isVerified": true }` -> `PERMISSION_DENIED`.
3. **Unverified Email Admin Spoof (`admins/{uid}`)**: Authenticated with `email: "zishanansari00000123@gmail.com"` and `email_verified: false` attempting write -> `PERMISSION_DENIED`.
4. **Cross-User PII Read (`users/{victimId}/private/info`)**: Signed-in non-owner reading victim's `private/info` -> `PERMISSION_DENIED`.
5. **Oversized ID Poisoning (`socialPosts/{1500_char_id}`)**: Creating a document with a 1500-character ID -> `PERMISSION_DENIED`.
6. **Author Spoofing (`socialPosts/{postId}`)**: Creating a `SocialPost` with `authorUid: "someone_else"` != `request.auth.uid` -> `PERMISSION_DENIED`.
7. **Non-Atomic Like Manipulation (`socialPosts/{postId}`)**: Updating `likesCount` directly from `0` to `9999` without a matching batch write to `/likes/{uid}` -> `PERMISSION_DENIED`.
8. **Orphaned Comment (`socialPosts/nonexistent/comments/c1`)**: Creating a comment under a non-existent `postId` -> `PERMISSION_DENIED`.
9. **Client-Side Timestamp Forgery (`socialPosts/{postId}`)**: Setting `createdAt` to a past client timestamp (`new Date('2020-01-01')`) instead of `request.time` -> `PERMISSION_DENIED`.
10. **Unbounded Tags Injection (`socialPosts/{postId}`)**: Submitting 15 tags (`tags.size() > 10`) or non-string tag elements -> `PERMISSION_DENIED`.
11. **Unscoped Follows List Query (`follows`)**: Listing `/follows` without `where('followerUid', '==', auth.uid)` -> `PERMISSION_DENIED`.
12. **Immortal Field Tampering (`socialPosts/{postId}`)**: Attempting to change `authorUid`, `businessId`, or `createdAt` on an update -> `PERMISSION_DENIED`.
