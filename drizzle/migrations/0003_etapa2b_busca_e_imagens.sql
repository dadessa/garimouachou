CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.f_unaccent(text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
SET search_path = public, extensions
AS $$ SELECT extensions.unaccent('extensions.unaccent'::regdictionary, $1) $$;

CREATE OR REPLACE FUNCTION public.search_products(q text)
RETURNS SETOF public.products
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public, extensions
AS $$
  SELECT p.* FROM public.products p
  WHERE coalesce(trim(q), '') = ''
     OR lower(public.f_unaccent(p.name || ' ' || p.short_description))
        LIKE '%' || lower(public.f_unaccent(replace(replace(replace(trim(q), '\', '\\'), '%', '\%'), '_', '\_'))) || '%'
$$;

GRANT EXECUTE ON FUNCTION public.search_products(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.f_unaccent(text) TO anon, authenticated;

CREATE POLICY "Público vê imagens do catálogo" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = ANY (ARRAY['product-images'::text, 'banner-images'::text]));