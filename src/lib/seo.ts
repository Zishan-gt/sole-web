export interface SeoPayload {
  title: string;
  description: string;
  ogType?: 'website' | 'profile' | 'product';
  image?: string;
  canonicalPath?: string;
  jsonLd?: Record<string, unknown>;
}

const DEFAULT_IMAGE = '/icon.svg';

export function formatSlugTitle(slug: string): string {
  return decodeURIComponent(slug || '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

export function clampText(text: string, maxLen = 158): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLen) return normalized;
  const sliced = normalized.slice(0, maxLen - 1);
  const lastSpace = sliced.lastIndexOf(' ');
  return `${(lastSpace > 80 ? sliced.slice(0, lastSpace) : sliced).trim()}…`;
}

function upsertMetaTag(attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function upsertCanonicalLink(href: string) {
  let el = document.head.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', 'canonical');
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

function upsertJsonLd(data: Record<string, unknown>) {
  const id = 'soleweb-route-jsonld';
  let el = document.getElementById(id) as HTMLScriptElement | null;
  if (!el) {
    el = document.createElement('script');
    el.id = id;
    el.type = 'application/ld+json';
    document.head.appendChild(el);
  }
  el.textContent = JSON.stringify(data);
}

export function applyDocumentSeo(payload: SeoPayload) {
  if (typeof document === 'undefined') return;

  const title = payload.title.trim();
  const description = clampText(payload.description, 160);
  const origin = window.location.origin;
  const canonicalUrl = `${origin}${payload.canonicalPath ?? window.location.pathname}`;
  const ogUrl = window.location.href;
  const imageUrl = payload.image
    ? payload.image.startsWith('http')
      ? payload.image
      : `${origin}${payload.image.startsWith('/') ? '' : '/'}${payload.image}`
    : `${origin}${DEFAULT_IMAGE}`;

  document.title = title;

  upsertMetaTag('name', 'description', description);
  upsertMetaTag('property', 'og:type', payload.ogType || 'website');
  upsertMetaTag('property', 'og:site_name', 'SoleWeb');
  upsertMetaTag('property', 'og:title', title);
  upsertMetaTag('property', 'og:description', description);
  upsertMetaTag('property', 'og:url', ogUrl);
  upsertMetaTag('property', 'og:image', imageUrl);

  upsertMetaTag('name', 'twitter:card', 'summary_large_image');
  upsertMetaTag('name', 'twitter:title', title);
  upsertMetaTag('name', 'twitter:description', description);
  upsertMetaTag('name', 'twitter:image', imageUrl);

  upsertCanonicalLink(canonicalUrl);

  if (payload.jsonLd) {
    upsertJsonLd(payload.jsonLd);
  }
}
