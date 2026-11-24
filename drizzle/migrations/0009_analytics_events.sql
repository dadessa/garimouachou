CREATE TYPE public.analytics_event_type AS ENUM ('page_view','product_view','offer_click','share_click','instagram_click');

CREATE TABLE public.analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type public.analytics_event_type NOT NULL,
  session_id text NOT NULL,
  path text NOT NULL DEFAULT '/',
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  marketplace_id uuid REFERENCES public.marketplaces(id) ON DELETE SET NULL,
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  share_channel text,
  referrer_host text,
  utm_source text, utm_medium text, utm_campaign text, utm_content text, utm_term text,
  dedup_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX analytics_events_created_idx ON public.analytics_events (created_at);
CREATE INDEX analytics_events_product_idx ON public.analytics_events (product_id);

GRANT SELECT ON public.analytics_events TO authenticated;
GRANT ALL ON public.analytics_events TO service_role;
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin lê eventos" ON public.analytics_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE OR REPLACE FUNCTION public.admin_performance_report(_from timestamptz, _to timestamptz, _marketplace uuid DEFAULT NULL, _category uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE r jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Sem permissão.'; END IF;
  WITH e AS (
    SELECT * FROM public.analytics_events
    WHERE created_at >= _from AND created_at < _to
  ), pe AS (
    SELECT * FROM e WHERE event_type IN ('product_view','offer_click','share_click')
      AND (_marketplace IS NULL OR marketplace_id = _marketplace)
      AND (_category IS NULL OR category_id = _category)
  ), days AS (
    SELECT generate_series(date_trunc('day', _from AT TIME ZONE 'America/Sao_Paulo'),
                           date_trunc('day', (_to - interval '1 second') AT TIME ZONE 'America/Sao_Paulo'), interval '1 day')::date AS d
  )
  SELECT jsonb_build_object(
    'visits', (SELECT count(DISTINCT session_id) FROM e WHERE event_type = 'page_view'),
    'page_views', (SELECT count(*) FROM e WHERE event_type = 'page_view'),
    'product_views', (SELECT count(*) FROM pe WHERE event_type = 'product_view'),
    'offer_clicks', (SELECT count(*) FROM pe WHERE event_type = 'offer_click'),
    'shares', (SELECT count(*) FROM pe WHERE event_type = 'share_click'),
    'instagram_clicks', (SELECT count(*) FROM e WHERE event_type = 'instagram_click'),
    'daily', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'day', d,
        'visits', (SELECT count(DISTINCT session_id) FROM e WHERE event_type='page_view' AND (created_at AT TIME ZONE 'America/Sao_Paulo')::date = d),
        'product_views', (SELECT count(*) FROM pe WHERE event_type='product_view' AND (created_at AT TIME ZONE 'America/Sao_Paulo')::date = d),
        'offer_clicks', (SELECT count(*) FROM pe WHERE event_type='offer_click' AND (created_at AT TIME ZONE 'America/Sao_Paulo')::date = d)
      ) ORDER BY d), '[]') FROM days),
    'top_products', (SELECT coalesce(jsonb_agg(x ORDER BY x->>'clicks' DESC), '[]') FROM (
        SELECT jsonb_build_object('name', p.name, 'slug', p.slug,
          'clicks', count(*) FILTER (WHERE pe.event_type='offer_click'),
          'views', count(*) FILTER (WHERE pe.event_type='product_view')) x
        FROM pe JOIN public.products p ON p.id = pe.product_id
        GROUP BY p.id HAVING count(*) FILTER (WHERE pe.event_type='offer_click') > 0
        ORDER BY count(*) FILTER (WHERE pe.event_type='offer_click') DESC LIMIT 20) t),
    'categories', (SELECT coalesce(jsonb_agg(jsonb_build_object('name', c.name, 'clicks', t.clicks, 'views', t.views) ORDER BY t.clicks DESC), '[]') FROM (
        SELECT category_id, count(*) FILTER (WHERE event_type='offer_click') clicks, count(*) FILTER (WHERE event_type='product_view') views
        FROM pe WHERE category_id IS NOT NULL GROUP BY category_id) t JOIN public.categories c ON c.id = t.category_id),
    'marketplaces', (SELECT coalesce(jsonb_agg(jsonb_build_object('name', m.name, 'clicks', t.clicks, 'views', t.views, 'shares', t.shares) ORDER BY t.clicks DESC), '[]') FROM (
        SELECT marketplace_id, count(*) FILTER (WHERE event_type='offer_click') clicks, count(*) FILTER (WHERE event_type='product_view') views, count(*) FILTER (WHERE event_type='share_click') shares
        FROM pe WHERE marketplace_id IS NOT NULL GROUP BY marketplace_id) t JOIN public.marketplaces m ON m.id = t.marketplace_id),
    'sources', (SELECT coalesce(jsonb_agg(jsonb_build_object('source', s, 'visits', n) ORDER BY n DESC), '[]') FROM (
        SELECT coalesce(nullif(utm_source,''), nullif(referrer_host,''), 'direto') s, count(DISTINCT session_id) n
        FROM e WHERE event_type='page_view' GROUP BY 1) t),
    'share_channels', (SELECT coalesce(jsonb_agg(jsonb_build_object('channel', ch, 'shares', n) ORDER BY n DESC), '[]') FROM (
        SELECT coalesce(share_channel,'outro') ch, count(*) n FROM pe WHERE event_type='share_click' GROUP BY 1) t),
    'no_clicks', (SELECT coalesce(jsonb_agg(jsonb_build_object('name', p.name, 'slug', p.slug) ORDER BY p.name), '[]')
        FROM public.products p WHERE p.status = 'published'
          AND (_marketplace IS NULL OR p.marketplace_id = _marketplace)
          AND (_category IS NULL OR p.category_id = _category)
          AND NOT EXISTS (SELECT 1 FROM pe WHERE pe.product_id = p.id AND pe.event_type='offer_click'))
  ) INTO r;
  RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.admin_performance_report(timestamptz,timestamptz,uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_performance_report(timestamptz,timestamptz,uuid,uuid) TO authenticated;