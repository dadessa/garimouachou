DROP POLICY IF EXISTS "Público vê imagens do catálogo" ON storage.objects;
CREATE POLICY "Público vê imagens do catálogo em uso" ON storage.objects
FOR SELECT TO anon, authenticated
USING (
  (bucket_id = 'product-images' AND (
     EXISTS (SELECT 1 FROM public.products p WHERE p.main_image_url = '/img/product-images/' || storage.objects.name)
     OR EXISTS (SELECT 1 FROM public.product_images pi WHERE pi.url = '/img/product-images/' || storage.objects.name)
  ))
  OR (bucket_id = 'banner-images' AND
     EXISTS (SELECT 1 FROM public.banners b WHERE b.image_url = '/img/banner-images/' || storage.objects.name OR b.image_mobile_url = '/img/banner-images/' || storage.objects.name)
  )
);