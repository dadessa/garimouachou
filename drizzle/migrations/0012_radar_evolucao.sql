ALTER TABLE public.radar_opportunities
  ADD COLUMN extra_commission_rate numeric,
  ADD COLUMN discount_pct numeric,
  ADD COLUMN original_price_cents integer;

ALTER TABLE public.radar_settings
  ADD COLUMN daily_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN max_items integer NOT NULL DEFAULT 100 CHECK (max_items BETWEEN 10 AND 500);

CREATE TABLE public.radar_snapshots (
  opportunity_id uuid NOT NULL REFERENCES public.radar_opportunities(id) ON DELETE CASCADE,
  day date NOT NULL,
  price_cents integer,
  commission_rate numeric,
  sales integer,
  search_volume integer,
  source text NOT NULL,
  fetched_at timestamptz NOT NULL,
  PRIMARY KEY (opportunity_id, day)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.radar_snapshots TO authenticated;
GRANT ALL ON public.radar_snapshots TO service_role;
ALTER TABLE public.radar_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage radar snapshots" ON public.radar_snapshots FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.radar_snapshot() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.radar_snapshots(opportunity_id, day, price_cents, commission_rate, sales, search_volume, source, fetched_at)
  VALUES (NEW.id, (NEW.fetched_at AT TIME ZONE 'America/Sao_Paulo')::date, NEW.price_cents, NEW.commission_rate, NEW.sales, NEW.search_volume, NEW.source, NEW.fetched_at)
  ON CONFLICT (opportunity_id, day) DO UPDATE SET price_cents = EXCLUDED.price_cents, commission_rate = EXCLUDED.commission_rate,
    sales = EXCLUDED.sales, search_volume = EXCLUDED.search_volume, source = EXCLUDED.source, fetched_at = EXCLUDED.fetched_at;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.radar_snapshot() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER radar_opportunities_snapshot AFTER INSERT OR UPDATE ON public.radar_opportunities
  FOR EACH ROW EXECUTE FUNCTION public.radar_snapshot();

CREATE TABLE public.radar_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger text NOT NULL CHECK (trigger IN ('manual','agendada')),
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','ok','partial','failed','skipped')),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  items integer NOT NULL DEFAULT 0,
  requests integer NOT NULL DEFAULT 0,
  sources jsonb NOT NULL DEFAULT '[]',
  errors text[] NOT NULL DEFAULT '{}'
);
CREATE UNIQUE INDEX radar_runs_single_flight ON public.radar_runs ((true)) WHERE status = 'running';
GRANT SELECT, INSERT, UPDATE ON public.radar_runs TO authenticated;
GRANT ALL ON public.radar_runs TO service_role;
ALTER TABLE public.radar_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage radar runs" ON public.radar_runs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.site_searches (
  term text NOT NULL CHECK (char_length(term) BETWEEN 2 AND 60),
  day date NOT NULL,
  count integer NOT NULL DEFAULT 1,
  PRIMARY KEY (term, day)
);
GRANT SELECT ON public.site_searches TO authenticated;
GRANT ALL ON public.site_searches TO service_role;
ALTER TABLE public.site_searches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read searches" ON public.site_searches FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.log_search(_term text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t text := lower(btrim(regexp_replace(coalesce(_term,''), '\s+', ' ', 'g')));
BEGIN
  IF char_length(t) < 2 OR char_length(t) > 60 OR t ~ '[@0-9]{6,}|@' THEN RETURN; END IF;
  INSERT INTO public.site_searches(term, day) VALUES (t, (now() AT TIME ZONE 'America/Sao_Paulo')::date)
  ON CONFLICT (term, day) DO UPDATE SET count = public.site_searches.count + 1;
END $$;
REVOKE EXECUTE ON FUNCTION public.log_search(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_search(text) TO anon, authenticated;