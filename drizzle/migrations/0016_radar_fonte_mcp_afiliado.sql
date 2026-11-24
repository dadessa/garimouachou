ALTER TABLE public.radar_opportunities DROP CONSTRAINT IF EXISTS radar_opportunities_source_check;
ALTER TABLE public.radar_opportunities ADD CONSTRAINT radar_opportunities_source_check
  CHECK (source IN ('manual','relatorio','shopee_api','mercadolivre_api','mensagem','pagina_publica','mcp_afiliado'));