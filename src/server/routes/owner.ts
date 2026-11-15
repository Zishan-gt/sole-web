import express, { Router } from 'express';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import QRCode from 'qrcode';
import { db, pool } from '../../db/index.ts';
import {
  analyticsEvents,
  businesses,
  enquiries,
  inventory,
  posts,
  products,
  profiles,
  reviews,
  stockMovements,
  verificationRequests,
} from '../../db/schema.ts';
import { requireAuth, type AuthRequest } from '../../middleware/auth.ts';
import {
  businessUpsertSchema,
  postCreateSchema,
  productUpsertSchema,
  stockAdjustSchema,
  verificationSubmitSchema,
} from '../../lib/validators.ts';
import { notifyAdmins } from '../../lib/realtime.ts';
import { mirrorSinglePostToFirestore } from '../../lib/firestore-sync.ts';

export const ownerRouter = Router();
ownerRouter.use(requireAuth);

async function assertOwnsBusiness(profileId: string, role: string, businessId: string) {
  const [biz] = await db
    .select()
    .from(businesses)
    .where(eq(businesses.id, businessId))
    .limit(1);
  if (!biz) return null;
  if (biz.ownerId !== profileId && role !== 'admin') return null;
  return biz;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'business';
}

// List owner's businesses (supports multiple businesses per owner)
ownerRouter.get('/businesses', async (req: AuthRequest, res) => {
  try {
    const list = await db
      .select()
      .from(businesses)
      .where(eq(businesses.ownerId, req.profile!.id))
      .orderBy(desc(businesses.createdAt));
    res.json({ businesses: list });
  } catch (err) {
    console.error('GET /api/owner/businesses failed:', err);
    res.status(500).json({ error: 'Failed to fetch your businesses' });
  }
});

// Create or update a business (onboarding wizard & profile editor)
ownerRouter.post('/businesses', async (req: AuthRequest, res) => {
  try {
    const parsed = businessUpsertSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid business payload' });
    }
    const data = parsed.data;

    // Elevate customer -> owner when creating their first business
    if (req.profile!.role === 'customer') {
      await db
        .update(profiles)
        .set({ role: 'owner', updatedAt: new Date() })
        .where(eq(profiles.id, req.profile!.id));
      req.profile!.role = 'owner';
    }

    if (data.id) {
      const existing = await assertOwnsBusiness(req.profile!.id, req.profile!.role, data.id);
      if (!existing) return res.status(403).json({ error: 'Forbidden' });

      const nextSlug = data.slug ? slugify(data.slug) : existing.slug;
      const [updated] = await db
        .update(businesses)
        .set({
          name: data.name,
          slug: nextSlug,
          categoryId: data.categoryId ?? null,
          subcategory: data.subcategory,
          bio: data.bio,
          phone: data.phone,
          whatsapp: data.whatsapp,
          email: data.email,
          website: data.website,
          googleMapsUrl: data.googleMapsUrl,
          addressLine: data.addressLine,
          area: data.area,
          city: data.city,
          state: data.state,
          pincode: data.pincode,
          country: data.country,
          lat: data.lat,
          lng: data.lng,
          logoUrl: data.logoUrl,
          coverUrl: data.coverUrl,
          hours: data.hours,
          socialLinks: data.socialLinks,
          tags: data.tags,
          status: data.status,
          updatedAt: new Date(),
        })
        .where(eq(businesses.id, data.id))
        .returning();

      return res.json({ business: updated });
    }

    // Generate unique slug
    const baseSlug = slugify(data.slug || data.name);
    let uniqueSlug = baseSlug;
    let suffix = 1;
    while (true) {
      const collision = await db
        .select({ id: businesses.id })
        .from(businesses)
        .where(eq(businesses.slug, uniqueSlug))
        .limit(1);
      if (collision.length === 0) break;
      uniqueSlug = `${baseSlug}-${suffix++}`;
    }

    const [created] = await db
      .insert(businesses)
      .values({
        ownerId: req.profile!.id,
        name: data.name,
        slug: uniqueSlug,
        categoryId: data.categoryId ?? null,
        subcategory: data.subcategory,
        bio: data.bio,
        phone: data.phone,
        whatsapp: data.whatsapp,
        email: data.email,
        website: data.website,
        googleMapsUrl: data.googleMapsUrl,
        addressLine: data.addressLine,
        area: data.area,
        city: data.city,
        state: data.state,
        pincode: data.pincode,
        country: data.country,
        lat: data.lat,
        lng: data.lng,
        logoUrl: data.logoUrl,
        coverUrl: data.coverUrl,
        hours: data.hours,
        socialLinks: data.socialLinks,
        tags: data.tags,
        status: data.status,
      })
      .returning();

    res.status(201).json({ business: created });
  } catch (err) {
    console.error('POST /api/owner/businesses failed:', err);
    res.status(500).json({ error: 'Failed to save business' });
  }
});

// Posts management
ownerRouter.get('/posts', async (req: AuthRequest, res) => {
  try {
    const businessId = String(req.query.businessId || '');
    const biz = await assertOwnsBusiness(req.profile!.id, req.profile!.role, businessId);
    if (!biz) return res.status(403).json({ error: 'Forbidden' });

    const list = await db
      .select()
      .from(posts)
      .where(eq(posts.businessId, biz.id))
      .orderBy(desc(posts.isPinned), posts.sortOrder, desc(posts.createdAt));

    res.json({ posts: list });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch posts' });
  }
});

// Native video & cover frame binary upload -> returns persistent /uploads/media/... URL
const MIME_TO_EXT: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'video/ogg': 'ogv',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

ownerRouter.post(
  '/media/upload',
  express.raw({ type: ['video/*', 'image/*'], limit: '45mb' }),
  async (req: AuthRequest, res) => {
    try {
      const contentType = String(req.headers['content-type'] || '')
        .split(';')[0]
        .trim()
        .toLowerCase();
      const ext = MIME_TO_EXT[contentType];
      if (!ext) {
        return res.status(400).json({
          error: 'Unsupported media type. Upload MP4, WebM, MOV video or JPEG/PNG/WebP image.',
        });
      }

      const buf = req.body;
      if (!Buffer.isBuffer(buf) || buf.length === 0) {
        return res.status(400).json({ error: 'Empty media upload payload' });
      }
      if (buf.length > 45 * 1024 * 1024) {
        return res.status(413).json({ error: 'File exceeds 45 MB upload limit' });
      }

      const uploadDir = path.resolve(process.cwd(), 'uploads', 'media');
      await fs.mkdir(uploadDir, { recursive: true });
      const fileName = `${crypto.randomUUID()}.${ext}`;
      const targetPath = path.join(uploadDir, fileName);
      await fs.writeFile(targetPath, buf);

      res.status(201).json({
        url: `/uploads/media/${fileName}`,
        mimeType: contentType,
        sizeBytes: buf.length,
      });
    } catch (err) {
      console.error('POST /api/owner/media/upload failed:', err);
      res.status(500).json({ error: 'Media upload failed' });
    }
  }
);

ownerRouter.post('/posts', async (req: AuthRequest, res) => {
  try {
    const parsed = postCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid post' });
    }
    const data = parsed.data;
    const biz = await assertOwnsBusiness(req.profile!.id, req.profile!.role, data.businessId);
    if (!biz) return res.status(403).json({ error: 'Forbidden' });

    if (data.isPinned) {
      const pinned = await db
        .select({ id: posts.id })
        .from(posts)
        .where(and(eq(posts.businessId, biz.id), eq(posts.isPinned, true)));
      if (pinned.length >= 3) {
        return res.status(400).json({ error: 'You can pin at most 3 posts.' });
      }
    }

    const [created] = await db.insert(posts).values(data).returning();
    void mirrorSinglePostToFirestore(created.id);
    res.status(201).json({ post: created });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create post' });
  }
});

ownerRouter.patch('/posts/:id', async (req: AuthRequest, res) => {
  try {
    const [post] = await db.select().from(posts).where(eq(posts.id, req.params.id)).limit(1);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    const biz = await assertOwnsBusiness(req.profile!.id, req.profile!.role, post.businessId);
    if (!biz) return res.status(403).json({ error: 'Forbidden' });

    const isPinned = req.body.isPinned !== undefined ? Boolean(req.body.isPinned) : post.isPinned;
    if (isPinned && !post.isPinned) {
      const pinned = await db
        .select({ id: posts.id })
        .from(posts)
        .where(and(eq(posts.businessId, biz.id), eq(posts.isPinned, true)));
      if (pinned.length >= 3) {
        return res.status(400).json({ error: 'Maximum 3 pinned posts allowed.' });
      }
    }

    const [updated] = await db
      .update(posts)
      .set({
        caption: req.body.caption !== undefined ? String(req.body.caption) : post.caption,
        isPinned,
        sortOrder: req.body.sortOrder !== undefined ? Number(req.body.sortOrder) : post.sortOrder,
        updatedAt: new Date(),
      })
      .where(eq(posts.id, post.id))
      .returning();

    res.json({ post: updated });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update post' });
  }
});

ownerRouter.delete('/posts/:id', async (req: AuthRequest, res) => {
  try {
    const [post] = await db.select().from(posts).where(eq(posts.id, req.params.id)).limit(1);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    const biz = await assertOwnsBusiness(req.profile!.id, req.profile!.role, post.businessId);
    if (!biz) return res.status(403).json({ error: 'Forbidden' });

    await db.delete(posts).where(eq(posts.id, post.id));
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete post' });
  }
});

// Products & Services catalogue
ownerRouter.get('/products', async (req: AuthRequest, res) => {
  try {
    const businessId = String(req.query.businessId || '');
    const biz = await assertOwnsBusiness(req.profile!.id, req.profile!.role, businessId);
    if (!biz) return res.status(403).json({ error: 'Forbidden' });

    const list = await db
      .select()
      .from(products)
      .where(eq(products.businessId, biz.id))
      .orderBy(desc(products.createdAt));

    const invList =
      list.length > 0
        ? await db
            .select()
            .from(inventory)
            .where(inArray(inventory.productId, list.map((p) => p.id)))
        : [];
    const invMap = Object.fromEntries(invList.map((i) => [i.productId, i]));

    res.json({
      products: list.map((p) => ({
        ...p,
        inventory: invMap[p.id] || null,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load products' });
  }
});

ownerRouter.post('/products', async (req: AuthRequest, res) => {
  try {
    const parsed = productUpsertSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid product' });
    }
    const data = parsed.data;
    const biz = await assertOwnsBusiness(req.profile!.id, req.profile!.role, data.businessId);
    if (!biz) return res.status(403).json({ error: 'Forbidden' });

    const availability =
      data.type === 'service' || !data.trackStock
        ? ('not_tracked' as const)
        : data.quantity <= 0
          ? ('out_of_stock' as const)
          : data.quantity <= data.lowStockThreshold
            ? ('low_stock' as const)
            : ('in_stock' as const);

    if (data.id) {
      const [updated] = await db
        .update(products)
        .set({
          type: data.type,
          name: data.name,
          description: data.description,
          categoryLabel: data.categoryLabel,
          price: String(data.price),
          discountPrice: data.discountPrice !== null && data.discountPrice !== undefined ? String(data.discountPrice) : null,
          unit: data.unit,
          durationMinutes: data.durationMinutes ?? null,
          sku: data.sku,
          images: data.images,
          tags: data.tags,
          isActive: data.isActive,
          availability,
          updatedAt: new Date(),
        })
        .where(and(eq(products.id, data.id), eq(products.businessId, biz.id)))
        .returning();

      if (data.type === 'product') {
        await db
          .insert(inventory)
          .values({
            productId: updated.id,
            quantity: data.quantity,
            costPrice: String(data.costPrice),
            lowStockThreshold: data.lowStockThreshold,
            trackStock: data.trackStock,
          })
          .onConflictDoUpdate({
            target: inventory.productId,
            set: {
              costPrice: String(data.costPrice),
              lowStockThreshold: data.lowStockThreshold,
              trackStock: data.trackStock,
              updatedAt: new Date(),
            },
          });
      }

      return res.json({ product: updated });
    }

    const [created] = await db
      .insert(products)
      .values({
        businessId: biz.id,
        type: data.type,
        name: data.name,
        description: data.description,
        categoryLabel: data.categoryLabel,
        price: String(data.price),
        discountPrice: data.discountPrice !== null && data.discountPrice !== undefined ? String(data.discountPrice) : null,
        unit: data.unit,
        durationMinutes: data.durationMinutes ?? null,
        sku: data.sku,
        images: data.images,
        tags: data.tags,
        isActive: data.isActive,
        availability,
      })
      .returning();

    if (data.type === 'product') {
      await db.insert(inventory).values({
        productId: created.id,
        quantity: data.quantity,
        costPrice: String(data.costPrice),
        lowStockThreshold: data.lowStockThreshold,
        trackStock: data.trackStock,
      });
      await db.insert(stockMovements).values({
        productId: created.id,
        change: data.quantity,
        type: 'in',
        note: 'Opening inventory',
        createdBy: req.profile!.id,
      });
    }

    res.status(201).json({ product: created });
  } catch (err) {
    console.error('POST /api/owner/products failed:', err);
    res.status(500).json({ error: 'Failed to save product' });
  }
});

ownerRouter.post('/products/:id/duplicate', async (req: AuthRequest, res) => {
  try {
    const [orig] = await db.select().from(products).where(eq(products.id, req.params.id)).limit(1);
    if (!orig) return res.status(404).json({ error: 'Product not found' });
    const biz = await assertOwnsBusiness(req.profile!.id, req.profile!.role, orig.businessId);
    if (!biz) return res.status(403).json({ error: 'Forbidden' });

    const [dup] = await db
      .insert(products)
      .values({
        businessId: orig.businessId,
        type: orig.type,
        name: `${orig.name} (Copy)`,
        description: orig.description,
        categoryLabel: orig.categoryLabel,
        price: orig.price,
        discountPrice: orig.discountPrice,
        unit: orig.unit,
        durationMinutes: orig.durationMinutes,
        sku: orig.sku ? `${orig.sku}-COPY` : '',
        images: orig.images,
        tags: orig.tags,
        isActive: false,
        availability: orig.availability,
      })
      .returning();

    if (orig.type === 'product') {
      await db.insert(inventory).values({
        productId: dup.id,
        quantity: 0,
        costPrice: '0',
        lowStockThreshold: 5,
        trackStock: true,
      });
    }

    res.status(201).json({ product: dup });
  } catch (err) {
    res.status(500).json({ error: 'Failed to duplicate product' });
  }
});

ownerRouter.delete('/products/:id', async (req: AuthRequest, res) => {
  try {
    const [orig] = await db.select().from(products).where(eq(products.id, req.params.id)).limit(1);
    if (!orig) return res.status(404).json({ error: 'Product not found' });
    const biz = await assertOwnsBusiness(req.profile!.id, req.profile!.role, orig.businessId);
    if (!biz) return res.status(403).json({ error: 'Forbidden' });

    await db.delete(products).where(eq(products.id, orig.id));
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

// CSV Import & Export for products
ownerRouter.post('/products/import-csv', async (req: AuthRequest, res) => {
  try {
    const businessId = String(req.body?.businessId || '');
    const csvText = String(req.body?.csv || '');
    const biz = await assertOwnsBusiness(req.profile!.id, req.profile!.role, businessId);
    if (!biz) return res.status(403).json({ error: 'Forbidden' });

    const lines = csvText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length < 2) {
      return res.status(400).json({ error: 'CSV must include header row and at least one item.' });
    }

    let imported = 0;
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
      const [name, typeRaw, priceRaw, qtyRaw, unit, categoryLabel, sku] = cols;
      if (!name) continue;
      const type = typeRaw === 'service' ? 'service' : 'product';
      const price = Math.max(0, Number(priceRaw) || 0);
      const qty = Math.max(0, Math.floor(Number(qtyRaw) || 0));

      const [created] = await db
        .insert(products)
        .values({
          businessId: biz.id,
          type,
          name,
          price: String(price),
          unit: unit || 'unit',
          categoryLabel: categoryLabel || '',
          sku: sku || '',
          availability: type === 'service' ? 'not_tracked' : qty <= 0 ? 'out_of_stock' : qty <= 5 ? 'low_stock' : 'in_stock',
        })
        .returning();

      if (type === 'product') {
        await db.insert(inventory).values({
          productId: created.id,
          quantity: qty,
          costPrice: '0',
          lowStockThreshold: 5,
          trackStock: true,
        });
      }
      imported++;
    }

    res.json({ imported });
  } catch (err) {
    res.status(500).json({ error: 'CSV import failed' });
  }
});

ownerRouter.get('/products/export-csv', async (req: AuthRequest, res) => {
  try {
    const businessId = String(req.query.businessId || '');
    const biz = await assertOwnsBusiness(req.profile!.id, req.profile!.role, businessId);
    if (!biz) return res.status(403).json({ error: 'Forbidden' });

    const list = await db.select().from(products).where(eq(products.businessId, biz.id));
    const invRows =
      list.length > 0
        ? await db.select().from(inventory).where(inArray(inventory.productId, list.map((p) => p.id)))
        : [];
    const invMap = Object.fromEntries(invRows.map((i) => [i.productId, i]));

    const header = 'name,type,price,quantity,unit,category,sku,availability';
    const rows = list.map((p) =>
      [
        `"${p.name.replace(/"/g, '""')}"`,
        p.type,
        p.price,
        invMap[p.id]?.quantity ?? 0,
        p.unit || 'unit',
        `"${(p.categoryLabel || '').replace(/"/g, '""')}"`,
        p.sku || '',
        p.availability,
      ].join(',')
    );

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${biz.slug}-catalogue.csv"`);
    res.send([header, ...rows].join('\n'));
  } catch (err) {
    res.status(500).json({ error: 'Export failed' });
  }
});

// Inventory management
ownerRouter.get('/inventory', async (req: AuthRequest, res) => {
  try {
    const businessId = String(req.query.businessId || '');
    const biz = await assertOwnsBusiness(req.profile!.id, req.profile!.role, businessId);
    if (!biz) return res.status(403).json({ error: 'Forbidden' });

    const prodRows = await db
      .select()
      .from(products)
      .where(and(eq(products.businessId, biz.id), eq(products.type, 'product')))
      .orderBy(products.name);

    const ids = prodRows.map((p) => p.id);
    const invRows = ids.length
      ? await db.select().from(inventory).where(inArray(inventory.productId, ids))
      : [];
    const movRows = ids.length
      ? await db
          .select()
          .from(stockMovements)
          .where(inArray(stockMovements.productId, ids))
          .orderBy(desc(stockMovements.createdAt))
          .limit(50)
      : [];

    const invMap = Object.fromEntries(invRows.map((i) => [i.productId, i]));
    const items = prodRows.map((p) => {
      const inv = invMap[p.id] || {
        productId: p.id,
        quantity: 0,
        costPrice: '0',
        lowStockThreshold: 5,
        trackStock: true,
      };
      const sell = Number(p.discountPrice ?? p.price);
      const cost = Number(inv.costPrice);
      return {
        productId: p.id,
        name: p.name,
        sku: p.sku,
        sellingPrice: sell,
        costPrice: cost,
        marginPerUnit: Number((sell - cost).toFixed(2)),
        quantity: inv.quantity,
        lowStockThreshold: inv.lowStockThreshold,
        trackStock: inv.trackStock,
        availability: p.availability,
        stockValue: Number((inv.quantity * cost).toFixed(2)),
        retailValue: Number((inv.quantity * sell).toFixed(2)),
      };
    });

    const totalStockCostValue = items.reduce((s, x) => s + x.stockValue, 0);
    const totalRetailValue = items.reduce((s, x) => s + x.retailValue, 0);
    const lowStockItems = items.filter((x) => x.trackStock && x.quantity > 0 && x.quantity <= x.lowStockThreshold);
    const outOfStockItems = items.filter((x) => x.trackStock && x.quantity <= 0);

    res.json({
      items,
      movements: movRows,
      summary: {
        totalProducts: items.length,
        totalStockCostValue: Number(totalStockCostValue.toFixed(2)),
        totalRetailValue: Number(totalRetailValue.toFixed(2)),
        estimatedProfitValue: Number((totalRetailValue - totalStockCostValue).toFixed(2)),
        lowStockCount: lowStockItems.length,
        outOfStockCount: outOfStockItems.length,
      },
    });
  } catch (err) {
    console.error('GET /api/owner/inventory failed:', err);
    res.status(500).json({ error: 'Failed to load inventory' });
  }
});

// Atomic stock adjustment (writes stock_movements + updates inventory in one transaction; DB trigger updates product availability)
ownerRouter.post('/inventory/adjust', async (req: AuthRequest, res) => {
  try {
    const parsed = stockAdjustSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid stock adjustment payload' });
    }
    const { productId, change, type, note } = parsed.data;

    const [prod] = await db.select().from(products).where(eq(products.id, productId)).limit(1);
    if (!prod) return res.status(404).json({ error: 'Product not found' });
    const biz = await assertOwnsBusiness(req.profile!.id, req.profile!.role, prod.businessId);
    if (!biz) return res.status(403).json({ error: 'Forbidden' });
    if (prod.type === 'service') {
      return res.status(400).json({ error: 'Services skip inventory tracking.' });
    }

    const signedDelta = type === 'out' ? -Math.abs(change) : type === 'in' ? Math.abs(change) : change;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO inventory (product_id, quantity, cost_price, low_stock_threshold, track_stock)
         VALUES ($1, GREATEST(0, $2), 0, 5, true)
         ON CONFLICT (product_id) DO UPDATE
         SET quantity = GREATEST(0, inventory.quantity + $2), updated_at = NOW()`,
        [productId, signedDelta]
      );
      await client.query(
        `INSERT INTO stock_movements (product_id, change, type, note, created_by)
         VALUES ($1, $2, $3, $4, $5)`,
        [productId, signedDelta, type, note || '', req.profile!.id]
      );
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    const [updatedInv] = await db
      .select()
      .from(inventory)
      .where(eq(inventory.productId, productId))
      .limit(1);
    const [updatedProd] = await db
      .select()
      .from(products)
      .where(eq(products.id, productId))
      .limit(1);

    res.json({ inventory: updatedInv, product: updatedProd });
  } catch (err) {
    console.error('POST /api/owner/inventory/adjust failed:', err);
    res.status(500).json({ error: 'Failed to adjust stock' });
  }
});

// Enquiries inbox
ownerRouter.get('/enquiries', async (req: AuthRequest, res) => {
  try {
    const businessId = String(req.query.businessId || '');
    const biz = await assertOwnsBusiness(req.profile!.id, req.profile!.role, businessId);
    if (!biz) return res.status(403).json({ error: 'Forbidden' });

    const list = await db
      .select()
      .from(enquiries)
      .where(eq(enquiries.businessId, biz.id))
      .orderBy(desc(enquiries.createdAt));

    res.json({ enquiries: list });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load enquiries' });
  }
});

ownerRouter.patch('/enquiries/:id', async (req: AuthRequest, res) => {
  try {
    const [enq] = await db.select().from(enquiries).where(eq(enquiries.id, req.params.id)).limit(1);
    if (!enq) return res.status(404).json({ error: 'Enquiry not found' });
    const biz = await assertOwnsBusiness(req.profile!.id, req.profile!.role, enq.businessId);
    if (!biz) return res.status(403).json({ error: 'Forbidden' });

    const status = req.body?.status;
    if (!['new', 'read', 'replied'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const [updated] = await db
      .update(enquiries)
      .set({ status, updatedAt: new Date() })
      .where(eq(enquiries.id, enq.id))
      .returning();

    res.json({ enquiry: updated });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update enquiry' });
  }
});

ownerRouter.delete('/enquiries/:id', async (req: AuthRequest, res) => {
  try {
    const [enq] = await db.select().from(enquiries).where(eq(enquiries.id, req.params.id)).limit(1);
    if (!enq) return res.status(404).json({ error: 'Enquiry not found' });
    const biz = await assertOwnsBusiness(req.profile!.id, req.profile!.role, enq.businessId);
    if (!biz) return res.status(403).json({ error: 'Forbidden' });

    await db.delete(enquiries).where(eq(enquiries.id, enq.id));
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete enquiry' });
  }
});

// Reviews management & owner reply
ownerRouter.get('/reviews', async (req: AuthRequest, res) => {
  try {
    const businessId = String(req.query.businessId || '');
    const biz = await assertOwnsBusiness(req.profile!.id, req.profile!.role, businessId);
    if (!biz) return res.status(403).json({ error: 'Forbidden' });

    const list = await db
      .select({
        id: reviews.id,
        rating: reviews.rating,
        comment: reviews.comment,
        ownerReply: reviews.ownerReply,
        ownerRepliedAt: reviews.ownerRepliedAt,
        status: reviews.status,
        createdAt: reviews.createdAt,
        authorName: profiles.fullName,
      })
      .from(reviews)
      .innerJoin(profiles, eq(reviews.userId, profiles.id))
      .where(eq(reviews.businessId, biz.id))
      .orderBy(desc(reviews.createdAt));

    res.json({ reviews: list });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load reviews' });
  }
});

ownerRouter.post('/reviews/:id/reply', async (req: AuthRequest, res) => {
  try {
    const replyText = String(req.body?.reply || '').trim();
    if (replyText.length < 2) return res.status(400).json({ error: 'Reply cannot be empty' });

    const [rev] = await db.select().from(reviews).where(eq(reviews.id, req.params.id)).limit(1);
    if (!rev) return res.status(404).json({ error: 'Review not found' });
    const biz = await assertOwnsBusiness(req.profile!.id, req.profile!.role, rev.businessId);
    if (!biz) return res.status(403).json({ error: 'Forbidden' });
    if (rev.ownerReply) {
      return res.status(400).json({ error: 'You can only reply once per review.' });
    }

    const [updated] = await db
      .update(reviews)
      .set({ ownerReply: replyText, ownerRepliedAt: new Date(), updatedAt: new Date() })
      .where(eq(reviews.id, rev.id))
      .returning();

    res.json({ review: updated });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save reply' });
  }
});

// Analytics dashboard (7, 30, 90 days)
ownerRouter.get('/analytics', async (req: AuthRequest, res) => {
  try {
    const businessId = String(req.query.businessId || '');
    const days = [7, 30, 90].includes(Number(req.query.days)) ? Number(req.query.days) : 30;
    const biz = await assertOwnsBusiness(req.profile!.id, req.profile!.role, businessId);
    if (!biz) return res.status(403).json({ error: 'Forbidden' });

    const [countsRes, seriesRes, enquiryCountRes, topProductsRes, stockRes] = await Promise.all([
      pool.query(
        `SELECT event_type, COUNT(*)::int AS total
         FROM analytics_events
         WHERE business_id = $1 AND created_at >= NOW() - ($2 || ' days')::interval
         GROUP BY event_type`,
        [biz.id, days]
      ),
      pool.query(
        `SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day,
                COUNT(*) FILTER (WHERE event_type = 'profile_view')::int AS views,
                COUNT(*) FILTER (WHERE event_type IN ('call_click','whatsapp_click','directions_click'))::int AS actions
         FROM analytics_events
         WHERE business_id = $1 AND created_at >= NOW() - ($2 || ' days')::interval
         GROUP BY 1
         ORDER BY 1 ASC`,
        [biz.id, days]
      ),
      pool.query(
        `SELECT COUNT(*)::int AS total FROM enquiries
         WHERE business_id = $1 AND created_at >= NOW() - ($2 || ' days')::interval`,
        [biz.id, days]
      ),
      db
        .select({
          id: products.id,
          name: products.name,
          viewCount: products.viewCount,
          availability: products.availability,
          price: products.price,
        })
        .from(products)
        .where(eq(products.businessId, biz.id))
        .orderBy(desc(products.viewCount))
        .limit(5),
      pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE availability = 'low_stock')::int AS low_stock,
           COUNT(*) FILTER (WHERE availability = 'out_of_stock')::int AS out_of_stock
         FROM products WHERE business_id = $1 AND type = 'product'`,
        [biz.id]
      ),
    ]);

    const byType = Object.fromEntries(countsRes.rows.map((r) => [r.event_type, r.total]));
    res.json({
      totals: {
        views: byType['profile_view'] ?? 0,
        calls: byType['call_click'] ?? 0,
        directions: byType['directions_click'] ?? 0,
        whatsapp: byType['whatsapp_click'] ?? 0,
        shares: byType['share'] ?? 0,
        enquiries: enquiryCountRes.rows[0]?.total ?? 0,
        lowStockCount: stockRes.rows[0]?.low_stock ?? 0,
        outOfStockCount: stockRes.rows[0]?.out_of_stock ?? 0,
      },
      series: seriesRes.rows,
      topProducts: topProductsRes,
    });
  } catch (err) {
    console.error('GET /api/owner/analytics failed:', err);
    res.status(500).json({ error: 'Failed to load analytics' });
  }
});

// Verification request
ownerRouter.get('/verification', async (req: AuthRequest, res) => {
  try {
    const businessId = String(req.query.businessId || '');
    const biz = await assertOwnsBusiness(req.profile!.id, req.profile!.role, businessId);
    if (!biz) return res.status(403).json({ error: 'Forbidden' });

    const list = await db
      .select()
      .from(verificationRequests)
      .where(eq(verificationRequests.businessId, biz.id))
      .orderBy(desc(verificationRequests.createdAt));

    res.json({ requests: list, businessStatus: biz.verificationStatus, isVerified: biz.isVerified });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch verification status' });
  }
});

ownerRouter.post('/verification', async (req: AuthRequest, res) => {
  try {
    const parsed = verificationSubmitSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid verification payload' });
    }
    const data = parsed.data;
    const biz = await assertOwnsBusiness(req.profile!.id, req.profile!.role, data.businessId);
    if (!biz) return res.status(403).json({ error: 'Forbidden' });

    const [created] = await db
      .insert(verificationRequests)
      .values({
        businessId: biz.id,
        documentType: data.documentType,
        documentUrls: data.documentUrls,
        storefrontPhotoUrl: data.storefrontPhotoUrl,
        phoneVerified: data.phoneVerified,
        status: 'pending',
      })
      .returning();

    await db
      .update(businesses)
      .set({ verificationStatus: 'pending', updatedAt: new Date() })
      .where(eq(businesses.id, biz.id));

    await notifyAdmins({
      businessId: biz.id,
      type: 'verification',
      title: `Verification requested: ${biz.name}`,
      body: `${data.documentType} submitted for review.`,
      link: '/admin/verifications',
    });

    res.status(201).json({ request: created });
  } catch (err) {
    res.status(500).json({ error: 'Failed to submit verification request' });
  }
});

// QR code generation
ownerRouter.get('/qr/:businessId', async (req: AuthRequest, res) => {
  try {
    const biz = await assertOwnsBusiness(req.profile!.id, req.profile!.role, req.params.businessId);
    if (!biz) return res.status(403).json({ error: 'Forbidden' });

    const origin =
      process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
    const targetUrl = `${origin.replace(/\/$/, '')}/b/${biz.slug}`;
    const qrDataUrl = await QRCode.toDataURL(targetUrl, {
      width: 512,
      margin: 2,
      color: { dark: '#0f172a', light: '#ffffff' },
    });

    res.json({ qrDataUrl, targetUrl, businessName: biz.name, slug: biz.slug });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate QR code' });
  }
});
