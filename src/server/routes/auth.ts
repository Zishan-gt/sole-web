import { Router } from 'express';
import { and, desc, eq, ne, sql } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import { notifications, profiles } from '../../db/schema.ts';
import { requireAuth, type AuthRequest } from '../../middleware/auth.ts';
import { profileUpdateSchema } from '../../lib/validators.ts';

export const authRouter = Router();
authRouter.use(requireAuth);

authRouter.get('/me', async (req: AuthRequest, res) => {
  try {
    const unreadNotifs = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.recipientId, req.profile!.id), eq(notifications.isRead, false)))
      .orderBy(desc(notifications.createdAt))
      .limit(20);

    res.json({
      profile: req.profile,
      unreadCount: unreadNotifs.length,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load user profile' });
  }
});

authRouter.patch('/me', async (req: AuthRequest, res) => {
  try {
    const parsed = profileUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid profile update' });
    }
    const data = parsed.data;
    const nextHandle =
      data.handle !== undefined ? data.handle.trim().toLowerCase() : req.profile!.handle;

    if (nextHandle && nextHandle !== (req.profile!.handle || '').toLowerCase()) {
      const collision = await db
        .select({ id: profiles.id })
        .from(profiles)
        .where(and(sql`lower(${profiles.handle}) = ${nextHandle}`, ne(profiles.id, req.profile!.id)))
        .limit(1);
      if (collision.length > 0) {
        return res.status(409).json({ error: `@${nextHandle} is already taken. Try another handle.` });
      }
    }

    const [updated] = await db
      .update(profiles)
      .set({
        fullName: data.fullName !== undefined ? data.fullName.trim() : req.profile!.fullName,
        handle: nextHandle,
        bio: data.bio !== undefined ? data.bio.trim() : (req.profile!.bio ?? ''),
        city: data.city !== undefined ? data.city.trim() : (req.profile!.city ?? ''),
        phone: data.phone !== undefined ? data.phone.trim() : req.profile!.phone,
        preferredLang: data.preferredLang ?? req.profile!.preferredLang,
        updatedAt: new Date(),
      })
      .where(eq(profiles.id, req.profile!.id))
      .returning();

    res.json({ profile: updated });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

authRouter.get('/notifications', async (req: AuthRequest, res) => {
  try {
    const list = await db
      .select()
      .from(notifications)
      .where(eq(notifications.recipientId, req.profile!.id))
      .orderBy(desc(notifications.createdAt))
      .limit(40);
    res.json({ notifications: list });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load notifications' });
  }
});

authRouter.post('/notifications/read', async (req: AuthRequest, res) => {
  try {
    const id = req.body?.id ? String(req.body.id) : null;
    if (id) {
      await db
        .update(notifications)
        .set({ isRead: true })
        .where(and(eq(notifications.id, id), eq(notifications.recipientId, req.profile!.id)));
    } else {
      await db
        .update(notifications)
        .set({ isRead: true })
        .where(eq(notifications.recipientId, req.profile!.id));
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to mark notifications read' });
  }
});
