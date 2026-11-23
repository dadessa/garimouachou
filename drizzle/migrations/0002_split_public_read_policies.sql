DROP POLICY "Público lê categorias ativas" ON public.categories;
CREATE POLICY "Público lê categorias ativas" ON public.categories FOR SELECT TO anon, authenticated USING (is_active);
CREATE POLICY "Admin lê todas categorias" ON public.categories FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
DROP POLICY "Público lê marketplaces ativos" ON public.marketplaces;
CREATE POLICY "Público lê marketplaces ativos" ON public.marketplaces FOR SELECT TO anon, authenticated USING (is_active);
CREATE POLICY "Admin lê todos marketplaces" ON public.marketplaces FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
DROP POLICY "Público lê banners ativos" ON public.banners;
CREATE POLICY "Público lê banners ativos" ON public.banners FOR SELECT TO anon, authenticated USING (is_active);
CREATE POLICY "Admin lê todos banners" ON public.banners FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
DROP POLICY "Público lê produtos publicados" ON public.products;
CREATE POLICY "Público lê produtos publicados" ON public.products FOR SELECT TO anon, authenticated USING (
  status = 'published'
  AND EXISTS (SELECT 1 FROM public.categories c WHERE c.id = category_id AND c.is_active)
  AND EXISTS (SELECT 1 FROM public.marketplaces m WHERE m.id = marketplace_id AND m.is_active));
CREATE POLICY "Admin lê todos produtos" ON public.products FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));