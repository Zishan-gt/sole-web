-- Migration 004: Engagement, moderation, analytics tables, and RPC functions

CREATE TABLE IF NOT EXISTS public.favorites (
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, business_id)
);

CREATE TABLE IF NOT EXISTS public.enquiries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  message TEXT NOT NULL,
  status public.enquiry_status NOT NULL DEFAULT 'new',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.verification_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  document_urls TEXT[] NOT NULL DEFAULT '{}',
  document_type TEXT DEFAULT 'GST Certificate',
  storefront_photo_url TEXT DEFAULT '',
  phone_verified BOOLEAN NOT NULL DEFAULT FALSE,
  status public.verification_request_status NOT NULL DEFAULT 'pending',
  reject_reason TEXT,
  reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  target_type public.report_target_type NOT NULL,
  target_id UUID NOT NULL,
  reporter_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  details TEXT DEFAULT '',
  status public.report_status NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.analytics_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  session_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analytics_events_business_created
  ON public.analytics_events (business_id, created_at);

CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  recipient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  business_id UUID REFERENCES public.businesses(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  link TEXT DEFAULT '',
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RPC 1: search_businesses
CREATE OR REPLACE FUNCTION public.search_businesses(
  p_query TEXT DEFAULT '',
  p_lat DOUBLE PRECISION DEFAULT NULL,
  p_lng DOUBLE PRECISION DEFAULT NULL,
  p_radius_km DOUBLE PRECISION DEFAULT 0,
  p_category_slug TEXT DEFAULT NULL,
  p_only_verified BOOLEAN DEFAULT FALSE,
  p_sort TEXT DEFAULT 'distance',
  p_page INTEGER DEFAULT 1,
  p_page_size INTEGER DEFAULT 18
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  slug TEXT,
  category_name TEXT,
  city TEXT,
  area TEXT,
  is_verified BOOLEAN,
  rating_avg NUMERIC,
  rating_count INTEGER,
  distance_km DOUBLE PRECISION,
  rank_score DOUBLE PRECISION
) AS $$
DECLARE
  user_point geography := CASE
    WHEN p_lat IS NOT NULL AND p_lng IS NOT NULL
    THEN ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
    ELSE NULL
  END;
  clean_query TEXT := trim(coalesce(p_query, ''));
BEGIN
  RETURN QUERY
  SELECT
    b.id,
    b.name,
    b.slug,
    coalesce(c.name, 'Other') AS category_name,
    b.city,
    b.area,
    b.is_verified,
    b.rating_avg,
    b.rating_count,
    CASE
      WHEN user_point IS NOT NULL AND b.location IS NOT NULL
      THEN ST_Distance(b.location, user_point) / 1000.0
      ELSE 0.0
    END AS distance_km,
    CASE
      WHEN clean_query <> ''
      THEN ts_rank(b.search_vector, plainto_tsquery('english', unaccent(clean_query)))
           + similarity(lower(b.name), lower(clean_query))
      ELSE 0.0
    END AS rank_score
  FROM public.businesses b
  LEFT JOIN public.categories c ON c.id = b.category_id
  WHERE b.status = 'published'
    AND (NOT p_only_verified OR b.is_verified = TRUE)
    AND (p_category_slug IS NULL OR p_category_slug = '' OR c.slug = p_category_slug)
    AND (
      user_point IS NULL
      OR p_radius_km <= 0
      OR ST_DWithin(b.location, user_point, p_radius_km * 1000.0)
    )
    AND (
      clean_query = ''
      OR b.search_vector @@ plainto_tsquery('english', unaccent(clean_query))
      OR similarity(lower(b.name), lower(clean_query)) > 0.16
      OR EXISTS (
        SELECT 1 FROM public.products p
        WHERE p.business_id = b.id AND p.is_active = TRUE
          AND (
            p.search_vector @@ plainto_tsquery('english', unaccent(clean_query))
            OR similarity(lower(p.name), lower(clean_query)) > 0.2
          )
      )
    )
  ORDER BY
    CASE WHEN p_sort = 'newest' THEN extract(epoch FROM b.created_at) END DESC NULLS LAST,
    CASE WHEN p_sort = 'rating' THEN b.rating_avg END DESC NULLS LAST,
    distance_km ASC,
    rank_score DESC
  LIMIT p_page_size
  OFFSET GREATEST(0, (p_page - 1) * p_page_size);
END;
$$ LANGUAGE plpgsql STABLE;

-- RPC 2: adjust_stock (atomic inventory adjustment + stock movement log)
CREATE OR REPLACE FUNCTION public.adjust_stock(
  p_product_id UUID,
  p_change INTEGER,
  p_type public.stock_movement_type,
  p_note TEXT DEFAULT '',
  p_actor_id UUID DEFAULT NULL
)
RETURNS public.inventory AS $$
DECLARE
  signed_delta INTEGER;
  result_row public.inventory;
BEGIN
  signed_delta := CASE
    WHEN p_type = 'out' THEN -ABS(p_change)
    WHEN p_type = 'in' THEN ABS(p_change)
    ELSE p_change
  END;

  INSERT INTO public.inventory (product_id, quantity)
  VALUES (p_product_id, GREATEST(0, signed_delta))
  ON CONFLICT (product_id) DO UPDATE
  SET quantity = GREATEST(0, public.inventory.quantity + signed_delta),
      updated_at = NOW()
  RETURNING * INTO result_row;

  INSERT INTO public.stock_movements (product_id, change, type, note, created_by)
  VALUES (p_product_id, signed_delta, p_type, coalesce(p_note, ''), p_actor_id);

  RETURN result_row;
END;
$$ LANGUAGE plpgsql;
