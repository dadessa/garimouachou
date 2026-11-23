CREATE TYPE public.app_role AS ENUM ('admin');
CREATE TYPE public.integration_status AS ENUM ('manual','planned','active');
CREATE TYPE public.price_source AS ENUM ('manual','api');
CREATE TYPE public.product_status AS ENUM ('draft','published','inactive');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

CREATE POLICY "Usuário lê os próprios papéis" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- Validação de URL de afiliado (espelha isAllowedAffiliateUrl no frontend)
CREATE OR REPLACE FUNCTION public.is_allowed_affiliate_url(_url text, _domains text[])
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE authority text; host text; port text; d text;
BEGIN
  IF _url IS NULL OR _url ~ '[\s\\]' OR _url !~* '^https://' THEN RETURN false; END IF;
  authority := substring(_url from '^[A-Za-z]+://([^/?#]*)');
  IF authority IS NULL OR authority = '' OR position('@' in authority) > 0 OR position('[' in authority) > 0 THEN RETURN false; END IF;
  host := lower(split_part(authority, ':', 1));
  port := CASE WHEN position(':' in authority) > 0 THEN split_part(authority, ':', 2) END;
  IF port IS NOT NULL AND port <> '443' THEN RETURN false; END IF;
  IF host ~ '^\d+\.\d+\.\d+\.\d+$' THEN RETURN false; END IF;
  host := rtrim(host, '.');
  FOREACH d IN ARRAY coalesce(_domains, '{}') LOOP
    IF host = lower(d) OR host LIKE '%.' || lower(d) THEN RETURN true; END IF;
  END LOOP;
  RETURN false;
END $$;

CREATE TABLE public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  icon text NOT NULL DEFAULT 'grid',
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.categories TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories TO authenticated;
GRANT ALL ON public.categories TO service_role;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Público lê categorias ativas" ON public.categories FOR SELECT TO anon, authenticated USING (is_active OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admin insere categorias" ON public.categories FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admin altera categorias" ON public.categories FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admin exclui categorias" ON public.categories FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER categories_updated_at BEFORE UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.marketplaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  allowed_domains text[] NOT NULL DEFAULT '{}',
  allow_manual_price boolean NOT NULL DEFAULT true,
  price_max_age_hours int NOT NULL DEFAULT 24 CHECK (price_max_age_hours > 0),
  integration_status public.integration_status NOT NULL DEFAULT 'manual',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.marketplaces TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketplaces TO authenticated;
GRANT ALL ON public.marketplaces TO service_role;
ALTER TABLE public.marketplaces ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Público lê marketplaces ativos" ON public.marketplaces FOR SELECT TO anon, authenticated USING (is_active OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admin insere marketplaces" ON public.marketplaces FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admin altera marketplaces" ON public.marketplaces FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admin exclui marketplaces" ON public.marketplaces FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER marketplaces_updated_at BEFORE UPDATE ON public.marketplaces FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text NOT NULL DEFAULT '',
  short_description text NOT NULL DEFAULT '',
  category_id uuid REFERENCES public.categories(id) ON DELETE RESTRICT,
  marketplace_id uuid REFERENCES public.marketplaces(id) ON DELETE RESTRICT,
  affiliate_url text NOT NULL DEFAULT '',
  main_image_url text,
  main_image_alt text,
  current_price_cents int CHECK (current_price_cents IS NULL OR current_price_cents >= 0),
  previous_price_cents int CHECK (previous_price_cents IS NULL OR previous_price_cents >= 0),
  price_checked_at timestamptz,
  price_source public.price_source NOT NULL DEFAULT 'manual',
  status public.product_status NOT NULL DEFAULT 'draft',
  is_featured boolean NOT NULL DEFAULT false,
  is_weekly_pick boolean NOT NULL DEFAULT false,
  seo_title text,
  seo_description text,
  source public.price_source NOT NULL DEFAULT 'manual',
  external_id text,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT previous_gt_current CHECK (previous_price_cents IS NULL OR (current_price_cents IS NOT NULL AND previous_price_cents > current_price_cents))
);
CREATE INDEX products_status_idx ON public.products(status, published_at DESC);
CREATE INDEX products_category_idx ON public.products(category_id);
GRANT SELECT ON public.products TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Público lê produtos publicados" ON public.products FOR SELECT TO anon, authenticated USING (
  (status = 'published'
   AND EXISTS (SELECT 1 FROM public.categories c WHERE c.id = category_id AND c.is_active)
   AND EXISTS (SELECT 1 FROM public.marketplaces m WHERE m.id = marketplace_id AND m.is_active))
  OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admin insere produtos" ON public.products FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admin altera produtos" ON public.products FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admin exclui produtos" ON public.products FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.validate_product_publish() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cat_ok boolean; mk record;
BEGIN
  IF NEW.status = 'published' THEN
    IF coalesce(trim(NEW.name),'') = '' THEN RAISE EXCEPTION 'Para publicar, informe o nome do produto.'; END IF;
    IF coalesce(trim(NEW.main_image_url),'') = '' OR coalesce(trim(NEW.main_image_alt),'') = '' THEN
      RAISE EXCEPTION 'Para publicar, envie a imagem principal com texto alternativo.'; END IF;
    SELECT is_active INTO cat_ok FROM public.categories WHERE id = NEW.category_id;
    IF NOT coalesce(cat_ok,false) THEN RAISE EXCEPTION 'Para publicar, escolha uma categoria ativa.'; END IF;
    SELECT * INTO mk FROM public.marketplaces WHERE id = NEW.marketplace_id;
    IF mk IS NULL OR NOT mk.is_active THEN RAISE EXCEPTION 'Para publicar, escolha um marketplace ativo.'; END IF;
    IF NOT public.is_allowed_affiliate_url(NEW.affiliate_url, mk.allowed_domains) THEN
      RAISE EXCEPTION 'Para publicar, o link de afiliado precisa ser https e de um domínio permitido de %.', mk.name; END IF;
    IF NEW.published_at IS NULL THEN NEW.published_at := now(); END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER products_validate_publish BEFORE INSERT OR UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.validate_product_publish();

CREATE TABLE public.product_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  url text NOT NULL,
  alt text NOT NULL DEFAULT '',
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX product_images_product_idx ON public.product_images(product_id, sort_order);
GRANT SELECT ON public.product_images TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_images TO authenticated;
GRANT ALL ON public.product_images TO service_role;
ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Público lê imagens de produtos visíveis" ON public.product_images FOR SELECT TO anon, authenticated USING (EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id));
CREATE POLICY "Admin insere imagens" ON public.product_images FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admin altera imagens" ON public.product_images FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admin exclui imagens" ON public.product_images FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.banners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL DEFAULT '',
  image_url text NOT NULL,
  image_mobile_url text,
  alt text NOT NULL DEFAULT '',
  link_url text,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.banners TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.banners TO authenticated;
GRANT ALL ON public.banners TO service_role;
ALTER TABLE public.banners ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Público lê banners ativos" ON public.banners FOR SELECT TO anon, authenticated USING (is_active OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admin insere banners" ON public.banners FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admin altera banners" ON public.banners FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admin exclui banners" ON public.banners FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER banners_updated_at BEFORE UPDATE ON public.banners FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Storage: escrita só para admin (buckets criados à parte)
CREATE POLICY "Admin envia imagens" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id IN ('product-images','banner-images') AND public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admin altera imagens storage" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id IN ('product-images','banner-images') AND public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admin exclui imagens storage" ON storage.objects FOR DELETE TO authenticated USING (bucket_id IN ('product-images','banner-images') AND public.has_role(auth.uid(),'admin'));

-- Dados iniciais
INSERT INTO public.categories (name, slug, icon, sort_order) VALUES
 ('Casa e Cozinha','casa-e-cozinha','home',1),('Tecnologia','tecnologia','cpu',2),
 ('Moda e Acessórios','moda-e-acessorios','shirt',3),('Beleza','beleza','sparkles',4),
 ('Organização','organizacao','box',5),('Presentes','presentes','gift',6),('Outros','outros','grid',7);
INSERT INTO public.marketplaces (name, slug, allowed_domains, allow_manual_price) VALUES
 ('Amazon Brasil','amazon','{amazon.com.br,amzn.to}',false),
 ('Shopee','shopee','{shopee.com.br,s.shopee.com.br}',true),
 ('Mercado Livre','mercadolivre','{mercadolivre.com.br,mercadolivre.com}',true),
 ('Magalu','magalu','{magazineluiza.com.br,magazinevoce.com.br}',true);
INSERT INTO public.banners (title, image_url, alt, sort_order) VALUES
 ('Capa','/__l5e/assets-v1/e8730300-aaf9-492f-bf4b-40a2ff6a6e3e/destaque-capa.png','Garimou Achou! A gente garimpa. Você aproveita.',1),
 ('Achadinhos da Semana','/__l5e/assets-v1/ea42f46a-798e-452a-8054-ced6086f2fa1/destaque-achadinhos.png','Achadinhos da Semana',2),
 ('Ofertas imperdíveis','/__l5e/assets-v1/31b89fde-3482-47b8-a8bc-d04c298ce8ae/destaque-ofertas.png','Ofertas imperdíveis',3);