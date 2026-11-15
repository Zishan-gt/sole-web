import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { db, pool } from '../../db/index.ts';
import { businesses } from '../../db/schema.ts';
import {
  discoverWithMapsGrounding,
  discoverWithSearchGrounding,
} from '../../lib/gemini.ts';

export const aiRouter = Router();

// Combined Local Discovery via Gemini 4 Hydrogen (Search Grounding & Maps Grounding run as separate compliant requests)
aiRouter.post('/discover', async (req, res) => {
  try {
    const query = String(req.body?.query || '').trim();
    const mode = String(req.body?.mode || 'both') as 'search' | 'maps' | 'both';
    const locationLabel = String(req.body?.locationLabel || '').trim();
    const lat = req.body?.lat !== undefined && req.body?.lat !== null ? Number(req.body.lat) : null;
    const lng = req.body?.lng !== undefined && req.body?.lng !== null ? Number(req.body.lng) : null;

    if (!query || query.length < 2) {
      return res.status(400).json({ error: 'Please enter a topic, dish, or place to discover.' });
    }

    const searchPromise =
      mode === 'search' || mode === 'both'
        ? discoverWithSearchGrounding({ query, locationLabel }).catch((err) => {
            console.warn('Search grounding fallback:', (err as Error).message);
            return { text: '', webSources: [] };
          })
        : Promise.resolve(null);

    const mapsPromise =
      mode === 'maps' || mode === 'both'
        ? discoverWithMapsGrounding({ query, lat, lng, locationLabel }).catch((err) => {
            console.warn('Maps grounding fallback:', (err as Error).message);
            return { text: '', mapPlaces: [] };
          })
        : Promise.resolve(null);

    // Also pull matching SoleWeb storefronts from PostgreSQL
    const like = `%${query}%`;
    const localMatchPromise = pool.query(
      `SELECT id, name, slug, area, city, logo_url AS "logoUrl", cover_url AS "coverUrl",
              is_verified AS "isVerified", rating_avg AS "ratingAvg"
       FROM businesses
       WHERE status = 'published'
         AND (name ILIKE $1 OR subcategory ILIKE $1 OR bio ILIKE $1 OR city ILIKE $1 OR area ILIKE $1)
       ORDER BY is_verified DESC, rating_avg DESC
       LIMIT 6`,
      [like]
    );

    const [searchResult, mapsResult, localMatches] = await Promise.all([
      searchPromise,
      mapsPromise,
      localMatchPromise,
    ]);

    res.json({
      query,
      locationLabel,
      search: searchResult,
      maps: mapsResult,
      localStorefronts: localMatches.rows,
    });
  } catch (err) {
    console.error('POST /api/ai/discover failed:', err);
    res.status(500).json({ error: 'Discovery guide failed' });
  }
});

// Business-specific neighborhood & Maps Grounding context
aiRouter.get('/business-brief/:slug', async (req, res) => {
  try {
    const [biz] = await db
      .select()
      .from(businesses)
      .where(eq(businesses.slug, req.params.slug))
      .limit(1);

    if (!biz) return res.status(404).json({ error: 'Business not found' });

    const [mapsResult, searchResult] = await Promise.all([
      discoverWithMapsGrounding({
        query: `${biz.name} and nearby landmarks or similar spots in ${biz.area || biz.city || ''}`,
        lat: biz.lat,
        lng: biz.lng,
        locationLabel: [biz.area, biz.city].filter(Boolean).join(', '),
      }).catch(() => ({ text: '', mapPlaces: [] })),
      discoverWithSearchGrounding({
        query: `${biz.name} ${biz.city || ''} local highlights`,
        locationLabel: [biz.area, biz.city].filter(Boolean).join(', '),
      }).catch(() => ({ text: '', webSources: [] })),
    ]);

    res.json({
      businessName: biz.name,
      maps: mapsResult,
      search: searchResult,
    });
  } catch (err) {
    console.error('GET /api/ai/business-brief failed:', err);
    res.status(500).json({ error: 'Failed to generate local brief' });
  }
});
