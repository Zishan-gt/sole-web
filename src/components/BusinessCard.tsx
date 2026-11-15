import React, { useEffect, useState } from 'react';
import { BadgeCheck, MapPin, Phone, Star, Store } from 'lucide-react';
import type { BusinessSummary } from '../types/app';
import { Link } from './RouterLink';
import { trackAnalyticsEvent } from '../lib/api';
import { buildGoogleMapsDirectionsUrl } from '../lib/maps';

interface BusinessCardProps {
  business: BusinessSummary;
}

export const SafeImage: React.FC<{
  src?: string | null;
  alt: string;
  className?: string;
  fallbackLabel?: string;
}> = ({ src, alt, className = '', fallbackLabel }) => {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 ${className}`}
        aria-label={alt}
      >
        <Store className="w-7 h-7 opacity-60" />
        {fallbackLabel && (
          <span className="mt-1 text-xs font-medium px-2 truncate max-w-full">
            {fallbackLabel}
          </span>
        )}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      loading="lazy"
      onError={() => setFailed(true)}
      className={className}
    />
  );
};

export const BusinessCard: React.FC<BusinessCardProps> = ({ business }) => {
  const ratingVal = Number(business.ratingAvg || 0);
  const directionsUrl = buildGoogleMapsDirectionsUrl(
    business.lat,
    business.lng,
    business.googleMapsUrl
  );

  return (
    <article className="group flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden transition-transform duration-150 hover:-translate-y-0.5">
      <Link to={`/b/${business.slug}`} className="relative block aspect-[4/3] overflow-hidden bg-slate-100 dark:bg-slate-800">
        <SafeImage
          src={business.coverUrl || business.logoUrl}
          alt={business.name}
          fallbackLabel={business.name}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent pointer-events-none" />
        <div className="absolute bottom-3 left-3 flex items-center gap-2.5">
          <div className="w-11 h-11 rounded-full overflow-hidden border-2 border-white dark:border-slate-900 bg-white shrink-0">
            <SafeImage
              src={business.logoUrl || business.coverUrl}
              alt={`${business.name} logo`}
              className="w-full h-full object-cover"
            />
          </div>
          <span className="text-xs font-medium text-white drop-shadow">
            {business.isOpenNow ? 'Open now' : 'Closed'}
          </span>
        </div>
      </Link>

      <div className="flex flex-col flex-1 p-4">
        <div className="flex items-start justify-between gap-2">
          <Link
            to={`/b/${business.slug}`}
            className="font-display text-base font-semibold text-slate-900 dark:text-slate-100 hover:text-blue-600 dark:hover:text-blue-400 line-clamp-1 flex items-center gap-1.5"
          >
            <span className="truncate">{business.name}</span>
            {business.isVerified && (
              <BadgeCheck
                className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0"
                aria-label="Verified Business"
              />
            )}
          </Link>
          <div className="flex items-center gap-1 text-xs font-medium text-slate-800 dark:text-slate-200 shrink-0 tabular-nums">
            <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
            <span>{ratingVal > 0 ? ratingVal.toFixed(1) : 'New'}</span>
            {business.ratingCount > 0 && (
              <span className="text-slate-400 dark:text-slate-500">({business.ratingCount})</span>
            )}
          </div>
        </div>

        {/* Clean unboxed metadata with typographic separators */}
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 truncate">
          <span>{business.categoryName || 'Business'}</span>
          {business.area || business.city ? (
            <>
              <span aria-hidden="true"> · </span>
              <span>{[business.area, business.city].filter(Boolean).join(', ')}</span>
            </>
          ) : null}
          {business.distanceKm !== null && business.distanceKm !== undefined && (
            <>
              <span aria-hidden="true"> · </span>
              <span className="tabular-nums font-medium text-slate-700 dark:text-slate-300">
                {business.distanceKm < 1
                  ? `${Math.round(business.distanceKm * 1000)} m`
                  : `${business.distanceKm.toFixed(1)} km`}
              </span>
            </>
          )}
        </p>

        {business.bio && (
          <p className="mt-2.5 text-sm text-slate-600 dark:text-slate-300 line-clamp-2 flex-1">
            {business.bio}
          </p>
        )}

        <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
          {business.phone ? (
            <a
              href={`tel:${business.phone}`}
              onClick={() => trackAnalyticsEvent(business.id, 'call_click')}
              className="inline-flex items-center justify-center gap-1.5 min-h-[40px] px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors whitespace-nowrap"
            >
              <Phone className="w-3.5 h-3.5" />
              <span>Call</span>
            </a>
          ) : (
            <Link
              to={`/b/${business.slug}`}
              className="inline-flex items-center justify-center min-h-[40px] px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors whitespace-nowrap"
            >
              View profile
            </Link>
          )}

          <a
            href={directionsUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackAnalyticsEvent(business.id, 'directions_click')}
            className="inline-flex items-center justify-center gap-1.5 min-h-[40px] px-3 py-1.5 rounded-lg text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/50 transition-colors whitespace-nowrap"
          >
            <MapPin className="w-3.5 h-3.5" />
            <span>Directions</span>
          </a>
        </div>
      </div>
    </article>
  );
};
