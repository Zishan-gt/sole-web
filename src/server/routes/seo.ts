import { Router, type Request } from 'express';
import { and, desc, eq, isNotNull } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import { businesses, categories, products, profiles } from '../../db/schema.ts';
import { ensureSeeded } from '../../db/seed.ts';

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function escapeHtmlAttr(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatSlug(slug: string): string {
  return decodeURIComponent(slug || '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

export function resolveBaseOrigin(req: Request): string {
  const envUrl = (process.env.APP_URL || '').trim().replace(/\/+$/, '');
  if (envUrl && /^https?:\/\//i.test(envUrl)) {
    return envUrl;
  }
  const protoHeader = String(req.headers['x-forwarded-proto'] || req.protocol || 'https')
    .split(',')[0]
    .trim();
  const host = String(req.headers['x-forwarded-host'] || req.get('host') || 'localhost:3000')
    .split(',')[0]
    .trim();
  return `${protoHeader}://${host}`;
}

export const seoRouter = Router();

seoRouter.get('/robots.txt', (req, res) => {
  const origin = resolveBaseOrigin(req);
  const lines = [
    'User-agent: *',
    'Allow: /',
    'Allow: /search',
    'Allow: /reels',
    'Allow: /b/',
    'Allow: /category/',
    'Allow: /city/',
    'Allow: /u/',
    'Disallow: /api/',
    'Disallow: /dashboard',
    'Disallow: /admin',
    'Disallow: /messages',
    'Disallow: /saved',
    'Disallow: /login',
    'Disallow: /signup',
    'Disallow: /forgot-password',
    '',
    `Sitemap: ${origin}/sitemap.xml`,
  ];
  res.type('text/plain').send(lines.join('\n'));
});

seoRouter.get('/sitemap.xml', async (req, res) => {
  try {
    await ensureSeeded();
    const origin = resolveBaseOrigin(req);

    const [bizRows, catRows, prodRows, profileRows] = await Promise.all([
      db
        .select({
          slug: businesses.slug,
          city: businesses.city,
          updatedAt: businesses.updatedAt,
        })
        .from(businesses)
        .where(eq(businesses.status, 'published'))
        .orderBy(desc(businesses.updatedAt))
        .limit(1000),
      db
        .select({
          slug: categories.slug,
          updatedAt: categories.updatedAt,
        })
        .from(categories)
        .where(eq(categories.isActive, true)),
      db
        .select({
          id: products.id,
          businessSlug: businesses.slug,
          updatedAt: products.updatedAt,
        })
        .from(products)
        .innerJoin(businesses, eq(products.businessId, businesses.id))
        .where(and(eq(products.isActive, true), eq(businesses.status, 'published')))
        .limit(1500),
      db
        .select({
          handle: profiles.handle,
          updatedAt: profiles.updatedAt,
        })
        .from(profiles)
        .where(isNotNull(profiles.handle))
        .limit(500),
    ]);

    const urls: Array<{ loc: string; lastmod?: string; changefreq: string; priority: string }> = [
      { loc: `${origin}/`, changefreq: 'daily', priority: '1.0' },
      { loc: `${origin}/search`, changefreq: 'daily', priority: '0.9' },
      { loc: `${origin}/reels`, changefreq: 'daily', priority: '0.9' },
      { loc: `${origin}/about`, changefreq: 'monthly', priority: '0.4' },
      { loc: `${origin}/contact`, changefreq: 'monthly', priority: '0.4' },
    ];

    const seenCities = new Set<string>();
    for (const c of catRows) {
      urls.push({
        loc: `${origin}/category/${encodeURIComponent(c.slug)}`,
        lastmod: c.updatedAt?.toISOString(),
        changefreq: 'weekly',
        priority: '0.8',
      });
    }

    for (const b of bizRows) {
      urls.push({
        loc: `${origin}/b/${encodeURIComponent(b.slug)}`,
        lastmod: b.updatedAt?.toISOString(),
        changefreq: 'daily',
        priority: '0.9',
      });
      const cityClean = (b.city || '').trim();
      if (cityClean) {
        const cityKey = cityClean.toLowerCase();
        if (!seenCities.has(cityKey)) {
          seenCities.add(cityKey);
          urls.push({
            loc: `${origin}/city/${encodeURIComponent(cityKey.replace(/\s+/g, '-'))}`,
            changefreq: 'weekly',
            priority: '0.7',
          });
        }
      }
    }

    for (const p of prodRows) {
      urls.push({
        loc: `${origin}/b/${encodeURIComponent(p.businessSlug)}/p/${encodeURIComponent(p.id)}`,
        lastmod: p.updatedAt?.toISOString(),
        changefreq: 'weekly',
        priority: '0.7',
      });
    }

    for (const prof of profileRows) {
      if (!prof.handle) continue;
      urls.push({
        loc: `${origin}/u/${encodeURIComponent(prof.handle)}`,
        lastmod: prof.updatedAt?.toISOString(),
        changefreq: 'weekly',
        priority: '0.6',
      });
    }

    const xmlItems = urls
      .map((u) => {
        const lastmodTag = u.lastmod ? `<lastmod>${escapeXml(u.lastmod)}</lastmod>` : '';
        return `<url><loc>${escapeXml(u.loc)}</loc>${lastmodTag}<changefreq>${u.changefreq}</changefreq><priority>${u.priority}</priority></url>`;
      })
      .join('');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${xmlItems}</urlset>`;
    res.type('application/xml').send(xml);
  } catch (err) {
    console.error('GET /sitemap.xml failed:', err);
    res.status(500).type('text/plain').send('Failed to generate sitemap');
  }
});

interface SsrMeta {
  title: string;
  description: string;
  ogType: string;
  canonicalPath: string;
  image?: string;
  jsonLd?: Record<string, unknown>;
}

async function resolveRouteMeta(reqPath: string, origin: string): Promise<SsrMeta | null> {
  const clean = reqPath.split('?')[0].replace(/\/+$/, '') || '/';

  if (clean.startsWith('/b/')) {
    const rest = clean.slice('/b/'.length).split('/');
    const slug = decodeURIComponent(rest[0] || '');
    if (!slug) return null;

    const [biz] = await db
      .select()
      .from(businesses)
      .where(and(eq(businesses.slug, slug), eq(businesses.status, 'published')))
      .limit(1);
    if (!biz) return null;

    const isProduct = rest.length >= 3 && rest[1] === 'p' && rest[2];
    if (isProduct) {
      const [prod] = await db
        .select()
        .from(products)
        .where(and(eq(products.id, rest[2]), eq(products.businessId, biz.id)))
        .limit(1);
      if (prod) {
        const effectivePrice = Number(prod.discountPrice ?? prod.price);
        const priceLabel = Number.isFinite(effectivePrice) ? `₹${effectivePrice.toLocaleString()}` : '';
        const title = `${prod.name} – ${biz.name}${biz.city ? ` (${biz.city})` : ''} | SoleWeb`;
        const description = `${prod.name}${priceLabel ? ` (${priceLabel})` : ''} from ${biz.name}${biz.city ? ` in ${biz.city}` : ''}. ${prod.description || 'View photos, availability, and live storefront chat on SoleWeb.'}`.slice(0, 160);
        const image = prod.images?.[0] || biz.coverUrl || biz.logoUrl || undefined;
        return {
          title,
          description,
          ogType: 'product',
          canonicalPath: `/b/${biz.slug}/p/${prod.id}`,
          image,
          jsonLd: {
            '@context': 'https://schema.org',
            '@type': 'Product',
            name: prod.name,
            description,
            brand: { '@type': 'Organization', name: biz.name },
            offers: {
              '@type': 'Offer',
              price: Number.isFinite(effectivePrice) ? String(effectivePrice) : '0',
              priceCurrency: 'INR',
              url: `${origin}/b/${biz.slug}/p/${prod.id}`,
            },
          },
        };
      }
    }

    const catRow = biz.categoryId
      ? await db.select({ name: categories.name }).from(categories).where(eq(categories.id, biz.categoryId)).limit(1)
      : [];
    const catName = catRow[0]?.name;
    const titleParts = [biz.name];
    if (catName && catName !== 'Other') titleParts.push(catName);
    if (biz.city) titleParts.push(biz.city);
    const title = `${titleParts.join(' · ')} | SoleWeb`;
    const ratingSnippet =
      Number(biz.ratingCount) > 0
        ? `Rated ${Number(biz.ratingAvg || 0).toFixed(1)}★ (${biz.ratingCount} reviews). `
        : '';
    const fullAddress = [biz.addressLine, biz.area, biz.city, biz.state].filter(Boolean).join(', ');
    const description = `${biz.bio ? `${biz.bio} ` : ''}${ratingSnippet}${fullAddress ? `Located at ${fullAddress}. ` : ''}View posts, products, hours, and directions on SoleWeb.`.slice(0, 160);

    return {
      title,
      description,
      ogType: 'profile',
      canonicalPath: `/b/${biz.slug}`,
      image: biz.coverUrl || biz.logoUrl || undefined,
      jsonLd: {
        '@context': 'https://schema.org',
        '@type': 'LocalBusiness',
        name: biz.name,
        description: biz.bio || description,
        url: `${origin}/b/${biz.slug}`,
        ...(biz.phone ? { telephone: biz.phone } : {}),
      },
    };
  }

  if (clean.startsWith('/category/')) {
    const catSlug = decodeURIComponent(clean.slice('/category/'.length).split('/')[0] || '');
    const catRow = await db
      .select({ name: categories.name })
      .from(categories)
      .where(eq(categories.slug, catSlug))
      .limit(1);
    const name = catRow[0]?.name || formatSlug(catSlug);
    return {
      title: `${name} Businesses Near You | SoleWeb`,
      description: `Explore verified ${name} businesses near you. Compare catalogues, reviews, and directions on SoleWeb.`,
      ogType: 'website',
      canonicalPath: clean,
    };
  }

  if (clean.startsWith('/city/')) {
    const cityLabel = formatSlug(clean.slice('/city/'.length).split('/')[0] || '');
    return {
      title: `Best Local Businesses in ${cityLabel} | SoleWeb`,
      description: `Discover verified local shops, services, customer reviews, and instant map directions in ${cityLabel} on SoleWeb.`,
      ogType: 'website',
      canonicalPath: clean,
    };
  }

  if (clean.startsWith('/u/')) {
    const handle = decodeURIComponent(clean.slice('/u/'.length)).replace(/^@/, '');
    const [prof] = await db
      .select({ fullName: profiles.fullName, bio: profiles.bio, handle: profiles.handle })
      .from(profiles)
      .where(eq(profiles.handle, handle.toLowerCase()))
      .limit(1);
    const display = prof?.fullName || `@${handle}`;
    return {
      title: `${display} (@${prof?.handle || handle}) | SoleWeb`,
      description: (prof?.bio || `View ${display}'s reviews, followed storefronts, and saved local places on SoleWeb.`).slice(0, 160),
      ogType: 'profile',
      canonicalPath: clean,
    };
  }

  if (clean === '/reels') {
    return {
      title: 'Local Reels & Storefront Videos | SoleWeb',
      description: 'Watch short videos from verified local businesses, cafes, studios, and shops near you on SoleWeb.',
      ogType: 'website',
      canonicalPath: '/reels',
    };
  }

  if (clean === '/' || clean === '/search') {
    return {
      title: 'SoleWeb – Discover Local Businesses, Products & Services',
      description:
        'Global local business discovery platform with Instagram-style storefronts, full-text & spatial search, inventory management, and real-time notifications.',
      ogType: 'website',
      canonicalPath: clean,
    };
  }

  return null;
}

export async function injectSeoMetaIntoHtml(
  templateHtml: string,
  req: Request
): Promise<string> {
  try {
    const origin = resolveBaseOrigin(req);
    const meta = await resolveRouteMeta(req.path, origin);
    if (!meta) {
      return templateHtml;
    }

    const absCanonical = `${origin}${meta.canonicalPath}`;
    const absImage = meta.image
      ? meta.image.startsWith('http')
        ? meta.image
        : `${origin}${meta.image.startsWith('/') ? '' : '/'}${meta.image}`
      : `${origin}/pwa-512x512.png`;

    let html = templateHtml;
    html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtmlAttr(meta.title)}</title>`);
    html = html.replace(
      /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/i,
      `<meta name="description" content="${escapeHtmlAttr(meta.description)}" />`
    );
    html = html.replace(
      /<meta\s+property="og:type"\s+content="[^"]*"\s*\/?>/i,
      `<meta property="og:type" content="${escapeHtmlAttr(meta.ogType)}" />`
    );
    html = html.replace(
      /<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/i,
      `<meta property="og:title" content="${escapeHtmlAttr(meta.title)}" />`
    );
    html = html.replace(
      /<meta\s+property="og:description"\s+content="[^"]*"\s*\/?>/i,
      `<meta property="og:description" content="${escapeHtmlAttr(meta.description)}" />`
    );
    html = html.replace(
      /<meta\s+name="twitter:title"\s+content="[^"]*"\s*\/?>/i,
      `<meta name="twitter:title" content="${escapeHtmlAttr(meta.title)}" />`
    );
    html = html.replace(
      /<meta\s+name="twitter:description"\s+content="[^"]*"\s*\/?>/i,
      `<meta name="twitter:description" content="${escapeHtmlAttr(meta.description)}" />`
    );

    const extraHeadTags: string[] = [];

    if (/<meta\s+property="og:image"\s+content="[^"]*"\s*\/?>/i.test(html)) {
      html = html.replace(
        /<meta\s+property="og:image"\s+content="[^"]*"\s*\/?>/i,
        `<meta property="og:image" content="${escapeHtmlAttr(absImage)}" />`
      );
    } else {
      extraHeadTags.push(`<meta property="og:image" content="${escapeHtmlAttr(absImage)}" />`);
    }

    if (/<meta\s+name="twitter:image"\s+content="[^"]*"\s*\/?>/i.test(html)) {
      html = html.replace(
        /<meta\s+name="twitter:image"\s+content="[^"]*"\s*\/?>/i,
        `<meta name="twitter:image" content="${escapeHtmlAttr(absImage)}" />`
      );
    } else {
      extraHeadTags.push(`<meta name="twitter:image" content="${escapeHtmlAttr(absImage)}" />`);
    }

    extraHeadTags.push(
      `<link rel="canonical" href="${escapeHtmlAttr(absCanonical)}" />`,
      `<meta property="og:url" content="${escapeHtmlAttr(absCanonical)}" />`
    );

    html = html.replace('</head>', `    ${extraHeadTags.join('\n    ')}\n  </head>`);

    if (meta.jsonLd) {
      html = html.replace(
        /<script id="soleweb-route-jsonld" type="application\/ld\+json">[\s\S]*?<\/script>/i,
        `<script id="soleweb-route-jsonld" type="application/ld+json">${JSON.stringify(meta.jsonLd)}</script>`
      );
    }
    return html;
  } catch (err) {
    console.warn('SSR SEO injection fallback:', err);
    return templateHtml;
  }
}
