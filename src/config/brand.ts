export const BRAND_CONFIG = {
  name: 'SoleWeb',
  shortName: 'SoleWeb',
  tagline: 'Discover trusted local businesses, products, and services anywhere.',
  description:
    'Global local business discovery platform featuring verified storefronts, real-time inventory, Instagram-style profiles, and instant map directions.',
  defaultCountry: 'Global',
  defaultCenter: {
    lat: 25.5941,
    lng: 85.1376,
    label: 'Patna, Bihar',
  },
  supportEmail: 'hello@soleweb.app',
  supportedLocales: ['en', 'hi'] as const,
} as const;

export type SupportedLocale = (typeof BRAND_CONFIG.supportedLocales)[number];
