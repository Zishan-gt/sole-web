-- Migration 005: Row Level Security (RLS) policies and public availability view

-- Public product view hiding owner-only inventory cost_price and low_stock_threshold
CREATE OR REPLACE VIEW public.public_products AS
SELECT
  id,
  business_id,
  type,
  name,
  description,
  category_label,
  price,
  discount_price,
  unit,
  duration_minutes,
  sku,
  images,
  tags,
  is_active,
  CASE
    WHEN availability = 'low_stock' THEN 'in_stock'::public.availability_status
    ELSE availability
  END AS availability,
  view_count,
  created_at,
  updated_at
FROM public.products
WHERE is_active = TRUE;

-- Enable RLS across all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verification_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Admin helper function
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Public read policies
CREATE POLICY "Public reads active categories" ON public.categories
  FOR SELECT USING (is_active = TRUE OR public.is_admin());

CREATE POLICY "Public reads published businesses" ON public.businesses
  FOR SELECT USING (status = 'published' OR owner_id = auth.uid() OR public.is_admin());

CREATE POLICY "Public reads visible posts" ON public.posts
  FOR SELECT USING (
    (is_hidden = FALSE AND EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = business_id AND b.status = 'published'))
    OR EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = business_id AND b.owner_id = auth.uid())
    OR public.is_admin()
  );

CREATE POLICY "Public reads active products" ON public.products
  FOR SELECT USING (
    is_active = TRUE
    OR EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = business_id AND b.owner_id = auth.uid())
    OR public.is_admin()
  );

CREATE POLICY "Public reads visible reviews" ON public.reviews
  FOR SELECT USING (status = 'visible' OR user_id = auth.uid() OR public.is_admin());

-- Owner policies
CREATE POLICY "Owners manage their businesses" ON public.businesses
  FOR ALL USING (owner_id = auth.uid() OR public.is_admin())
  WITH CHECK (owner_id = auth.uid() OR public.is_admin());

CREATE POLICY "Owners manage their posts" ON public.posts
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = business_id AND b.owner_id = auth.uid())
    OR public.is_admin()
  );

CREATE POLICY "Owners manage their products" ON public.products
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = business_id AND b.owner_id = auth.uid())
    OR public.is_admin()
  );

-- Inventory & stock movements restricted strictly to business owners and admins
CREATE POLICY "Only owners and admins read inventory" ON public.inventory
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.products p
      JOIN public.businesses b ON b.id = p.business_id
      WHERE p.id = product_id AND b.owner_id = auth.uid()
    ) OR public.is_admin()
  );

CREATE POLICY "Only owners and admins read stock movements" ON public.stock_movements
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.products p
      JOIN public.businesses b ON b.id = p.business_id
      WHERE p.id = product_id AND b.owner_id = auth.uid()
    ) OR public.is_admin()
  );

-- Verification requests restricted strictly to business owners and admins
CREATE POLICY "Owners and admins access verification requests" ON public.verification_requests
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = business_id AND b.owner_id = auth.uid())
    OR public.is_admin()
  );

-- Customer self-service policies
CREATE POLICY "Users manage own favorites" ON public.favorites
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users insert and update own reviews" ON public.reviews
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users insert enquiries" ON public.enquiries
  FOR INSERT WITH CHECK (user_id IS NULL OR user_id = auth.uid());

CREATE POLICY "Owners read their enquiries" ON public.enquiries
  FOR SELECT USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = business_id AND b.owner_id = auth.uid())
    OR public.is_admin()
  );

CREATE POLICY "Users insert reports" ON public.reports
  FOR INSERT WITH CHECK (reporter_id IS NULL OR reporter_id = auth.uid());

CREATE POLICY "Admins manage reports and audit log" ON public.reports
  FOR SELECT USING (reporter_id = auth.uid() OR public.is_admin());

CREATE POLICY "Admins read audit log" ON public.audit_log
  FOR SELECT USING (public.is_admin());

CREATE POLICY "Users read own notifications" ON public.notifications
  FOR SELECT USING (recipient_id = auth.uid());
