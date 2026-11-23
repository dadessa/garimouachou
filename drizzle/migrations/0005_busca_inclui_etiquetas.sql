CREATE OR REPLACE FUNCTION public.search_products(q text)
RETURNS SETOF public.products
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public, extensions
AS $$
  SELECT p.* FROM public.products p
  WHERE coalesce(trim(q), '') = ''
     OR lower(public.f_unaccent(p.name || ' ' || p.short_description || ' ' || coalesce(array_to_string(p.tags, ' '), '')))
        LIKE '%' || lower(public.f_unaccent(replace(replace(replace(trim(q), '\', '\\'), '%', '\%'), '_', '\_'))) || '%'
$$;