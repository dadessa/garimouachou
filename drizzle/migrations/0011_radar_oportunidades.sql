CREATE TABLE public.radar_opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  marketplace_slug text NOT NULL,
  external_id text NOT NULL,
  name text NOT NULL,
  image_url text,
  affiliate_url text,
  category text,
  price_cents integer,
  commission_rate numeric,
  sales integer,
  search_volume integer,
  growth_pct numeric,
  rating numeric,
  seasonal_dates text[] NOT NULL DEFAULT '{}',
  source text NOT NULL CHECK (source IN ('manual','relatorio','shopee_api','mercadolivre_api')),
  fetched_at timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (marketplace_slug, external_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.radar_opportunities TO authenticated;
GRANT ALL ON public.radar_opportunities TO service_role;
ALTER TABLE public.radar_opportunities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage radar" ON public.radar_opportunities FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.radar_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  weights jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.radar_settings TO authenticated;
GRANT ALL ON public.radar_settings TO service_role;
ALTER TABLE public.radar_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage radar settings" ON public.radar_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));