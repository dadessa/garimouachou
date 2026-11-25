ALTER TABLE public.products ADD COLUMN origin text NOT NULL DEFAULT 'manual' CHECK (origin IN ('manual','importacao','garimpo','agente'));
ALTER TABLE public.products ADD COLUMN review_status text CHECK (review_status IN ('pending','approved','rejected'));
ALTER TABLE public.products ADD COLUMN garimpo_run_id uuid;
CREATE INDEX products_review_status_idx ON public.products (review_status) WHERE review_status IS NOT NULL;

CREATE TABLE public.garimpo_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enabled boolean NOT NULL DEFAULT false,
  run_hour integer NOT NULL DEFAULT 6 CHECK (run_hour BETWEEN 0 AND 23),
  frequency_hours integer NOT NULL DEFAULT 24 CHECK (frequency_hours IN (6,12,24,48,168)),
  daily_limit integer NOT NULL DEFAULT 20 CHECK (daily_limit BETWEEN 1 AND 50),
  request_limit integer NOT NULL DEFAULT 12 CHECK (request_limit BETWEEN 1 AND 40),
  marketplaces text[] NOT NULL DEFAULT '{}',
  keywords text[] NOT NULL DEFAULT '{}',
  min_price_cents integer CHECK (min_price_cents >= 0),
  max_price_cents integer CHECK (max_price_cents >= 0),
  min_commission_pct numeric CHECK (min_commission_pct >= 0),
  min_discount_pct numeric CHECK (min_discount_pct >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.garimpo_settings TO authenticated;
GRANT ALL ON public.garimpo_settings TO service_role;
ALTER TABLE public.garimpo_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage garimpo settings" ON public.garimpo_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
INSERT INTO public.garimpo_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

CREATE TABLE public.garimpo_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger text NOT NULL CHECK (trigger IN ('manual','agendada')),
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','ok','partial','failed')),
  phase text NOT NULL DEFAULT 'search' CHECK (phase IN ('search','convert','create','done')),
  plan jsonb NOT NULL DEFAULT '[]',
  cursor integer NOT NULL DEFAULT 0,
  candidates uuid[] NOT NULL DEFAULT '{}',
  created_ids uuid[] NOT NULL DEFAULT '{}',
  found integer NOT NULL DEFAULT 0,
  discarded integer NOT NULL DEFAULT 0,
  discard_reasons jsonb NOT NULL DEFAULT '{}',
  queued integer NOT NULL DEFAULT 0,
  unmonetized integer NOT NULL DEFAULT 0,
  duplicates integer NOT NULL DEFAULT 0,
  requests integer NOT NULL DEFAULT 0,
  sources jsonb NOT NULL DEFAULT '[]',
  errors text[] NOT NULL DEFAULT '{}',
  started_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE UNIQUE INDEX garimpo_runs_single_flight ON public.garimpo_runs ((true)) WHERE status = 'running';
CREATE INDEX garimpo_runs_started_idx ON public.garimpo_runs (started_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.garimpo_runs TO authenticated;
GRANT ALL ON public.garimpo_runs TO service_role;
ALTER TABLE public.garimpo_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage garimpo runs" ON public.garimpo_runs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));