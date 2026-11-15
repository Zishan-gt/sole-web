import { Timestamp } from 'firebase-admin/firestore';
import { desc, eq } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { businesses, categories, posts, products, profiles } from '../db/schema.ts';
import { adminDb } from './firebase-admin.ts';

let syncedOnce = false;

export async function syncSeededSocialToFirestore(): Promise<void> {
  if (syncedOnce) return;
  try {
    const existingSnap = await adminDb.collection('socialPosts').limit(1).get();
    if (!existingSnap.empty) {
      syncedOnce = true;
      return;
    }

    const [allBiz, allCats, allPosts, allProds, allOwners] = await Promise.all([
      db.select().from(businesses).where(eq(businesses.status, 'published')),
      db.select().from(categories),
      db
        .select()
        .from(posts)
        .where(eq(posts.isHidden, false))
        .orderBy(desc(posts.createdAt))
        .limit(30),
      db.select().from(products).where(eq(products.isActive, true)),
      db.select().from(profiles),
    ]);

    const catMap = Object.fromEntries(allCats.map((c) => [c.id, c]));
    const bizMap = Object.fromEntries(allBiz.map((b) => [b.id, b]));
    const ownerMap = Object.fromEntries(allOwners.map((o) => [o.id, o]));
    const prodByBiz = new Map<string, typeof allProds[number]>();
    for (const pr of allProds) {
      if (!prodByBiz.has(pr.businessId)) prodByBiz.set(pr.businessId, pr);
    }

    const batch = adminDb.batch();
    const now = Timestamp.now();
    const expires = Timestamp.fromMillis(Date.now() + 1000 * 60 * 60 * 24 * 7);

    for (const p of allPosts) {
      const biz = bizMap[p.businessId];
      if (!biz) continue;
      const cat = biz.categoryId ? catMap[biz.categoryId] : undefined;
      const owner = ownerMap[biz.ownerId];
      const linkedProd = prodByBiz.get(biz.id);

      const postRef = adminDb.collection('socialPosts').doc(p.id);
      batch.set(postRef, {
        id: p.id,
        businessId: biz.id,
        businessSlug: biz.slug,
        businessName: biz.name,
        businessLogo: biz.logoUrl || biz.coverUrl || '',
        businessVerified: Boolean(biz.isVerified),
        authorUid: owner?.uid || 'seed-owner-1',
        categoryName: cat?.name || 'Local Business',
        city: biz.city || '',
        mediaUrl: p.mediaUrl,
        mediaType: p.type,
        posterUrl: p.posterUrl || biz.coverUrl || '',
        caption: p.caption || biz.bio || `Discover ${biz.name}`,
        tags: (biz.tags || []).slice(0, 8),
        ...(linkedProd
          ? {
              productId: linkedProd.id,
              productName: linkedProd.name,
              productPrice: Number(linkedProd.discountPrice || linkedProd.price),
            }
          : {}),
        likesCount: Math.floor(12 + Math.random() * 85),
        commentsCount: 0,
        visibility: 'public',
        createdAt: Timestamp.fromDate(new Date(p.createdAt)),
        updatedAt: now,
      });
    }

    // Create initial Story highlights and BusinessStats for verified businesses
    for (const biz of allBiz.slice(0, 10)) {
      const owner = ownerMap[biz.ownerId];
      const statsRef = adminDb.collection('businessStats').doc(biz.id);
      batch.set(
        statsRef,
        {
          businessId: biz.id,
          followersCount: biz.isVerified ? 48 : 14,
          visibility: 'public',
          updatedAt: now,
        },
        { merge: true }
      );

      if (biz.coverUrl || biz.logoUrl) {
        const storyId = `story_${biz.id}`;
        const storyRef = adminDb.collection('stories').doc(storyId);
        batch.set(storyRef, {
          id: storyId,
          businessId: biz.id,
          businessSlug: biz.slug,
          businessName: biz.name,
          businessLogo: biz.logoUrl || biz.coverUrl || '',
          businessVerified: Boolean(biz.isVerified),
          authorUid: owner?.uid || 'seed-owner-1',
          mediaUrl: biz.coverUrl || biz.logoUrl || '',
          mediaType: 'photo',
          caption: biz.bio?.slice(0, 200) || `Open in ${biz.city || 'your neighborhood'}`,
          visibility: 'public',
          createdAt: now,
          expiresAt: expires,
        });
      }
    }

    await batch.commit();
    syncedOnce = true;
    console.log(`Synced ${allPosts.length} SoleWeb posts & stories to Firestore.`);
  } catch (err) {
    console.warn('Firestore social sync skipped (will retry on demand):', (err as Error).message);
  }
}

export async function mirrorSinglePostToFirestore(postId: string): Promise<void> {
  try {
    const [p] = await db.select().from(posts).where(eq(posts.id, postId)).limit(1);
    if (!p) return;
    const [biz] = await db.select().from(businesses).where(eq(businesses.id, p.businessId)).limit(1);
    if (!biz) return;
    const [owner] = await db.select().from(profiles).where(eq(profiles.id, biz.ownerId)).limit(1);
    const cat = biz.categoryId
      ? (await db.select().from(categories).where(eq(categories.id, biz.categoryId)).limit(1))[0]
      : undefined;

    const now = Timestamp.now();
    await adminDb
      .collection('socialPosts')
      .doc(p.id)
      .set(
        {
          id: p.id,
          businessId: biz.id,
          businessSlug: biz.slug,
          businessName: biz.name,
          businessLogo: biz.logoUrl || biz.coverUrl || '',
          businessVerified: Boolean(biz.isVerified),
          authorUid: owner?.uid || 'seed-owner-1',
          categoryName: cat?.name || 'Local Business',
          city: biz.city || '',
          mediaUrl: p.mediaUrl,
          mediaType: p.type,
          posterUrl: p.posterUrl || biz.coverUrl || '',
          caption: p.caption || '',
          tags: (biz.tags || []).slice(0, 8),
          likesCount: 0,
          commentsCount: 0,
          visibility: p.isHidden ? 'hidden' : 'public',
          createdAt: Timestamp.fromDate(new Date(p.createdAt)),
          updatedAt: now,
        },
        { merge: true }
      );
  } catch (err) {
    console.warn('mirrorSinglePostToFirestore warning:', (err as Error).message);
  }
}
