import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { validPriceCents } from "@/lib/price";

export type ProductRow = Database["public"]["Tables"]["products"]["Row"];
export type ProductInsert = Database["public"]["Tables"]["products"]["Insert"];
export type CategoryRow = Database["public"]["Tables"]["categories"]["Row"];
export type MarketplaceRow = Database["public"]["Tables"]["marketplaces"]["Row"];
export type BannerRow = Database["public"]["Tables"]["banners"]["Row"];

const must = <T>(r: { data: T | null; error: unknown }): T => {
  if (r.error) throw r.error;
  return r.data as T;
};

export const adminProducts = queryOptions({
  queryKey: ["admin", "products"],
  queryFn: async () =>
    must(await supabase.from("products").select("*").order("updated_at", { ascending: false })),
});
export const adminProduct = (id: string) =>
  queryOptions({
    queryKey: ["admin", "product", id],
    queryFn: async () =>
      must(await supabase.from("products").select("*").eq("id", id).maybeSingle()),
  });
export const adminCategories = queryOptions({
  queryKey: ["admin", "categories"],
  queryFn: async () => must(await supabase.from("categories").select("*").order("sort_order")),
});
export const adminMarketplaces = queryOptions({
  queryKey: ["admin", "marketplaces"],
  queryFn: async () => must(await supabase.from("marketplaces").select("*").order("name")),
});
export const adminBanners = queryOptions({
  queryKey: ["admin", "banners"],
  queryFn: async () => must(await supabase.from("banners").select("*").order("sort_order")),
});

/** Preço vencido: tem preço, mas a verificação está ausente ou fora do prazo do marketplace. */
export function isPriceStale(
  p: Pick<ProductRow, "current_price_cents" | "price_checked_at">,
  mk: Pick<MarketplaceRow, "price_max_age_hours"> | undefined,
  now = new Date(),
) {
  if (p.current_price_cents == null) return false;
  if (!p.price_checked_at || !mk) return true;
  const age = (now.getTime() - new Date(p.price_checked_at).getTime()) / 36e5;
  return !validPriceCents(p.current_price_cents) || !(age >= 0 && age <= mk.price_max_age_hours);
}

/** Troca a ordem de dois itens vizinhos. */
export async function swapOrder(
  table: "categories" | "banners",
  a: { id: string; sort_order: number },
  b: { id: string; sort_order: number },
) {
  const r1 = await supabase
    .from(table)
    .update({ sort_order: b.sort_order === a.sort_order ? a.sort_order + 1 : b.sort_order })
    .eq("id", a.id);
  if (r1.error) throw r1.error;
  const r2 = await supabase.from(table).update({ sort_order: a.sort_order }).eq("id", b.id);
  if (r2.error) throw r2.error;
}
