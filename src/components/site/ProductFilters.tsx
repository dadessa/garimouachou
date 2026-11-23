import { useQuery } from "@tanstack/react-query";
import { marketplaces } from "@/lib/marketplaces";
import { displayablePrice } from "@/lib/price";
import { categoriesQuery } from "@/lib/catalog/queries";
import type { Product } from "@/lib/catalog/types";

export type Ordem = "recentes" | "menor-preco" | "maior-preco";
export interface ListSearch { q?: string; cat?: string; mk?: string; ordem?: Ordem; n?: number }

export function validateListSearch(s: Record<string, unknown>): ListSearch {
  const out: ListSearch = {};
  if (typeof s["q"] === "string" && s["q"]) out.q = s["q"];
  if (typeof s["cat"] === "string" && s["cat"]) out.cat = s["cat"];
  if (typeof s["mk"] === "string" && s["mk"]) out.mk = s["mk"];
  if (s["ordem"] === "menor-preco" || s["ordem"] === "maior-preco") out.ordem = s["ordem"];
  const n = Number(s["n"]);
  if (Number.isInteger(n) && n > 0 && n <= 200) out.n = n;
  return out;
}

/** Ordenação por preço só entre preços exibíveis; os demais vão ao final. */
export function applySort(items: Product[], ordem?: Ordem) {
  if (!ordem || ordem === "recentes") return items;
  const price = (p: Product) => displayablePrice(p, p.marketplace)?.current ?? null;
  return [...items].sort((a, b) => {
    const pa = price(a), pb = price(b);
    if (pa == null && pb == null) return 0;
    if (pa == null) return 1;
    if (pb == null) return -1;
    return ordem === "menor-preco" ? pa - pb : pb - pa;
  });
}

const sel = "h-10 rounded-full border-2 border-input bg-background px-3 text-sm font-semibold";
function setKey(s: ListSearch, key: "cat" | "mk" | "ordem", v: string): ListSearch {
  const next: ListSearch = { ...s };
  delete next[key];
  delete next.n;
  if (v) (next as Record<string, string>)[key] = v;
  return next;
}

export function ProductFilters({ search, onChange, showCategory }: { search: ListSearch; onChange: (s: ListSearch) => void; showCategory?: boolean }) {
  const { data: cats = [] } = useQuery(categoriesQuery);
  return (
    <div className="mb-6 flex flex-wrap gap-2">
      {showCategory && (
        <label className="sr-only" htmlFor="f-cat">Categoria</label>
      )}
      {showCategory && (
        <select id="f-cat" className={sel} value={search.cat ?? ""} onChange={(e) => onChange(setKey(search, "cat", e.target.value))}>
          <option value="">Todas as categorias</option>
          {cats.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
        </select>
      )}
      <label className="sr-only" htmlFor="f-mk">Marketplace</label>
      <select id="f-mk" className={sel} value={search.mk ?? ""} onChange={(e) => onChange(setKey(search, "mk", e.target.value))}>
        <option value="">Todos os marketplaces</option>
        {marketplaces.map((m) => <option key={m.slug} value={m.slug}>{m.name}</option>)}
      </select>
      <label className="sr-only" htmlFor="f-ordem">Ordenar</label>
      <select id="f-ordem" className={sel} value={search.ordem ?? "recentes"} onChange={(e) => onChange(setKey(search, "ordem", e.target.value === "recentes" ? "" : e.target.value))}>
        <option value="recentes">Mais recentes</option>
        <option value="menor-preco">Menor preço</option>
        <option value="maior-preco">Maior preço</option>
      </select>
    </div>
  );
}
