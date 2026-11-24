CREATE UNIQUE INDEX IF NOT EXISTS products_marketplace_external_uniq ON public.products (marketplace_id, external_id) WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS products_affiliate_url_idx ON public.products (affiliate_url);

CREATE TABLE public.marketplace_integrations (
  marketplace_slug text PRIMARY KEY,
  status text NOT NULL DEFAULT 'not_configured' CHECK (status IN ('not_configured','awaiting_authorization','connected','error')),
  last_checked_at timestamptz,
  last_sync_at timestamptz,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.marketplace_integrations TO authenticated;
GRANT ALL ON public.marketplace_integrations TO service_role;
ALTER TABLE public.marketplace_integrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin lê integrações" ON public.marketplace_integrations FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admin insere integrações" ON public.marketplace_integrations FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admin altera integrações" ON public.marketplace_integrations FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));