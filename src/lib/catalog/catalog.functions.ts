import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import { asIcon, PRODUCT_SELECT, toProduct, type Banner, type Category, type Product, type ProductRow } from "./types";

/** Cliente público (só chave publicável): o RLS mostra apenas o que visitantes podem ver. */
function publicDb() {
  const url = process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) throw new Error("Catálogo indisponível");
  return createClient<Database>(url, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

const fail = (e: unknown) => {
  console.error(e);
  return new Error("Não foi possível carregar os achadinhos agora.");
};
const rows = (data: unknown) => ((data ?? []) as ProductRow[]).map(toProduct).filter((p): p is Product => p !== null);

export const getCategories = createServerFn({ method: "GET" }).handler(async (): Promise<Category[]> => {
  const { data, error } = await publicDb().from("categories").select("slug,name,icon").eq("is_active", true).order("sort_order");
  if (error) throw fail(error);
  return (data ?? []).map((c) => ({ slug: c.slug, name: c.name, icon: asIcon(c.icon) }));
});

export const getHome = createServerFn({ method: "GET" }).handler(async () => {
  const db = publicDb();
  const [b, p] = await Promise.all([
    db.from("banners").select("id,image_url,image_mobile_url,alt,link_url").eq("is_active", true).order("sort_order"),
    db.from("products").select(PRODUCT_SELECT).eq("status", "published").order("published_at", { ascending: false }).limit(60),
  ]);
  if (b.error) throw fail(b.error);
  if (p.error) throw fail(p.error);
  const banners: Banner[] = (b.data ?? []).map((x) => ({
    id: x.id, image: x.image_url, alt: x.alt,
    ...(x.image_mobile_url ? { mobileImage: x.image_mobile_url } : {}),
    ...(x.link_url ? { link: x.link_url } : {}),
  }));
  return { banners, products: rows(p.data) };
});

export const getOffers = createServerFn({ method: "GET" }).handler(async () => {
  const { data, error } = await publicDb().from("products").select(PRODUCT_SELECT)
    .eq("status", "published").eq("is_featured", true).order("published_at", { ascending: false }).limit(200);
  if (error) throw fail(error);
  return rows(data);
});

const slug = z.string().max(120).regex(/^[a-z0-9-]*$/);
export const searchCatalog = createServerFn({ method: "GET" })
  .inputValidator(z.object({ q: z.string().max(100).optional(), cat: slug.optional(), mk: slug.optional() }))
  .handler(async ({ data: input }) => {
    let q = publicDb().rpc("search_products", { q: input.q ?? "" }).select(PRODUCT_SELECT)
      .eq("status", "published").order("published_at", { ascending: false }).limit(200);
    if (input.cat) q = q.eq("categories.slug", input.cat);
    if (input.mk) q = q.eq("marketplaces.slug", input.mk);
    const { data, error } = await q;
    if (error) throw fail(error);
    return rows(data);
  });

export const getCategoryPage = createServerFn({ method: "GET" })
  .inputValidator(z.object({ slug }))
  .handler(async ({ data: input }) => {
    const { data, error } = await publicDb().from("categories").select("slug,name,icon").eq("slug", input.slug).eq("is_active", true).maybeSingle();
    if (error) throw fail(error);
    return data ? ({ slug: data.slug, name: data.name, icon: asIcon(data.icon) } satisfies Category) : null;
  });

export const getProductPage = createServerFn({ method: "GET" })
  .inputValidator(z.object({ slug }))
  .handler(async ({ data: input }) => {
    const db = publicDb();
    const { data, error } = await db.from("products").select(PRODUCT_SELECT).eq("slug", input.slug).eq("status", "published").maybeSingle();
    if (error) throw fail(error);
    const product = data ? toProduct(data as unknown as ProductRow) : null;
    if (!product) return null;
    const rel = await db.from("products").select(PRODUCT_SELECT).eq("status", "published")
      .eq("categories.slug", product.categorySlug).neq("slug", product.slug).order("published_at", { ascending: false }).limit(4);
    return { product, related: rel.error ? [] : rows(rel.data) };
  });
