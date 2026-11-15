-- Migration 003: Performance indexes (GIST, GIN tsvector, GIN trigram, B-tree) and core triggers

-- Spatial GIST index on geography point
CREATE INDEX IF NOT EXISTS idx_businesses_location_gist
  ON public.businesses USING GIST (location);

-- Full-text search GIN indexes
CREATE INDEX IF NOT EXISTS idx_businesses_search_vector_gin
  ON public.businesses USING GIN (search_vector);

CREATE INDEX IF NOT EXISTS idx_products_search_vector_gin
  ON public.products USING GIN (search_vector);

-- Trigram GIN indexes for typo-tolerant search
CREATE INDEX IF NOT EXISTS idx_businesses_name_trgm
  ON public.businesses USING GIN (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_products_name_trgm
  ON public.products USING GIN (name gin_trgm_ops);

-- B-tree indexes for lookup, filtering, and joins
CREATE INDEX IF NOT EXISTS idx_businesses_slug_btree ON public.businesses (slug);
CREATE INDEX IF NOT EXISTS idx_businesses_category_id_btree ON public.businesses (category_id);
CREATE INDEX IF NOT EXISTS idx_businesses_status_btree ON public.businesses (status);
CREATE INDEX IF NOT EXISTS idx_businesses_city_btree ON public.businesses (city);
CREATE INDEX IF NOT EXISTS idx_businesses_owner_id_btree ON public.businesses (owner_id);
CREATE INDEX IF NOT EXISTS idx_categories_slug_btree ON public.categories (slug);
CREATE INDEX IF NOT EXISTS idx_posts_business_id_btree ON public.posts (business_id, is_pinned DESC, sort_order ASC);
CREATE INDEX IF NOT EXISTS idx_products_business_id_btree ON public.products (business_id, is_active);
CREATE INDEX IF NOT EXISTS idx_reviews_business_id_btree ON public.reviews (business_id, status);

-- Trigger: maintain PostGIS geography point & tsvector on businesses
CREATE OR REPLACE FUNCTION public.businesses_sync_spatial_and_search()
RETURNS TRIGGER AS $$
DECLARE
  cat_name TEXT := '';
BEGIN
  IF NEW.lat IS NOT NULL AND NEW.lng IS NOT NULL THEN
    NEW.location := ST_SetSRID(ST_MakePoint(NEW.lng, NEW.lat), 4326)::geography;
  END IF;

  IF NEW.category_id IS NOT NULL THEN
    SELECT name INTO cat_name FROM public.categories WHERE id = NEW.category_id;
  END IF;

  NEW.search_vector :=
    setweight(to_tsvector('english', unaccent(coalesce(NEW.name, ''))), 'A') ||
    setweight(to_tsvector('english', unaccent(coalesce(cat_name, '') || ' ' || coalesce(NEW.subcategory, ''))), 'B') ||
    setweight(to_tsvector('english', unaccent(array_to_string(coalesce(NEW.tags, '{}'), ' '))), 'B') ||
    setweight(to_tsvector('english', unaccent(coalesce(NEW.bio, '') || ' ' || coalesce(NEW.area, '') || ' ' || coalesce(NEW.city, ''))), 'C');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_businesses_sync_spatial_and_search ON public.businesses;
CREATE TRIGGER trg_businesses_sync_spatial_and_search
  BEFORE INSERT OR UPDATE ON public.businesses
  FOR EACH ROW EXECUTE FUNCTION public.businesses_sync_spatial_and_search();

-- Trigger: maintain tsvector on products
CREATE OR REPLACE FUNCTION public.products_sync_search()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', unaccent(coalesce(NEW.name, ''))), 'A') ||
    setweight(to_tsvector('english', unaccent(coalesce(NEW.category_label, '') || ' ' || array_to_string(coalesce(NEW.tags, '{}'), ' '))), 'B') ||
    setweight(to_tsvector('english', unaccent(coalesce(NEW.description, ''))), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_products_sync_search ON public.products;
CREATE TRIGGER trg_products_sync_search
  BEFORE INSERT OR UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.products_sync_search();

-- Trigger: recompute rating_avg and rating_count on review mutations
CREATE OR REPLACE FUNCTION public.update_business_rating_stats()
RETURNS TRIGGER AS $$
DECLARE
  target_biz_id UUID;
BEGIN
  target_biz_id := COALESCE(NEW.business_id, OLD.business_id);
  UPDATE public.businesses
  SET
    rating_avg = COALESCE((
      SELECT ROUND(AVG(rating)::numeric, 2)
      FROM public.reviews
      WHERE business_id = target_biz_id AND status = 'visible'
    ), 0),
    rating_count = (
      SELECT COUNT(*)::int
      FROM public.reviews
      WHERE business_id = target_biz_id AND status = 'visible'
    )
  WHERE id = target_biz_id;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_reviews_rating_stats ON public.reviews;
CREATE TRIGGER trg_reviews_rating_stats
  AFTER INSERT OR UPDATE OR DELETE ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.update_business_rating_stats();

-- Trigger: sync product availability automatically from inventory
CREATE OR REPLACE FUNCTION public.sync_product_availability()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.products
  SET availability = CASE
    WHEN type = 'service' OR NEW.track_stock = FALSE THEN 'not_tracked'::public.availability_status
    WHEN NEW.quantity <= 0 THEN 'out_of_stock'::public.availability_status
    WHEN NEW.quantity <= NEW.low_stock_threshold THEN 'low_stock'::public.availability_status
    ELSE 'in_stock'::public.availability_status
  END
  WHERE id = NEW.product_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_inventory_availability ON public.inventory;
CREATE TRIGGER trg_inventory_availability
  AFTER INSERT OR UPDATE ON public.inventory
  FOR EACH ROW EXECUTE FUNCTION public.sync_product_availability();
