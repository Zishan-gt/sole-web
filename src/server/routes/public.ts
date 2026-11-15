import { Router } from 'express';
import { and, count, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { db, pool } from '../../db/index.ts';
import {
  analyticsEvents,
  businesses,
  categories,
  enquiries,
  favorites,
  posts,
  products,
  profiles,
  reports,
  reviews,
  type BusinessHoursMap,
} from '../../db/schema.ts';
import { optionalAuth, requireAuth, type AuthRequest } from '../../middleware/auth.ts';
import {
  containsProfanityOrSpam,
  enquiryCreateSchema,
  eventCreateSchema,
  reportCreateSchema,
  reviewCreateSchema,
} from '../../lib/validators.ts';
import { extractCoordsFromGoogleMapsUrl } from '../../lib/maps.ts';
import { createAndPushNotification, notifyAdmins } from '../../lib/realtime.ts';
import { adminDb } from '../../lib/firebase-admin.ts';

export const publicRouter = Router();

// Simple in-memory rate limiter (swappable with Redis in production)
const rateLimits = new Map<string, { count: number; resetAt: number }>();
function checkRateLimit(key: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = rateLimits.get(key);
  if (!entry || entry.resetAt < now) {
    rateLimits.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= maxRequests) return false;
  entry.count += 1;
  return true;
}

// Nominatim cache
const geocodeCache = new Map<string, { data: unknown; expiresAt: number }>();

export function isBusinessOpenNow(hours?: BusinessHoursMap | null): boolean {
  if (!hours || Object.keys(hours).length === 0) return true;
  const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const now = new Date();
  const dayKey = days[now.getDay()];
  const slot = hours[dayKey];
  if (!slot || slot.closed) return false;
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  return hhmm >= slot.open && hhmm <= slot.close;
}

// Home page data
publicRouter.get('/home', async (_req, res) => {
  try {
    const [cats, verifiedList, recentList, cityStats] = await Promise.all([
      db
        .select()
        .from(categories)
        .where(eq(categories.isActive, true))
        .orderBy(categories.sortOrder),
      db
        .select({
          id: businesses.id,
          name: businesses.name,
          slug: businesses.slug,
          categoryId: businesses.categoryId,
          subcategory: businesses.subcategory,
          bio: businesses.bio,
          area: businesses.area,
          city: businesses.city,
          country: businesses.country,
          lat: businesses.lat,
          lng: businesses.lng,
          logoUrl: businesses.logoUrl,
          coverUrl: businesses.coverUrl,
          isVerified: businesses.isVerified,
          ratingAvg: businesses.ratingAvg,
          ratingCount: businesses.ratingCount,
          hours: businesses.hours,
          phone: businesses.phone,
          googleMapsUrl: businesses.googleMapsUrl,
        })
        .from(businesses)
        .where(and(eq(businesses.status, 'published'), eq(businesses.isVerified, true)))
        .orderBy(desc(businesses.ratingAvg), desc(businesses.createdAt))
        .limit(8),
      db
        .select({
          id: businesses.id,
          name: businesses.name,
          slug: businesses.slug,
          categoryId: businesses.categoryId,
          subcategory: businesses.subcategory,
          bio: businesses.bio,
          area: businesses.area,
          city: businesses.city,
          country: businesses.country,
          lat: businesses.lat,
          lng: businesses.lng,
          logoUrl: businesses.logoUrl,
          coverUrl: businesses.coverUrl,
          isVerified: businesses.isVerified,
          ratingAvg: businesses.ratingAvg,
          ratingCount: businesses.ratingCount,
          hours: businesses.hours,
          phone: businesses.phone,
          googleMapsUrl: businesses.googleMapsUrl,
        })
        .from(businesses)
        .where(eq(businesses.status, 'published'))
        .orderBy(desc(businesses.createdAt))
        .limit(8),
      db
        .select({
          city: businesses.city,
          count: count(),
        })
        .from(businesses)
        .where(eq(businesses.status, 'published'))
        .groupBy(businesses.city)
        .orderBy(desc(count()))
        .limit(8),
    ]);

    const catMap = Object.fromEntries(cats.map((c) => [c.id, c]));
    const decorate = (b: typeof verifiedList[number]) => ({
      ...b,
      categoryName: b.categoryId ? catMap[b.categoryId]?.name || 'Other' : 'Other',
      categorySlug: b.categoryId ? catMap[b.categoryId]?.slug || 'other' : 'other',
      isOpenNow: isBusinessOpenNow(b.hours),
    });

    res.json({
      categories: cats,
      verifiedBusinesses: verifiedList.map(decorate),
      recentBusinesses: recentList.map(decorate),
      popularCities: cityStats.filter((c) => c.city && c.city.trim().length > 0),
    });
  } catch (err) {
    console.error('GET /api/home failed:', err);
    res.status(500).json({ error: 'Failed to load home data' });
  }
});

// Categories list
publicRouter.get('/categories', async (_req, res) => {
  try {
    const list = await db
      .select()
      .from(categories)
      .where(eq(categories.isActive, true))
      .orderBy(categories.sortOrder);
    res.json({ categories: list });
  } catch (err) {
    console.error('GET /api/categories failed:', err);
    res.status(500).json({ error: 'Failed to load categories' });
  }
});

// Search businesses using PostgreSQL full-text search (tsvector) + trigram similarity + distance
publicRouter.get('/search', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const lat = req.query.lat !== undefined && req.query.lat !== '' ? Number(req.query.lat) : null;
    const lng = req.query.lng !== undefined && req.query.lng !== '' ? Number(req.query.lng) : null;
    const radiusKm =
      req.query.radius_km !== undefined && req.query.radius_km !== ''
        ? Number(req.query.radius_km)
        : 0;
    const categorySlug = String(req.query.category || '').trim();
    const city = String(req.query.city || '').trim();
    const onlyVerified = req.query.verified === 'true';
    const openNow = req.query.open_now === 'true';
    const hasProducts = req.query.has_products === 'true';
    const sort = String(req.query.sort || (lat !== null && lng !== null ? 'distance' : 'rating'));
    const page = Math.max(1, Number(req.query.page || 1));
    const pageSize = Math.min(40, Math.max(1, Number(req.query.page_size || 18)));

    const hasCoords =
      lat !== null && lng !== null && Number.isFinite(lat) && Number.isFinite(lng);

    const distanceSql = hasCoords
      ? `(6371 * acos(LEAST(1.0, GREATEST(-1.0,
          cos(radians($1)) * cos(radians(b.lat)) * cos(radians(b.lng) - radians($2)) +
          sin(radians($1)) * sin(radians(b.lat))
        ))))`
      : `0::double precision`;

    const params: unknown[] = [];
    if (hasCoords) {
      params.push(lat, lng);
    }

    const conditions: string[] = [`b.status = 'published'`];

    if (categorySlug) {
      params.push(categorySlug);
      conditions.push(`c.slug = $${params.length}`);
    }

    if (city) {
      params.push(`%${city}%`);
      conditions.push(`(b.city ILIKE $${params.length} OR b.area ILIKE $${params.length})`);
    }

    if (onlyVerified) {
      conditions.push(`b.is_verified = true`);
    }

    if (hasProducts) {
      conditions.push(
        `EXISTS (SELECT 1 FROM products p WHERE p.business_id = b.id AND p.is_active = true)`
      );
    }

    let rankSql = `0::double precision`;
    if (q.length > 0) {
      params.push(q);
      const qIdx = params.length;
      const likeParam = `%${q}%`;
      params.push(likeParam);
      const likeIdx = params.length;

      rankSql = `(
        ts_rank(
          to_tsvector('english', coalesce(b.name,'') || ' ' || coalesce(b.subcategory,'') || ' ' || coalesce(b.bio,'') || ' ' || coalesce(b.city,'') || ' ' || coalesce(b.area,'') || ' ' || coalesce(c.name,'') || ' ' || array_to_string(coalesce(b.tags,'{}'), ' ')),
          plainto_tsquery('english', $${qIdx})
        ) * 2.0
        + GREATEST(
          similarity(lower(b.name), lower($${qIdx})),
          coalesce((SELECT MAX(similarity(lower(p.name), lower($${qIdx}))) FROM products p WHERE p.business_id = b.id), 0)
        )
      )`;

      conditions.push(`(
        to_tsvector('english', coalesce(b.name,'') || ' ' || coalesce(b.subcategory,'') || ' ' || coalesce(b.bio,'') || ' ' || coalesce(b.city,'') || ' ' || coalesce(b.area,'') || ' ' || coalesce(c.name,'') || ' ' || array_to_string(coalesce(b.tags,'{}'), ' ')) @@ plainto_tsquery('english', $${qIdx})
        OR similarity(lower(b.name), lower($${qIdx})) > 0.16
        OR b.name ILIKE $${likeIdx}
        OR b.city ILIKE $${likeIdx}
        OR b.area ILIKE $${likeIdx}
        OR c.name ILIKE $${likeIdx}
        OR EXISTS (
          SELECT 1 FROM products p
          WHERE p.business_id = b.id AND p.is_active = true
            AND (p.name ILIKE $${likeIdx} OR similarity(lower(p.name), lower($${qIdx})) > 0.2)
        )
      )`);
    }

    if (hasCoords && radiusKm > 0) {
      params.push(radiusKm);
      conditions.push(`${distanceSql} <= $${params.length}`);
    }

    const orderBy =
      sort === 'newest'
        ? `b.created_at DESC`
        : sort === 'rating'
          ? `b.rating_avg DESC, b.rating_count DESC, distance_km ASC`
          : q.length > 0 && !hasCoords
            ? `relevance DESC, b.is_verified DESC, b.rating_avg DESC`
            : hasCoords
              ? `distance_km ASC, b.is_verified DESC, b.rating_avg DESC`
              : `b.is_verified DESC, b.rating_avg DESC`;

    const sqlText = `
      SELECT
        b.id, b.name, b.slug, b.category_id AS "categoryId", b.subcategory, b.bio,
        b.phone, b.whatsapp, b.email, b.website, b.google_maps_url AS "googleMapsUrl",
        b.address_line AS "addressLine", b.area, b.city, b.state, b.pincode, b.country,
        b.lat, b.lng, b.logo_url AS "logoUrl", b.cover_url AS "coverUrl",
        b.hours, b.tags, b.is_verified AS "isVerified",
        b.rating_avg AS "ratingAvg", b.rating_count AS "ratingCount",
        b.created_at AS "createdAt",
        coalesce(c.name, 'Other') AS "categoryName",
        coalesce(c.slug, 'other') AS "categorySlug",
        ${distanceSql} AS distance_km,
        ${rankSql} AS relevance,
        (SELECT COUNT(*)::int FROM products p WHERE p.business_id = b.id AND p.is_active = true) AS "productsCount"
      FROM businesses b
      LEFT JOIN categories c ON c.id = b.category_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY ${orderBy}
    `;

    const result = await pool.query(sqlText, params);
    let rows = result.rows.map((r) => ({
      ...r,
      distanceKm: hasCoords ? Number(Number(r.distance_km).toFixed(2)) : null,
      isOpenNow: isBusinessOpenNow(r.hours),
    }));

    if (openNow) {
      rows = rows.filter((r) => r.isOpenNow);
    }

    const total = rows.length;
    const start = (page - 1) * pageSize;
    const paginated = rows.slice(start, start + pageSize);

    res.json({
      businesses: paginated,
      total,
      page,
      pageSize,
      hasMore: start + pageSize < total,
    });
  } catch (err) {
    console.error('GET /api/search failed:', err);
    res.status(500).json({ error: 'Search query failed' });
  }
});

// Get business profile by slug
publicRouter.get('/businesses/:slug', optionalAuth, async (req: AuthRequest, res) => {
  try {
    const slug = req.params.slug;
    const [biz] = await db
      .select()
      .from(businesses)
      .where(eq(businesses.slug, slug))
      .limit(1);

    if (!biz || (biz.status === 'suspended' && req.profile?.role !== 'admin')) {
      return res.status(404).json({ error: 'Business not found' });
    }

    const [cat, bizPosts, bizProducts, bizReviews] = await Promise.all([
      biz.categoryId
        ? db.select().from(categories).where(eq(categories.id, biz.categoryId)).limit(1)
        : Promise.resolve([]),
      db
        .select()
        .from(posts)
        .where(and(eq(posts.businessId, biz.id), eq(posts.isHidden, false)))
        .orderBy(desc(posts.isPinned), posts.sortOrder, desc(posts.createdAt)),
      db
        .select({
          id: products.id,
          businessId: products.businessId,
          type: products.type,
          name: products.name,
          description: products.description,
          categoryLabel: products.categoryLabel,
          price: products.price,
          discountPrice: products.discountPrice,
          unit: products.unit,
          durationMinutes: products.durationMinutes,
          sku: products.sku,
          images: products.images,
          tags: products.tags,
          isActive: products.isActive,
          availability: products.availability,
          viewCount: products.viewCount,
          createdAt: products.createdAt,
        })
        .from(products)
        .where(and(eq(products.businessId, biz.id), eq(products.isActive, true)))
        .orderBy(desc(products.createdAt)),
      db
        .select({
          id: reviews.id,
          businessId: reviews.businessId,
          userId: reviews.userId,
          rating: reviews.rating,
          comment: reviews.comment,
          ownerReply: reviews.ownerReply,
          ownerRepliedAt: reviews.ownerRepliedAt,
          createdAt: reviews.createdAt,
          authorName: profiles.fullName,
          authorHandle: profiles.handle,
          authorAvatar: profiles.avatarUrl,
        })
        .from(reviews)
        .innerJoin(profiles, eq(reviews.userId, profiles.id))
        .where(and(eq(reviews.businessId, biz.id), eq(reviews.status, 'visible')))
        .orderBy(desc(reviews.createdAt)),
    ]);

    let isFavorited = false;
    if (req.profile) {
      const fav = await db
        .select()
        .from(favorites)
        .where(and(eq(favorites.userId, req.profile.id), eq(favorites.businessId, biz.id)))
        .limit(1);
      isFavorited = fav.length > 0;
    }

    res.json({
      business: {
        ...biz,
        categoryName: cat[0]?.name || 'Other',
        categorySlug: cat[0]?.slug || 'other',
        isOpenNow: isBusinessOpenNow(biz.hours),
      },
      counts: {
        posts: bizPosts.length,
        products: bizProducts.length,
        reviews: bizReviews.length,
      },
      posts: bizPosts,
      products: bizProducts,
      reviews: bizReviews,
      isFavorited,
    });
  } catch (err) {
    console.error('GET /api/businesses/:slug failed:', err);
    res.status(500).json({ error: 'Failed to load business profile' });
  }
});

// Product detail
publicRouter.get('/businesses/:slug/products/:productId', async (req, res) => {
  try {
    const [biz] = await db
      .select()
      .from(businesses)
      .where(eq(businesses.slug, req.params.slug))
      .limit(1);

    if (!biz) return res.status(404).json({ error: 'Business not found' });

    const [prod] = await db
      .select({
        id: products.id,
        businessId: products.businessId,
        type: products.type,
        name: products.name,
        description: products.description,
        categoryLabel: products.categoryLabel,
        price: products.price,
        discountPrice: products.discountPrice,
        unit: products.unit,
        durationMinutes: products.durationMinutes,
        sku: products.sku,
        images: products.images,
        tags: products.tags,
        isActive: products.isActive,
        availability: products.availability,
        viewCount: products.viewCount,
        createdAt: products.createdAt,
      })
      .from(products)
      .where(and(eq(products.id, req.params.productId), eq(products.businessId, biz.id)))
      .limit(1);

    if (!prod) return res.status(404).json({ error: 'Product not found' });

    await db
      .update(products)
      .set({ viewCount: prod.viewCount + 1 })
      .where(eq(products.id, prod.id));

    res.json({ product: prod, business: biz });
  } catch (err) {
    console.error('GET /api/businesses/:slug/products/:productId failed:', err);
    res.status(500).json({ error: 'Failed to load product' });
  }
});

// Geocode proxy (OpenStreetMap Nominatim)
publicRouter.get('/geocode', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return res.json({ results: [] });

    const cacheKey = `fwd:${q.toLowerCase()}`;
    const cached = geocodeCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return res.json({ results: cached.data });
    }

    const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=6&q=${encodeURIComponent(q)}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'SoleWeb/1.0 (https://soleweb.app; hello@soleweb.app)',
        'Accept-Language': 'en',
      },
    });
    if (!response.ok) {
      return res.json({ results: [] });
    }
    const raw = (await response.json()) as Array<{
      display_name: string;
      lat: string;
      lon: string;
      address?: Record<string, string>;
    }>;

    const mapped = raw.map((item) => ({
      label: item.display_name,
      lat: parseFloat(item.lat),
      lng: parseFloat(item.lon),
      city:
        item.address?.city ||
        item.address?.town ||
        item.address?.village ||
        item.address?.state_district ||
        '',
      area: item.address?.suburb || item.address?.neighbourhood || '',
      state: item.address?.state || '',
      pincode: item.address?.postcode || '',
      country: (item.address?.country_code || 'IN').toUpperCase(),
    }));

    geocodeCache.set(cacheKey, { data: mapped, expiresAt: Date.now() + 1000 * 60 * 30 });
    res.json({ results: mapped });
  } catch (err) {
    console.error('Geocode failed:', err);
    res.json({ results: [] });
  }
});

// Reverse geocode proxy
publicRouter.get('/reverse-geocode', async (req, res) => {
  try {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ error: 'Invalid coordinates' });
    }

    const cacheKey = `rev:${lat.toFixed(4)},${lng.toFixed(4)}`;
    const cached = geocodeCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return res.json(cached.data);
    }

    const url = `https://nominatim.openstreetmap.org/reverse?format=json&addressdetails=1&lat=${lat}&lon=${lng}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'SoleWeb/1.0 (https://soleweb.app; hello@soleweb.app)',
        'Accept-Language': 'en',
      },
    });

    if (!response.ok) {
      return res.json({
        label: `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
        addressLine: '',
        area: '',
        city: '',
        state: '',
        pincode: '',
        country: 'IN',
      });
    }

    const item = (await response.json()) as {
      display_name?: string;
      address?: Record<string, string>;
    };
    const addr = item.address || {};
    const payload = {
      label: item.display_name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
      addressLine: [addr.house_number, addr.road].filter(Boolean).join(' ') || item.display_name?.split(',')[0] || '',
      area: addr.suburb || addr.neighbourhood || addr.quarter || '',
      city: addr.city || addr.town || addr.village || addr.state_district || '',
      state: addr.state || '',
      pincode: addr.postcode || '',
      country: (addr.country_code || 'IN').toUpperCase(),
    };

    geocodeCache.set(cacheKey, { data: payload, expiresAt: Date.now() + 1000 * 60 * 30 });
    res.json(payload);
  } catch (err) {
    console.error('Reverse geocode failed:', err);
    res.status(500).json({ error: 'Reverse geocode failed' });
  }
});

// Resolve pasted Google Maps URL -> follow short links, extract coordinates, and reverse-geocode address
publicRouter.post('/maps/resolve', async (req, res) => {
  try {
    const rawUrl = String(req.body?.url || '').trim();
    if (!rawUrl || !rawUrl.startsWith('http')) {
      return res.status(400).json({ error: 'Please paste a valid Google Maps URL starting with http/https.' });
    }

    let finalUrl = rawUrl;
    let parsed = extractCoordsFromGoogleMapsUrl(rawUrl);

    if (
      (parsed.lat === null || parsed.lng === null) &&
      (rawUrl.includes('goo.gl') || rawUrl.includes('maps.app.goo.gl') || rawUrl.includes('g.co'))
    ) {
      try {
        const resp = await fetch(rawUrl, {
          method: 'GET',
          redirect: 'follow',
          headers: { 'User-Agent': 'Mozilla/5.0' },
        });
        finalUrl = resp.url || rawUrl;
        parsed = extractCoordsFromGoogleMapsUrl(finalUrl);
        if (parsed.lat === null || parsed.lng === null) {
          const html = await resp.text();
          const bodyMatch = html.match(/(-?\d{1,2}\.\d{4,8}),\s*(-?\d{1,3}\.\d{4,8})/);
          if (bodyMatch) {
            parsed.lat = parseFloat(bodyMatch[1]);
            parsed.lng = parseFloat(bodyMatch[2]);
          }
        }
      } catch (e) {
        console.warn('Google Maps redirect resolution error:', e);
      }
    }

    if (parsed.lat === null || parsed.lng === null) {
      return res.status(422).json({
        error: 'Could not extract coordinates from that link. Try opening the location on Google Maps and copying the full browser URL.',
        resolvedUrl: finalUrl,
      });
    }

    // Reverse geocode extracted coordinates to pre-fill global address fields
    let addressData = {
      label: `${parsed.lat.toFixed(5)}, ${parsed.lng.toFixed(5)}`,
      addressLine: parsed.placeName || '',
      area: '',
      city: '',
      state: '',
      pincode: '',
      country: 'IN',
    };

    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=json&addressdetails=1&lat=${parsed.lat}&lon=${parsed.lng}`;
      const geoResp = await fetch(url, {
        headers: {
          'User-Agent': 'SoleWeb/1.0 (https://soleweb.app; hello@soleweb.app)',
          'Accept-Language': 'en',
        },
      });
      if (geoResp.ok) {
        const item = (await geoResp.json()) as {
          display_name?: string;
          address?: Record<string, string>;
        };
        const addr = item.address || {};
        addressData = {
          label: item.display_name || addressData.label,
          addressLine:
            [addr.house_number, addr.road].filter(Boolean).join(' ') ||
            parsed.placeName ||
            item.display_name?.split(',')[0] ||
            '',
          area: addr.suburb || addr.neighbourhood || addr.quarter || '',
          city: addr.city || addr.town || addr.village || addr.state_district || '',
          state: addr.state || '',
          pincode: addr.postcode || '',
          country: (addr.country_code || 'IN').toUpperCase(),
        };
      }
    } catch {
      // Fallback to coordinate-only
    }

    res.json({
      lat: parsed.lat,
      lng: parsed.lng,
      placeName: parsed.placeName,
      resolvedUrl: finalUrl,
      ...addressData,
    });
  } catch (err) {
    console.error('POST /api/maps/resolve failed:', err);
    res.status(500).json({ error: 'Failed to resolve Google Maps link' });
  }
});

// Track analytics events (rate limited + session deduplicated)
publicRouter.post('/events', async (req, res) => {
  try {
    const ipKey = `evt:${req.ip}`;
    if (!checkRateLimit(ipKey, 120, 60_000)) {
      return res.status(429).json({ error: 'Too many events' });
    }
    const parsed = eventCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid event payload' });
    }
    const { businessId, productId, eventType, sessionId } = parsed.data;

    // Deduplicate within 10 minutes per session
    const dedupCheck = await pool.query(
      `SELECT 1 FROM analytics_events
       WHERE business_id = $1 AND event_type = $2 AND session_id = $3
         AND coalesce(product_id::text, '') = coalesce($4, '')
         AND created_at > NOW() - INTERVAL '10 minutes'
       LIMIT 1`,
      [businessId, eventType, sessionId, productId ?? null]
    );

    if (dedupCheck.rows.length > 0) {
      return res.json({ recorded: false, deduplicated: true });
    }

    await db.insert(analyticsEvents).values({
      businessId,
      productId: productId ?? null,
      eventType,
      sessionId,
    });

    res.json({ recorded: true });
  } catch (err) {
    console.error('POST /api/events failed:', err);
    res.status(500).json({ error: 'Failed to record event' });
  }
});

// Submit enquiry + real-time push notification to business owner
publicRouter.post('/enquiries', optionalAuth, async (req: AuthRequest, res) => {
  try {
    if (!checkRateLimit(`enq:${req.ip}`, 10, 60_000)) {
      return res.status(429).json({ error: 'Rate limit exceeded. Please try again in a minute.' });
    }
    const parsed = enquiryCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid enquiry' });
    }

    const data = parsed.data;
    if (containsProfanityOrSpam(data.message)) {
      return res.status(400).json({ error: 'Message flagged by spam filter.' });
    }

    const [biz] = await db
      .select()
      .from(businesses)
      .where(eq(businesses.id, data.businessId))
      .limit(1);
    if (!biz) return res.status(404).json({ error: 'Business not found' });

    const [created] = await db
      .insert(enquiries)
      .values({
        businessId: data.businessId,
        productId: data.productId ?? null,
        userId: req.profile?.id ?? null,
        name: data.name,
        phone: data.phone,
        message: data.message,
        status: 'new',
      })
      .returning();

    // Real-time push notification to owner
    await createAndPushNotification({
      recipientId: biz.ownerId,
      businessId: biz.id,
      type: 'enquiry',
      title: `New enquiry for ${biz.name}`,
      body: `${data.name}: ${data.message.slice(0, 90)}`,
      link: '/dashboard/enquiries',
    });

    res.status(201).json({ enquiry: created });
  } catch (err) {
    console.error('POST /api/enquiries failed:', err);
    res.status(500).json({ error: 'Failed to submit enquiry' });
  }
});

// Submit review (1 per user per business) + real-time notification
publicRouter.post('/reviews', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!checkRateLimit(`rev:${req.profile!.id}`, 10, 60_000)) {
      return res.status(429).json({ error: 'Too many review requests.' });
    }
    const parsed = reviewCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid review' });
    }
    const data = parsed.data;
    if (containsProfanityOrSpam(data.comment)) {
      return res.status(400).json({ error: 'Review contains disallowed words or spam links.' });
    }

    const [biz] = await db
      .select()
      .from(businesses)
      .where(eq(businesses.id, data.businessId))
      .limit(1);
    if (!biz) return res.status(404).json({ error: 'Business not found' });

    const existing = await db
      .select()
      .from(reviews)
      .where(and(eq(reviews.businessId, data.businessId), eq(reviews.userId, req.profile!.id)))
      .limit(1);

    if (existing.length > 0) {
      return res.status(409).json({ error: 'You have already reviewed this business.' });
    }

    const [created] = await db
      .insert(reviews)
      .values({
        businessId: data.businessId,
        userId: req.profile!.id,
        rating: data.rating,
        comment: data.comment,
        status: 'visible',
      })
      .returning();

    await createAndPushNotification({
      recipientId: biz.ownerId,
      businessId: biz.id,
      type: 'review',
      title: `New ${data.rating}★ review on ${biz.name}`,
      body: `${req.profile!.fullName}: ${data.comment.slice(0, 90)}`,
      link: '/dashboard/reviews',
    });

    res.status(201).json({
      review: {
        ...created,
        authorName: req.profile!.fullName,
        authorAvatar: req.profile!.avatarUrl,
      },
    });
  } catch (err) {
    console.error('POST /api/reviews failed:', err);
    res.status(500).json({ error: 'Failed to submit review' });
  }
});

// Toggle favorite
publicRouter.post('/favorites', requireAuth, async (req: AuthRequest, res) => {
  try {
    const businessId = String(req.body?.businessId || '');
    if (!businessId) return res.status(400).json({ error: 'businessId required' });

    const existing = await db
      .select()
      .from(favorites)
      .where(and(eq(favorites.userId, req.profile!.id), eq(favorites.businessId, businessId)))
      .limit(1);

    if (existing.length > 0) {
      await db
        .delete(favorites)
        .where(and(eq(favorites.userId, req.profile!.id), eq(favorites.businessId, businessId)));
      return res.json({ saved: false });
    }

    await db.insert(favorites).values({
      userId: req.profile!.id,
      businessId,
    });

    const [biz] = await db
      .select({ id: businesses.id, name: businesses.name, ownerId: businesses.ownerId })
      .from(businesses)
      .where(eq(businesses.id, businessId))
      .limit(1);
    if (biz && biz.ownerId !== req.profile!.id) {
      await createAndPushNotification({
        recipientId: biz.ownerId,
        businessId: biz.id,
        type: 'favorite',
        title: `${biz.name} was saved`,
        body: `${req.profile!.fullName} bookmarked your storefront.`,
        link: '/dashboard/analytics',
      });
    }

    res.json({ saved: true });
  } catch (err) {
    console.error('POST /api/favorites failed:', err);
    res.status(500).json({ error: 'Failed to update saved business' });
  }
});

// List saved favorites
publicRouter.get('/favorites', requireAuth, async (req: AuthRequest, res) => {
  try {
    const favRows = await db
      .select({ businessId: favorites.businessId })
      .from(favorites)
      .where(eq(favorites.userId, req.profile!.id))
      .orderBy(desc(favorites.createdAt));

    if (favRows.length === 0) return res.json({ businesses: [] });

    const ids = favRows.map((f) => f.businessId);
    const list = await db
      .select()
      .from(businesses)
      .where(inArray(businesses.id, ids));

    const cats = await db.select().from(categories);
    const catMap = Object.fromEntries(cats.map((c) => [c.id, c]));

    res.json({
      businesses: list.map((b) => ({
        ...b,
        categoryName: b.categoryId ? catMap[b.categoryId]?.name || 'Other' : 'Other',
        categorySlug: b.categoryId ? catMap[b.categoryId]?.slug || 'other' : 'other',
        isOpenNow: isBusinessOpenNow(b.hours),
      })),
    });
  } catch (err) {
    console.error('GET /api/favorites failed:', err);
    res.status(500).json({ error: 'Failed to load saved businesses' });
  }
});

// Report content
publicRouter.post('/reports', optionalAuth, async (req: AuthRequest, res) => {
  try {
    if (!checkRateLimit(`rep:${req.ip}`, 8, 60_000)) {
      return res.status(429).json({ error: 'Rate limit exceeded' });
    }
    const parsed = reportCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid report' });
    }

    const [created] = await db
      .insert(reports)
      .values({
        targetType: parsed.data.targetType,
        targetId: parsed.data.targetId,
        reporterId: req.profile?.id ?? null,
        reason: parsed.data.reason,
        details: parsed.data.details,
        status: 'open',
      })
      .returning();

    await notifyAdmins({
      type: 'report',
      title: `New ${parsed.data.targetType} report`,
      body: parsed.data.reason,
      link: '/admin/reports',
    });

    res.status(201).json({ report: created });
  } catch (err) {
    console.error('POST /api/reports failed:', err);
    res.status(500).json({ error: 'Failed to submit report' });
  }
});

// SEO city / category counts helper
publicRouter.get('/directory/cities', async (_req, res) => {
  try {
    const rows = await db
      .select({ city: businesses.city, country: businesses.country, total: count() })
      .from(businesses)
      .where(eq(businesses.status, 'published'))
      .groupBy(businesses.city, businesses.country)
      .orderBy(desc(count()));
    res.json({ cities: rows.filter((r) => r.city) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load cities' });
  }
});

// Instagram-style unified social feed from PostgreSQL (augmented with Firestore live interactions)
publicRouter.get('/feed', async (req, res) => {
  try {
    const lat = req.query.lat !== undefined && req.query.lat !== '' ? Number(req.query.lat) : null;
    const lng = req.query.lng !== undefined && req.query.lng !== '' ? Number(req.query.lng) : null;
    const hasCoords = lat !== null && lng !== null && Number.isFinite(lat) && Number.isFinite(lng);

    const distanceSql = hasCoords
      ? `(6371 * acos(LEAST(1.0, GREATEST(-1.0,
          cos(radians($1)) * cos(radians(b.lat)) * cos(radians(b.lng) - radians($2)) +
          sin(radians($1)) * sin(radians(b.lat))
        ))))`
      : `NULL::double precision`;

    const sqlText = `
      SELECT
        p.id,
        p.business_id AS "businessId",
        p.type AS "mediaType",
        p.media_url AS "mediaUrl",
        p.poster_url AS "posterUrl",
        p.caption,
        p.trim_start_sec AS "trimStartSec",
        p.trim_end_sec AS "trimEndSec",
        p.duration_sec AS "durationSec",
        p.is_pinned AS "isPinned",
        p.created_at AS "createdAt",
        b.slug AS "businessSlug",
        b.name AS "businessName",
        b.logo_url AS "businessLogo",
        b.cover_url AS "businessCover",
        b.is_verified AS "businessVerified",
        b.area,
        b.city,
        b.lat,
        b.lng,
        b.google_maps_url AS "googleMapsUrl",
        b.phone,
        b.whatsapp,
        b.tags,
        b.hours,
        coalesce(c.name, 'Local Business') AS "categoryName",
        ${distanceSql} AS "distanceKm",
        (
          SELECT json_build_object(
            'id', pr.id,
            'name', pr.name,
            'price', pr.price,
            'discountPrice', pr.discount_price
          )
          FROM products pr
          WHERE pr.business_id = b.id AND pr.is_active = true
          ORDER BY pr.view_count DESC, pr.created_at DESC
          LIMIT 1
        ) AS "featuredProduct"
      FROM posts p
      INNER JOIN businesses b ON b.id = p.business_id
      LEFT JOIN categories c ON c.id = b.category_id
      WHERE p.is_hidden = false AND b.status = 'published'
      ORDER BY p.is_pinned DESC, p.created_at DESC
      LIMIT 40
    `;

    const result = await pool.query(sqlText, hasCoords ? [lat, lng] : []);
    const feed = result.rows.map((r) => ({
      ...r,
      distanceKm:
        r.distanceKm !== null && r.distanceKm !== undefined
          ? Number(Number(r.distanceKm).toFixed(2))
          : null,
      isOpenNow: isBusinessOpenNow(r.hours),
    }));

    res.json({ feed });
  } catch (err) {
    console.error('GET /api/feed failed:', err);
    res.status(500).json({ error: 'Failed to load social feed' });
  }
});

// Public Customer Profile (/api/users/:handle) — strictly non-PII
publicRouter.get('/users/:handle', async (req, res) => {
  try {
    const rawHandle = decodeURIComponent(String(req.params.handle || ''))
      .replace(/^@/, '')
      .trim()
      .toLowerCase();
    if (!rawHandle) {
      return res.status(400).json({ error: 'Handle is required' });
    }

    const [prof] = await db
      .select({
        id: profiles.id,
        uid: profiles.uid,
        fullName: profiles.fullName,
        handle: profiles.handle,
        bio: profiles.bio,
        city: profiles.city,
        avatarUrl: profiles.avatarUrl,
        role: profiles.role,
        createdAt: profiles.createdAt,
      })
      .from(profiles)
      .where(or(sql`lower(${profiles.handle}) = ${rawHandle}`, eq(profiles.uid, rawHandle)))
      .limit(1);

    if (!prof) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const [userReviews, userFavorites, ownedBusinesses] = await Promise.all([
      db
        .select({
          id: reviews.id,
          rating: reviews.rating,
          comment: reviews.comment,
          createdAt: reviews.createdAt,
          businessId: businesses.id,
          businessName: businesses.name,
          businessSlug: businesses.slug,
          businessLogo: businesses.logoUrl,
          businessCover: businesses.coverUrl,
          businessCity: businesses.city,
          businessVerified: businesses.isVerified,
        })
        .from(reviews)
        .innerJoin(businesses, eq(reviews.businessId, businesses.id))
        .where(
          and(
            eq(reviews.userId, prof.id),
            eq(reviews.status, 'visible'),
            eq(businesses.status, 'published')
          )
        )
        .orderBy(desc(reviews.createdAt))
        .limit(40),
      db
        .select({
          businessId: businesses.id,
          name: businesses.name,
          slug: businesses.slug,
          logoUrl: businesses.logoUrl,
          coverUrl: businesses.coverUrl,
          city: businesses.city,
          area: businesses.area,
          isVerified: businesses.isVerified,
          ratingAvg: businesses.ratingAvg,
          ratingCount: businesses.ratingCount,
          categoryName: categories.name,
        })
        .from(favorites)
        .innerJoin(businesses, eq(favorites.businessId, businesses.id))
        .leftJoin(categories, eq(businesses.categoryId, categories.id))
        .where(and(eq(favorites.userId, prof.id), eq(businesses.status, 'published')))
        .orderBy(desc(favorites.createdAt))
        .limit(40),
      db
        .select({
          id: businesses.id,
          name: businesses.name,
          slug: businesses.slug,
          logoUrl: businesses.logoUrl,
          coverUrl: businesses.coverUrl,
          city: businesses.city,
          area: businesses.area,
          isVerified: businesses.isVerified,
          ratingAvg: businesses.ratingAvg,
          ratingCount: businesses.ratingCount,
          categoryName: categories.name,
        })
        .from(businesses)
        .leftJoin(categories, eq(businesses.categoryId, categories.id))
        .where(and(eq(businesses.ownerId, prof.id), eq(businesses.status, 'published')))
        .orderBy(desc(businesses.createdAt)),
    ]);

    // Merge followed storefronts from Firestore if available
    let followedBusinesses: Array<{
      businessId: string;
      businessSlug: string;
      businessName: string;
      businessLogo?: string | null;
    }> = [];
    try {
      const followSnap = await adminDb
        .collection('follows')
        .where('followerUid', '==', prof.uid)
        .limit(60)
        .get();
      followedBusinesses = followSnap.docs.map((d) => {
        const data = d.data();
        return {
          businessId: String(data.businessId || ''),
          businessSlug: String(data.businessSlug || ''),
          businessName: String(data.businessName || ''),
          businessLogo: (data.businessLogo as string) || null,
        };
      });
    } catch {
      // Non-blocking fallback if Firestore unavailable
    }

    res.json({
      profile: prof,
      stats: {
        reviewsCount: userReviews.length,
        followingCount: followedBusinesses.length,
        favoritesCount: userFavorites.length,
        storefrontsCount: ownedBusinesses.length,
      },
      reviews: userReviews,
      favorites: userFavorites,
      following: followedBusinesses,
      storefronts: ownedBusinesses,
    });
  } catch (err) {
    console.error('GET /api/users/:handle failed:', err);
    res.status(500).json({ error: 'Failed to load public profile' });
  }
});
