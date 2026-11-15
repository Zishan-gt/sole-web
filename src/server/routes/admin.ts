import { Router } from 'express';
import { count, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { db, pool } from '../../db/index.ts';
import {
  analyticsEvents,
  auditLog,
  businesses,
  categories,
  posts,
  products,
  profiles,
  reports,
  reviews,
  verificationRequests,
} from '../../db/schema.ts';
import { requireAdmin, requireAuth, type AuthRequest } from '../../middleware/auth.ts';
import { createAndPushNotification } from '../../lib/realtime.ts';

export const adminRouter = Router();
adminRouter.use(requireAuth, requireAdmin);

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'item'
  );
}

adminRouter.get('/stats', async (_req, res) => {
  try {
    const [
      [bizCount],
      [ownerCount],
      [customerCount],
      [prodCount],
      [revCount],
      [pendingVerifCount],
      [openReportsCount],
      searchesTodayRes,
    ] = await Promise.all([
      db.select({ total: count() }).from(businesses),
      db.select({ total: count() }).from(profiles).where(eq(profiles.role, 'owner')),
      db.select({ total: count() }).from(profiles).where(eq(profiles.role, 'customer')),
      db.select({ total: count() }).from(products),
      db.select({ total: count() }).from(reviews),
      db
        .select({ total: count() })
        .from(verificationRequests)
        .where(eq(verificationRequests.status, 'pending')),
      db.select({ total: count() }).from(reports).where(eq(reports.status, 'open')),
      pool.query(
        `SELECT COUNT(*)::int AS total FROM analytics_events WHERE created_at >= CURRENT_DATE`
      ),
    ]);

    res.json({
      businesses: bizCount?.total ?? 0,
      owners: ownerCount?.total ?? 0,
      customers: customerCount?.total ?? 0,
      products: prodCount?.total ?? 0,
      reviews: revCount?.total ?? 0,
      pendingVerifications: pendingVerifCount?.total ?? 0,
      openReports: openReportsCount?.total ?? 0,
      eventsToday: searchesTodayRes.rows[0]?.total ?? 0,
    });
  } catch (err) {
    console.error('GET /api/admin/stats failed:', err);
    res.status(500).json({ error: 'Failed to load admin statistics' });
  }
});

// Verification queue
adminRouter.get('/verifications', async (_req, res) => {
  try {
    const list = await db
      .select({
        id: verificationRequests.id,
        businessId: verificationRequests.businessId,
        documentType: verificationRequests.documentType,
        documentUrls: verificationRequests.documentUrls,
        storefrontPhotoUrl: verificationRequests.storefrontPhotoUrl,
        phoneVerified: verificationRequests.phoneVerified,
        status: verificationRequests.status,
        rejectReason: verificationRequests.rejectReason,
        reviewedAt: verificationRequests.reviewedAt,
        createdAt: verificationRequests.createdAt,
        businessName: businesses.name,
        businessSlug: businesses.slug,
        businessCity: businesses.city,
        businessPhone: businesses.phone,
        ownerId: businesses.ownerId,
      })
      .from(verificationRequests)
      .innerJoin(businesses, eq(verificationRequests.businessId, businesses.id))
      .orderBy(desc(verificationRequests.createdAt));

    res.json({ verifications: list });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load verification queue' });
  }
});

adminRouter.post('/verifications/:id/review', async (req: AuthRequest, res) => {
  try {
    const action = req.body?.action;
    const rejectReason = String(req.body?.rejectReason || '').trim();
    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ error: 'Action must be approve or reject' });
    }
    if (action === 'reject' && !rejectReason) {
      return res.status(400).json({ error: 'Please provide a rejection reason.' });
    }

    const [vr] = await db
      .select()
      .from(verificationRequests)
      .where(eq(verificationRequests.id, req.params.id))
      .limit(1);
    if (!vr) return res.status(404).json({ error: 'Verification request not found' });

    const nextStatus = action === 'approve' ? 'approved' : 'rejected';
    await db
      .update(verificationRequests)
      .set({
        status: nextStatus,
        rejectReason: action === 'reject' ? rejectReason : null,
        reviewedBy: req.profile!.id,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(verificationRequests.id, vr.id));

    const [biz] = await db
      .update(businesses)
      .set({
        verificationStatus: nextStatus,
        isVerified: action === 'approve',
        updatedAt: new Date(),
      })
      .where(eq(businesses.id, vr.businessId))
      .returning();

    await db.insert(auditLog).values({
      actorId: req.profile!.id,
      action: action === 'approve' ? 'verification_approved' : 'verification_rejected',
      entity: 'business',
      entityId: vr.businessId,
      meta: { businessName: biz?.name, rejectReason: rejectReason || null },
    });

    if (biz) {
      await createAndPushNotification({
        recipientId: biz.ownerId,
        businessId: biz.id,
        type: 'verification',
        title:
          action === 'approve'
            ? `${biz.name} is now Verified!`
            : `Verification update for ${biz.name}`,
        body:
          action === 'approve'
            ? 'Your blue verified badge is now live on your public profile.'
            : `Rejected: ${rejectReason}`,
        link: '/dashboard/verification',
      });
    }

    res.json({ status: nextStatus, business: biz });
  } catch (err) {
    console.error('Verification review failed:', err);
    res.status(500).json({ error: 'Failed to process verification review' });
  }
});

// Reports queue
adminRouter.get('/reports', async (_req, res) => {
  try {
    const list = await db
      .select()
      .from(reports)
      .orderBy(desc(reports.createdAt));
    res.json({ reports: list });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load reports' });
  }
});

adminRouter.post('/reports/:id/action', async (req: AuthRequest, res) => {
  try {
    const action = String(req.body?.action || '');
    if (!['dismiss', 'hide_content', 'suspend_business'].includes(action)) {
      return res.status(400).json({ error: 'Invalid moderation action' });
    }

    const [rep] = await db.select().from(reports).where(eq(reports.id, req.params.id)).limit(1);
    if (!rep) return res.status(404).json({ error: 'Report not found' });

    if (action === 'hide_content') {
      if (rep.targetType === 'review') {
        await db
          .update(reviews)
          .set({ status: 'hidden', updatedAt: new Date() })
          .where(eq(reviews.id, rep.targetId));
      } else if (rep.targetType === 'post') {
        await db
          .update(posts)
          .set({ isHidden: true, updatedAt: new Date() })
          .where(eq(posts.id, rep.targetId));
      }
    } else if (action === 'suspend_business') {
      if (rep.targetType === 'business') {
        await db
          .update(businesses)
          .set({ status: 'suspended', updatedAt: new Date() })
          .where(eq(businesses.id, rep.targetId));
      }
    }

    const [updated] = await db
      .update(reports)
      .set({
        status: action === 'dismiss' ? 'dismissed' : 'actioned',
        updatedAt: new Date(),
      })
      .where(eq(reports.id, rep.id))
      .returning();

    await db.insert(auditLog).values({
      actorId: req.profile!.id,
      action: `report_${action}`,
      entity: rep.targetType,
      entityId: rep.targetId,
      meta: { reportId: rep.id },
    });

    res.json({ report: updated });
  } catch (err) {
    res.status(500).json({ error: 'Failed to action report' });
  }
});

// Category manager
adminRouter.get('/categories', async (_req, res) => {
  try {
    const list = await db.select().from(categories).orderBy(categories.sortOrder);
    res.json({ categories: list });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load categories' });
  }
});

adminRouter.post('/categories', async (req: AuthRequest, res) => {
  try {
    const name = String(req.body?.name || '').trim();
    const icon = String(req.body?.icon || 'store').trim();
    const sortOrder = Number(req.body?.sortOrder || 0);
    const parentId = req.body?.parentId || null;
    if (!name) return res.status(400).json({ error: 'Category name required' });

    const [created] = await db
      .insert(categories)
      .values({
        name,
        slug: slugify(req.body?.slug || name),
        icon,
        sortOrder,
        parentId,
        isActive: true,
      })
      .returning();

    res.status(201).json({ category: created });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create category' });
  }
});

adminRouter.patch('/categories/:id', async (req, res) => {
  try {
    const [existing] = await db
      .select()
      .from(categories)
      .where(eq(categories.id, req.params.id))
      .limit(1);
    if (!existing) return res.status(404).json({ error: 'Category not found' });

    const [updated] = await db
      .update(categories)
      .set({
        name: req.body.name !== undefined ? String(req.body.name) : existing.name,
        icon: req.body.icon !== undefined ? String(req.body.icon) : existing.icon,
        sortOrder: req.body.sortOrder !== undefined ? Number(req.body.sortOrder) : existing.sortOrder,
        isActive: req.body.isActive !== undefined ? Boolean(req.body.isActive) : existing.isActive,
        updatedAt: new Date(),
      })
      .where(eq(categories.id, existing.id))
      .returning();

    res.json({ category: updated });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update category' });
  }
});

adminRouter.delete('/categories/:id', async (req, res) => {
  try {
    await db.delete(categories).where(eq(categories.id, req.params.id));
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete category' });
  }
});

// Businesses manager
adminRouter.get('/businesses', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const list = q
      ? await db
          .select()
          .from(businesses)
          .where(or(ilike(businesses.name, `%${q}%`), ilike(businesses.city, `%${q}%`)))
          .orderBy(desc(businesses.createdAt))
      : await db.select().from(businesses).orderBy(desc(businesses.createdAt));

    res.json({ businesses: list });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load businesses' });
  }
});

adminRouter.patch('/businesses/:id', async (req: AuthRequest, res) => {
  try {
    const [biz] = await db
      .select()
      .from(businesses)
      .where(eq(businesses.id, req.params.id))
      .limit(1);
    if (!biz) return res.status(404).json({ error: 'Business not found' });

    const isVerified =
      req.body.isVerified !== undefined ? Boolean(req.body.isVerified) : biz.isVerified;
    const status = req.body.status !== undefined ? req.body.status : biz.status;

    const [updated] = await db
      .update(businesses)
      .set({
        isVerified,
        verificationStatus: isVerified ? 'approved' : biz.verificationStatus === 'approved' ? 'not_requested' : biz.verificationStatus,
        status,
        updatedAt: new Date(),
      })
      .where(eq(businesses.id, biz.id))
      .returning();

    await db.insert(auditLog).values({
      actorId: req.profile!.id,
      action: 'admin_business_updated',
      entity: 'business',
      entityId: biz.id,
      meta: { isVerified, status },
    });

    res.json({ business: updated });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update business' });
  }
});

// Users list & role management
adminRouter.get('/users', async (_req, res) => {
  try {
    const list = await db.select().from(profiles).orderBy(desc(profiles.createdAt));
    res.json({ users: list });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load users' });
  }
});

adminRouter.patch('/users/:id/role', async (req: AuthRequest, res) => {
  try {
    const role = req.body?.role;
    if (!['customer', 'owner', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }
    const [updated] = await db
      .update(profiles)
      .set({ role, updatedAt: new Date() })
      .where(eq(profiles.id, req.params.id))
      .returning();

    await db.insert(auditLog).values({
      actorId: req.profile!.id,
      action: 'user_role_changed',
      entity: 'profile',
      entityId: req.params.id,
      meta: { role },
    });

    res.json({ user: updated });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update user role' });
  }
});

// Bulk CSV business import
adminRouter.post('/import-csv', async (req: AuthRequest, res) => {
  try {
    const csv = String(req.body?.csv || '');
    const lines = csv
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length < 2) {
      return res.status(400).json({ error: 'CSV requires a header row and at least one data row.' });
    }

    const cats = await db.select().from(categories);
    const catByName = Object.fromEntries(cats.map((c) => [c.name.toLowerCase(), c.id]));

    let imported = 0;
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
      const [name, categoryName, phone, addressLine, city, latStr, lngStr] = cols;
      if (!name) continue;
      const lat = Number(latStr) || 25.5941;
      const lng = Number(lngStr) || 85.1376;
      const baseSlug = slugify(name);
      const uniqueSlug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;
      const catId = catByName[(categoryName || '').toLowerCase()] || cats[0]?.id || null;

      await db.insert(businesses).values({
        ownerId: req.profile!.id,
        name,
        slug: uniqueSlug,
        categoryId: catId,
        phone: phone || '',
        addressLine: addressLine || '',
        city: city || 'Patna',
        lat,
        lng,
        status: 'published',
        logoUrl: '/src/assets/images/hero_local_discovery_1794724069452.jpg',
        coverUrl: '/src/assets/images/hero_local_discovery_1794724069452.jpg',
      });
      imported++;
    }

    await db.insert(auditLog).values({
      actorId: req.profile!.id,
      action: 'admin_bulk_csv_import',
      entity: 'business',
      meta: { imported },
    });

    res.json({ imported });
  } catch (err) {
    console.error('Admin CSV import failed:', err);
    res.status(500).json({ error: 'CSV import failed' });
  }
});

// Audit log
adminRouter.get('/audit-log', async (_req, res) => {
  try {
    const list = await db.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(50);
    res.json({ logs: list });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load audit log' });
  }
});
