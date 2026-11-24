ALTER TABLE public.radar_opportunities DROP CONSTRAINT IF EXISTS radar_opportunities_source_check;
ALTER TABLE public.radar_opportunities ADD CONSTRAINT radar_opportunities_source_check
  CHECK (source IN ('manual','relatorio','shopee_api','mercadolivre_api','mensagem','pagina_publica'));
ALTER TABLE public.radar_opportunities ADD COLUMN IF NOT EXISTS signals text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.radar_opportunities ADD COLUMN IF NOT EXISTS extra_earnings_cents integer;
ALTER TABLE public.radar_opportunities ADD COLUMN IF NOT EXISTS coupon text;