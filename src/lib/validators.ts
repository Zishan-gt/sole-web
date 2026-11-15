import { z } from 'zod';

const BLOCKED_WORDS = ['spam', 'scam', 'fake', 'fuck', 'shit', 'bitch', 'asshole', 'bastard'];

export function containsProfanityOrSpam(text: string): boolean {
  const lower = text.toLowerCase();
  if (BLOCKED_WORDS.some((w) => new RegExp(`\\b${w}\\b`, 'i').test(lower))) {
    return true;
  }
  if (/https?:\/\/\S+/i.test(text) && text.length < 35) {
    return true;
  }
  return false;
}

export const businessUpsertSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(2).max(120),
  slug: z
    .string()
    .min(2)
    .max(120)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  categoryId: z.string().uuid().nullable().optional(),
  subcategory: z.string().max(100).optional().default(''),
  bio: z.string().max(1000).optional().default(''),
  phone: z.string().max(30).optional().default(''),
  whatsapp: z.string().max(30).optional().default(''),
  email: z.string().email().or(z.literal('')).optional().default(''),
  website: z.string().max(300).optional().default(''),
  googleMapsUrl: z.string().max(1000).optional().default(''),
  addressLine: z.string().max(300).optional().default(''),
  area: z.string().max(120).optional().default(''),
  city: z.string().max(120).optional().default(''),
  state: z.string().max(120).optional().default(''),
  pincode: z.string().max(20).optional().default(''),
  country: z.string().max(10).optional().default('IN'),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  logoUrl: z.string().max(2_200_000).optional().default(''),
  coverUrl: z.string().max(2_200_000).optional().default(''),
  hours: z.record(z.string(), z.object({
    open: z.string(),
    close: z.string(),
    closed: z.boolean(),
  })).optional().default({}),
  socialLinks: z.record(z.string(), z.string()).optional().default({}),
  tags: z.array(z.string().max(40)).max(20).optional().default([]),
  status: z.enum(['draft', 'published']).optional().default('published'),
});

export const postCreateSchema = z.object({
  businessId: z.string().uuid(),
  type: z.enum(['photo', 'video']).default('photo'),
  mediaUrl: z.string().min(1).max(2_200_000),
  posterUrl: z.string().max(500_000).optional().default(''),
  caption: z.string().max(1000).optional().default(''),
  trimStartSec: z.number().min(0).max(3600).optional().default(0),
  trimEndSec: z.number().min(0).max(3600).nullable().optional(),
  durationSec: z.number().min(0).max(3600).nullable().optional(),
  isPinned: z.boolean().optional().default(false),
  sortOrder: z.number().int().optional().default(0),
});

export const productUpsertSchema = z.object({
  id: z.string().uuid().optional(),
  businessId: z.string().uuid(),
  type: z.enum(['product', 'service']).default('product'),
  name: z.string().min(2).max(160),
  description: z.string().max(2000).optional().default(''),
  categoryLabel: z.string().max(80).optional().default(''),
  price: z.number().nonnegative(),
  discountPrice: z.number().nonnegative().nullable().optional(),
  unit: z.string().max(40).optional().default('unit'),
  durationMinutes: z.number().int().positive().nullable().optional(),
  sku: z.string().max(60).optional().default(''),
  images: z.array(z.string().max(1500)).max(6).optional().default([]),
  tags: z.array(z.string().max(40)).max(20).optional().default([]),
  isActive: z.boolean().optional().default(true),
  quantity: z.number().int().min(0).optional().default(10),
  costPrice: z.number().nonnegative().optional().default(0),
  lowStockThreshold: z.number().int().min(0).optional().default(5),
  trackStock: z.boolean().optional().default(true),
});

export const stockAdjustSchema = z.object({
  productId: z.string().uuid(),
  change: z.number().int(),
  type: z.enum(['in', 'out', 'adjust']),
  note: z.string().max(300).optional().default(''),
});

export const reviewCreateSchema = z.object({
  businessId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().min(2).max(1000),
});

export const enquiryCreateSchema = z.object({
  businessId: z.string().uuid(),
  productId: z.string().uuid().nullable().optional(),
  name: z.string().min(2).max(120),
  phone: z.string().min(5).max(30),
  message: z.string().min(3).max(1500),
});

export const reportCreateSchema = z.object({
  targetType: z.enum(['business', 'review', 'post']),
  targetId: z.string().uuid(),
  reason: z.string().min(2).max(120),
  details: z.string().max(1000).optional().default(''),
});

export const eventCreateSchema = z.object({
  businessId: z.string().uuid(),
  productId: z.string().uuid().nullable().optional(),
  eventType: z.enum([
    'profile_view',
    'call_click',
    'whatsapp_click',
    'directions_click',
    'product_view',
    'share',
  ]),
  sessionId: z.string().min(4).max(120),
});

export const verificationSubmitSchema = z.object({
  businessId: z.string().uuid(),
  documentType: z.string().min(2).max(80),
  documentUrls: z.array(z.string().min(1)).min(1).max(5),
  storefrontPhotoUrl: z.string().min(1),
  phoneVerified: z.boolean().default(true),
});

export const profileUpdateSchema = z.object({
  fullName: z.string().min(1).max(80).optional(),
  handle: z
    .string()
    .min(3)
    .max(32)
    .regex(/^[a-zA-Z0-9_.]+$/, 'Handle can only contain letters, numbers, underscores, and dots')
    .optional(),
  bio: z.string().max(200).optional(),
  city: z.string().max(80).optional(),
  phone: z.string().max(30).optional(),
  preferredLang: z.enum(['en', 'hi']).optional(),
});

export const chatMessageSchema = z.object({
  text: z.string().min(1).max(1500),
  attachmentType: z.enum(['product', 'location']).nullable().optional(),
  attachmentData: z.record(z.string(), z.unknown()).nullable().optional(),
});
