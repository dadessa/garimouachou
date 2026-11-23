import { queryOptions } from "@tanstack/react-query";
import { getCategories, getCategoryPage, getHome, getOffers, getProductPage, searchCatalog } from "./catalog.functions";

const s = { staleTime: 60_000 };
export const categoriesQuery = queryOptions({ queryKey: ["categories"], queryFn: () => getCategories(), ...s });
export const homeQuery = queryOptions({ queryKey: ["home"], queryFn: () => getHome(), ...s });
export const offersQuery = queryOptions({ queryKey: ["offers"], queryFn: () => getOffers(), ...s });
export const searchQuery = (p: { q?: string | undefined; cat?: string | undefined; mk?: string | undefined }) => {
  const data = { ...(p.q ? { q: p.q } : {}), ...(p.cat ? { cat: p.cat } : {}), ...(p.mk ? { mk: p.mk } : {}) };
  return queryOptions({ queryKey: ["search", p.q ?? "", p.cat ?? "", p.mk ?? ""], queryFn: () => searchCatalog({ data }), ...s });
};
export const categoryQuery = (slug: string) => queryOptions({ queryKey: ["category", slug], queryFn: () => getCategoryPage({ data: { slug } }), ...s });
export const productQuery = (slug: string) => queryOptions({ queryKey: ["product", slug], queryFn: () => getProductPage({ data: { slug } }), ...s });
