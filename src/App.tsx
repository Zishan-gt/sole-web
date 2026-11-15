import React, { useEffect, useRef, useState } from 'react';
import { Layout } from './components/Layout';
import { usePathname } from './components/RouterLink';
import { AuthProvider } from './context/AuthContext';
import { LocationProvider } from './context/LocationContext';
import { RealtimeProvider } from './context/RealtimeContext';
import { SocialProvider } from './context/SocialContext';
import { ThemeProvider } from './context/ThemeContext';
import { apiFetch } from './lib/api';
import { applyDocumentSeo, formatSlugTitle } from './lib/seo';
import { AdminDashboardPage } from './pages/admin/AdminDashboardPage';
import { BusinessProfilePage } from './pages/BusinessProfilePage';
import { CustomerProfilePage } from './pages/CustomerProfilePage';
import { OwnerDashboardPage } from './pages/dashboard/OwnerDashboardPage';
import { HomePage } from './pages/HomePage';
import { MessagesPage } from './pages/MessagesPage';
import { ProductDetailPage } from './pages/ProductDetailPage';
import { ReelsPage } from './pages/ReelsPage';
import { AuthPage, InfoPage, SavedPage } from './pages/SavedAndStaticPages';
import { SearchPage } from './pages/SearchPage';
import type { BusinessSummary, CategoryItem, ProductItem } from './types/app';

const DEFAULT_SEO = {
  title: 'SoleWeb – Discover Local Businesses, Products & Services',
  description:
    'Search trusted local businesses worldwide, browse storefronts, compare products and services, and get instant map directions.',
};

function AppRoutes() {
  const { pathname, search } = usePathname();
  const clean = pathname.replace(/\/+$/, '') || '/';

  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const businessCacheRef = useRef<Map<string, BusinessSummary>>(new Map());
  const productCacheRef = useRef<
    Map<string, { business: BusinessSummary; product: ProductItem }>
  >(new Map());

  useEffect(() => {
    let cancelled = false;
    apiFetch<{ categories: CategoryItem[] }>('/api/categories')
      .then((res) => {
        if (!cancelled && Array.isArray(res.categories)) {
          setCategories(res.categories);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams(search);
    const resolveCategoryName = (slugOrKey: string) => {
      const normalized = decodeURIComponent(slugOrKey).trim().toLowerCase();
      const match = categories.find(
        (c) => c.slug.toLowerCase() === normalized || c.id === slugOrKey
      );
      return match?.name || formatSlugTitle(slugOrKey);
    };

    // 1. Home
    if (clean === '/') {
      applyDocumentSeo({
        title: DEFAULT_SEO.title,
        description: DEFAULT_SEO.description,
        ogType: 'website',
        canonicalPath: '/',
        jsonLd: {
          '@context': 'https://schema.org',
          '@type': 'WebApplication',
          name: 'SoleWeb',
          applicationCategory: 'BusinessApplication',
          operatingSystem: 'All',
          description: DEFAULT_SEO.description,
          url: window.location.origin,
          offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
        },
      });
      return;
    }

    // 2. Category route (/category/:slug)
    if (clean.startsWith('/category/')) {
      const catSlug = clean.slice('/category/'.length).split('/')[0] || '';
      const categoryName = resolveCategoryName(catSlug);
      const description = `Explore top-rated ${categoryName} businesses near you. Compare verified storefronts, products, services, reviews, and opening hours on SoleWeb.`;
      applyDocumentSeo({
        title: `${categoryName} Businesses Near You | SoleWeb`,
        description,
        ogType: 'website',
        canonicalPath: clean,
        jsonLd: {
          '@context': 'https://schema.org',
          '@type': 'CollectionPage',
          name: `${categoryName} Businesses | SoleWeb`,
          description,
          url: `${window.location.origin}${clean}`,
        },
      });
      return;
    }

    // 3. City route (/city/:city)
    if (clean.startsWith('/city/')) {
      const cityRaw = clean.slice('/city/'.length).split('/')[0] || '';
      const cityLabel = formatSlugTitle(cityRaw);
      const description = `Discover verified local businesses, shops, services, customer reviews, and instant map directions in ${cityLabel} on SoleWeb.`;
      applyDocumentSeo({
        title: `Best Local Businesses in ${cityLabel} | SoleWeb`,
        description,
        ogType: 'website',
        canonicalPath: clean,
        jsonLd: {
          '@context': 'https://schema.org',
          '@type': 'CollectionPage',
          name: `Local Businesses in ${cityLabel} | SoleWeb`,
          description,
          url: `${window.location.origin}${clean}`,
        },
      });
      return;
    }

    // 4. Search route (/search)
    if (clean === '/search') {
      const q = (params.get('q') || '').trim();
      const catParam = (params.get('category') || '').trim();
      const cityParam = (params.get('city') || '').trim();
      const catName = catParam ? resolveCategoryName(catParam) : '';
      const cityLabel = cityParam ? formatSlugTitle(cityParam) : '';

      let title = 'Search Local Businesses & Services | SoleWeb';
      let description =
        'Find local shops, services, and verified storefronts sorted by distance. View addresses, phone numbers, hours, products, and directions on SoleWeb.';

      if (q && catName) {
        title = `${q} in ${catName} | SoleWeb Search`;
        description = `Browse "${q}" across ${catName} businesses${cityLabel ? ` in ${cityLabel}` : ''} sorted nearest first with verified details, products, and directions.`;
      } else if (catName) {
        title = `${catName} Businesses & Services${cityLabel ? ` in ${cityLabel}` : ''} | SoleWeb`;
        description = `Discover verified ${catName} businesses${cityLabel ? ` in ${cityLabel}` : ''} sorted by distance. Compare ratings, catalogues, hours, and directions.`;
      } else if (q) {
        title = `${q} – Local Business Search${cityLabel ? ` in ${cityLabel}` : ''} | SoleWeb`;
        description = `Search results for "${q}"${cityLabel ? ` in ${cityLabel}` : ''} on SoleWeb. Compare verified local businesses, products, reviews, and full street addresses.`;
      } else if (cityLabel) {
        title = `Local Businesses in ${cityLabel} | SoleWeb`;
        description = `Explore verified local businesses, services, and catalogues in ${cityLabel} sorted by distance on SoleWeb.`;
      }

      applyDocumentSeo({
        title,
        description,
        ogType: 'website',
        canonicalPath: '/search',
        jsonLd: {
          '@context': 'https://schema.org',
          '@type': 'SearchResultsPage',
          name: title,
          description,
          url: window.location.href,
        },
      });
      return;
    }

    // 5. Business & Product routes (/b/:slug and /b/:slug/p/:productId)
    if (clean.startsWith('/b/')) {
      const rest = clean.slice('/b/'.length).split('/');
      const slug = rest[0] || '';
      const isProductRoute = rest.length >= 3 && rest[1] === 'p';
      const productId = isProductRoute ? rest[2] : '';

      const applyBusinessSeo = (biz: BusinessSummary) => {
        const categoryName =
          biz.categoryName || (biz.categoryId ? resolveCategoryName(biz.categoryId) : '');
        const placeParts = [biz.area, biz.city, biz.state].filter(Boolean);
        const locationLabel = placeParts.slice(0, 2).join(', ');
        const fullAddress = [
          biz.addressLine,
          biz.area,
          biz.city,
          biz.state,
          biz.pincode,
          biz.country,
        ]
          .filter(Boolean)
          .join(', ');

        const titleParts = [biz.name];
        if (categoryName && categoryName !== 'Other') titleParts.push(categoryName);
        if (biz.city) titleParts.push(biz.city);

        const title = `${titleParts.join(' · ')} | SoleWeb`;
        const ratingSnippet =
          Number(biz.ratingCount) > 0
            ? `Rated ${Number(biz.ratingAvg || 0).toFixed(1)}★ (${biz.ratingCount} reviews). `
            : '';
        const bioSnippet = biz.bio ? `${biz.bio} ` : '';
        const addressSnippet = fullAddress
          ? `Located at ${fullAddress}. `
          : locationLabel
            ? `Serving ${locationLabel}. `
            : '';
        const description = `${bioSnippet}${ratingSnippet}${addressSnippet}View posts, products, opening hours, and directions on SoleWeb.`;

        const jsonLd: Record<string, unknown> = {
          '@context': 'https://schema.org',
          '@type': 'LocalBusiness',
          name: biz.name,
          description: biz.bio || description,
          url: `${window.location.origin}/b/${biz.slug}`,
          ...(biz.logoUrl || biz.coverUrl ? { image: biz.coverUrl || biz.logoUrl } : {}),
          ...(biz.phone ? { telephone: biz.phone } : {}),
          ...(fullAddress
            ? {
                address: {
                  '@type': 'PostalAddress',
                  streetAddress: biz.addressLine || biz.area || undefined,
                  addressLocality: biz.city || undefined,
                  addressRegion: biz.state || undefined,
                  postalCode: biz.pincode || undefined,
                  addressCountry: biz.country || undefined,
                },
              }
            : {}),
          ...(Number(biz.ratingCount) > 0
            ? {
                aggregateRating: {
                  '@type': 'AggregateRating',
                  ratingValue: Number(biz.ratingAvg || 0).toFixed(1),
                  reviewCount: biz.ratingCount,
                },
              }
            : {}),
        };

        applyDocumentSeo({
          title,
          description,
          ogType: 'profile',
          image: biz.coverUrl || biz.logoUrl || undefined,
          canonicalPath: `/b/${biz.slug}`,
          jsonLd,
        });
      };

      const applyProductSeo = (biz: BusinessSummary, prod: ProductItem) => {
        const effectivePrice = Number(prod.discountPrice ?? prod.price);
        const priceLabel = Number.isFinite(effectivePrice)
          ? `₹${effectivePrice.toLocaleString()}`
          : '';
        const title = `${prod.name} – ${biz.name}${biz.city ? ` (${biz.city})` : ''} | SoleWeb`;
        const description = `${prod.name}${priceLabel ? ` (${priceLabel})` : ''} from ${biz.name}${biz.city ? ` in ${biz.city}` : ''}. ${prod.description || 'View photos, availability, and send an enquiry directly on SoleWeb.'}`;

        applyDocumentSeo({
          title,
          description,
          ogType: 'product',
          image: prod.images?.[0] || biz.coverUrl || biz.logoUrl || undefined,
          canonicalPath: `/b/${biz.slug}/p/${prod.id}`,
          jsonLd: {
            '@context': 'https://schema.org',
            '@type': 'Product',
            name: prod.name,
            description: prod.description || description,
            image: prod.images?.[0] || biz.coverUrl || biz.logoUrl || undefined,
            brand: { '@type': 'Organization', name: biz.name },
            offers: {
              '@type': 'Offer',
              price: Number.isFinite(effectivePrice) ? String(effectivePrice) : '0',
              priceCurrency: 'INR',
              availability:
                prod.availability === 'out_of_stock'
                  ? 'https://schema.org/OutOfStock'
                  : 'https://schema.org/InStock',
              url: `${window.location.origin}/b/${biz.slug}/p/${prod.id}`,
            },
          },
        });
      };

      if (isProductRoute && productId) {
        const cacheKey = `${slug}:${productId}`;
        const cached = productCacheRef.current.get(cacheKey);
        if (cached) {
          applyProductSeo(cached.business, cached.product);
        } else {
          const fallbackBizName = formatSlugTitle(slug);
          applyDocumentSeo({
            title: `${fallbackBizName} Catalogue Item | SoleWeb`,
            description: `View pricing, photos, availability, and enquiry options from ${fallbackBizName} on SoleWeb.`,
            ogType: 'product',
            canonicalPath: clean,
          });
          apiFetch<{ product: ProductItem; business: BusinessSummary }>(
            `/api/businesses/${encodeURIComponent(slug)}/products/${encodeURIComponent(productId)}`
          )
            .then((res) => {
              if (cancelled || !res?.business || !res?.product) return;
              productCacheRef.current.set(cacheKey, {
                business: res.business,
                product: res.product,
              });
              businessCacheRef.current.set(slug, res.business);
              applyProductSeo(res.business, res.product);
            })
            .catch(() => {});
        }
      } else if (slug) {
        const cachedBiz = businessCacheRef.current.get(slug);
        if (cachedBiz) {
          applyBusinessSeo(cachedBiz);
        } else {
          const fallbackName = formatSlugTitle(slug);
          applyDocumentSeo({
            title: `${fallbackName} – Storefront & Reviews | SoleWeb`,
            description: `Explore ${fallbackName} on SoleWeb. View posts, products, services, verified address, opening hours, and customer reviews.`,
            ogType: 'profile',
            canonicalPath: clean,
          });
          apiFetch<{ business: BusinessSummary }>(`/api/businesses/${encodeURIComponent(slug)}`)
            .then((res) => {
              if (cancelled || !res?.business) return;
              businessCacheRef.current.set(slug, res.business);
              applyBusinessSeo(res.business);
            })
            .catch(() => {});
        }
      }

      return () => {
        cancelled = true;
      };
    }

    // 6. Other standard application routes
    const routeSeoMap: Record<string, { title: string; description: string }> = {
      '/reels': {
        title: 'Local Reels & Storefront Videos | SoleWeb',
        description:
          'Watch short videos and behind-the-scenes clips from verified local businesses, cafes, studios, and shops near you on SoleWeb.',
      },
      '/messages': {
        title: 'Messages & Live Storefront Chat | SoleWeb',
        description:
          'Chat live with local storefronts, ask about stock or bookings, and manage your customer conversations on SoleWeb.',
      },
      '/saved': {
        title: 'Saved Businesses & Bookmarks | SoleWeb',
        description:
          'Access your saved local storefronts, favorite posts, and bookmarked services anytime on SoleWeb.',
      },
      '/login': {
        title: 'Sign In to SoleWeb | Local Business Discovery',
        description:
          'Sign in to SoleWeb to follow local businesses, save favorites, write reviews, or manage your business storefront.',
      },
      '/signup': {
        title: 'Create Your SoleWeb Account | Local Business Discovery',
        description:
          'Join SoleWeb to discover verified local businesses, follow favorite storefronts, and list your business online.',
      },
      '/forgot-password': {
        title: 'Reset Password | SoleWeb',
        description: 'Reset your SoleWeb account password securely to regain access.',
      },
      '/about': {
        title: 'About SoleWeb – Global Local Business Discovery',
        description:
          'Learn how SoleWeb connects customers with verified local businesses, real-time catalogues, and instant map directions.',
      },
      '/contact': {
        title: 'Contact SoleWeb Support',
        description:
          'Get help with business verification, storefront listings, or customer enquiries on SoleWeb.',
      },
      '/terms': {
        title: 'Terms of Service | SoleWeb',
        description: 'Read the terms and guidelines for using the SoleWeb business discovery platform.',
      },
      '/privacy': {
        title: 'Privacy Policy | SoleWeb',
        description: 'Understand how SoleWeb protects your location preferences, account data, and privacy.',
      },
    };

    if (routeSeoMap[clean]) {
      applyDocumentSeo({
        title: routeSeoMap[clean].title,
        description: routeSeoMap[clean].description,
        ogType: 'website',
        canonicalPath: clean,
      });
      return;
    }

    if (clean === '/dashboard' || clean.startsWith('/dashboard/')) {
      const sec = clean === '/dashboard' ? 'Overview' : formatSlugTitle(clean.slice('/dashboard/'.length));
      applyDocumentSeo({
        title: `${sec} – Business Dashboard | SoleWeb`,
        description:
          'Manage your SoleWeb business profile, posts, product catalogue, inventory, enquiries, reviews, and analytics.',
        ogType: 'website',
        canonicalPath: clean,
      });
      return;
    }

    if (clean === '/admin' || clean.startsWith('/admin/')) {
      const sec = clean === '/admin' ? 'Overview' : formatSlugTitle(clean.slice('/admin/'.length));
      applyDocumentSeo({
        title: `${sec} – Admin Console | SoleWeb`,
        description:
          'Verify local business badges, moderate reported content, and manage platform categories on SoleWeb.',
        ogType: 'website',
        canonicalPath: clean,
      });
      return;
    }

    if (clean.startsWith('/u/')) {
      const handle = decodeURIComponent(clean.slice('/u/'.length));
      applyDocumentSeo({
        title: `@${handle} – Member Profile | SoleWeb`,
        description: `View @${handle}'s public reviews, followed storefronts, and saved local places on SoleWeb.`,
        ogType: 'profile',
        canonicalPath: clean,
      });
      return;
    }

    applyDocumentSeo({
      title: 'Page Not Found | SoleWeb',
      description: 'The requested page could not be found on SoleWeb. Search local businesses and services worldwide.',
      ogType: 'website',
      canonicalPath: clean,
    });

    return () => {
      cancelled = true;
    };
  }, [clean, search, categories]);

  if (clean === '/') return <HomePage />;
  if (clean === '/search') return <SearchPage />;
  if (clean === '/reels') return <ReelsPage />;
  if (clean === '/messages') return <MessagesPage />;
  if (clean === '/saved') return <SavedPage />;
  if (clean === '/login') return <AuthPage mode="login" />;
  if (clean === '/signup') return <AuthPage mode="signup" />;
  if (clean === '/forgot-password') return <AuthPage mode="forgot" />;
  if (clean === '/about') return <InfoPage page="about" />;
  if (clean === '/contact') return <InfoPage page="contact" />;
  if (clean === '/terms') return <InfoPage page="terms" />;
  if (clean === '/privacy') return <InfoPage page="privacy" />;

  if (clean.startsWith('/u/')) {
    const handle = decodeURIComponent(clean.slice('/u/'.length));
    return <CustomerProfilePage handle={handle} />;
  }

  // /category/:slug
  if (clean.startsWith('/category/')) {
    const slug = clean.slice('/category/'.length);
    return <SearchPage presetCategory={slug} />;
  }

  // /city/:city
  if (clean.startsWith('/city/')) {
    const city = clean.slice('/city/'.length);
    return <SearchPage presetCity={city} />;
  }

  // /b/:slug/p/:productId and /b/:slug
  if (clean.startsWith('/b/')) {
    const rest = clean.slice('/b/'.length).split('/');
    if (rest.length >= 3 && rest[1] === 'p') {
      return <ProductDetailPage slug={rest[0]} productId={rest[2]} />;
    }
    return <BusinessProfilePage slug={rest[0]} />;
  }

  // /dashboard/*
  if (clean === '/dashboard' || clean.startsWith('/dashboard/')) {
    const sec = clean === '/dashboard' ? 'overview' : clean.slice('/dashboard/'.length);
    return <OwnerDashboardPage section={sec} />;
  }

  // /admin/*
  if (clean === '/admin' || clean.startsWith('/admin/')) {
    const sec = clean === '/admin' ? 'overview' : clean.slice('/admin/'.length);
    return <AdminDashboardPage section={sec} />;
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-16 text-center">
      <h1 className="font-display text-2xl font-bold">Page not found</h1>
      <p className="mt-2 text-sm text-slate-500">
        The page you requested does not exist on SoleWeb.
      </p>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <LocationProvider>
          <RealtimeProvider>
            <SocialProvider>
              <Layout>
                <AppRoutes />
              </Layout>
            </SocialProvider>
          </RealtimeProvider>
        </LocationProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
