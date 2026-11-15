import type { Request, Response, NextFunction } from 'express';
import { eq } from 'drizzle-orm';
import { adminAuth } from '../lib/firebase-admin.ts';
import { db } from '../db/index.ts';
import { profiles } from '../db/schema.ts';

export interface AppUserProfile {
  id: string;
  uid: string;
  email: string;
  fullName: string;
  handle: string | null;
  bio: string | null;
  city: string | null;
  phone: string | null;
  avatarUrl: string | null;
  role: 'customer' | 'owner' | 'admin';
  preferredLang: string;
}

export interface AuthRequest extends Request {
  profile?: AppUserProfile;
}

const ADMIN_EMAILS = new Set([
  'zishanansari00000123@gmail.com',
  'admin@soleweb.app',
]);

async function generateUniqueHandle(email: string, name?: string): Promise<string> {
  const raw = (name || email.split('@')[0] || 'member')
    .toLowerCase()
    .replace(/[^a-z0-9_.]+/g, '')
    .slice(0, 22) || 'member';
  let candidate = raw.length >= 3 ? raw : `${raw}123`;
  let attempt = 0;
  while (attempt < 20) {
    const existing = await db
      .select({ id: profiles.id })
      .from(profiles)
      .where(eq(profiles.handle, candidate))
      .limit(1);
    if (existing.length === 0) return candidate;
    attempt++;
    candidate = `${raw.slice(0, 18)}${Math.floor(100 + Math.random() * 899)}`;
  }
  return `${raw.slice(0, 16)}_${Date.now().toString(36).slice(-4)}`;
}

async function syncProfileFromToken(
  uid: string,
  email: string,
  name?: string,
  picture?: string
): Promise<AppUserProfile> {
  const defaultRole = ADMIN_EMAILS.has(email.toLowerCase()) ? 'admin' : 'customer';

  const existing = await db
    .select()
    .from(profiles)
    .where(eq(profiles.uid, uid))
    .limit(1);

  if (existing.length > 0) {
    const row = existing[0];
    const updates: Partial<typeof profiles.$inferInsert> = {};
    if (ADMIN_EMAILS.has(email.toLowerCase()) && row.role !== 'admin') {
      updates.role = 'admin';
    }
    if (!row.handle) {
      updates.handle = await generateUniqueHandle(email, row.fullName || name);
    }
    if (Object.keys(updates).length > 0) {
      updates.updatedAt = new Date();
      const updated = await db
        .update(profiles)
        .set(updates)
        .where(eq(profiles.id, row.id))
        .returning();
      return updated[0] as AppUserProfile;
    }
    return row as AppUserProfile;
  }

  const uniqueHandle = await generateUniqueHandle(email, name);
  const inserted = await db
    .insert(profiles)
    .values({
      uid,
      email,
      fullName: name || email.split('@')[0] || 'SoleWeb User',
      handle: uniqueHandle,
      avatarUrl: picture || '',
      role: defaultRole,
    })
    .onConflictDoUpdate({
      target: profiles.uid,
      set: {
        email,
        updatedAt: new Date(),
      },
    })
    .returning();

  return inserted[0] as AppUserProfile;
}

export const optionalAuth = async (
  req: AuthRequest,
  _res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }
  const token = authHeader.split('Bearer ')[1];
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    req.profile = await syncProfileFromToken(
      decoded.uid,
      decoded.email || `${decoded.uid}@users.soleweb.app`,
      decoded.name,
      decoded.picture
    );
  } catch (err) {
    console.warn('Optional auth token invalid:', (err as Error).message);
  }
  next();
};

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const token = authHeader.split('Bearer ')[1];
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    req.profile = await syncProfileFromToken(
      decoded.uid,
      decoded.email || `${decoded.uid}@users.soleweb.app`,
      decoded.name,
      decoded.picture
    );
    next();
  } catch (error) {
    console.error('Error verifying Firebase ID token:', error);
    return res.status(401).json({ error: 'Invalid or expired session token' });
  }
};

export const requireAdmin = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  if (!req.profile) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  if (req.profile.role !== 'admin') {
    return res.status(403).json({ error: 'Administrator access required' });
  }
  next();
};
