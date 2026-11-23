import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { marketplaces } from "@/lib/marketplaces";
import { displayablePrice } from "@/lib/price";
import { categoriesQuery } from "@/lib/catalog/queries";
import type { Product } from "@/lib/catalog/types";

export type Ordem = "recentes" | "menor-preco" | "maior-preco";
export interface ListSearch {
  q?: string;
  cat?: string;
  mk?: string;
  ordem?: Ordem;
  n?: number;
}

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
    const pa = price(a),
      pb = price(b);
    if (pa == null && pb == null) return 0;
    if (pa == null) return 1;
    if (pb == null) return -1;
    return ordem === "menor-preco" ? pa - pb : pb - pa;
  });
}

const ordemLabel: Record<Ordem, string> = {
  recentes: "Mais recentes",
  "menor-preco": "Menor preço",
  "maior-preco": "Maior preço",
};

const sel = "h-10 rounded-full border-2 border-input bg-background px-3 text-sm font-semibold";
function setKey(s: ListSearch, key: "cat" | "mk" | "ordem", v: string): ListSearch {
  const next: ListSearch = { ...s };
  delete next[key];
  delete next.n;
  if (v) (next as Record<string, string>)[key] = v;
  return next;
}

export function ProductFilters({
  search,
  onChange,
  showCategory,
}: {
  search: ListSearch;
  onChange: (s: ListSearch) => void;
  showCategory?: boolean;
}) {
  const { data: cats = [] } = useQuery(categoriesQuery);
  const chips: { key: keyof ListSearch; label: string }[] = [];
  if (search.q) chips.push({ key: "q", label: `Palavra: “${search.q}”` });
  if (showCategory && search.cat)
    chips.push({
      key: "cat",
      label: `Categoria: ${cats.find((c) => c.slug === search.cat)?.name ?? search.cat}`,
    });
  if (search.mk)
    chips.push({
      key: "mk",
      label: `Loja: ${marketplaces.find((m) => m.slug === search.mk)?.name ?? search.mk}`,
    });
  if (search.ordem) chips.push({ key: "ordem", label: ordemLabel[search.ordem] });
  const remove = (key: keyof ListSearch) => {
    const next: ListSearch = { ...search };
    delete next[key];
    delete next.n;
    onChange(next);
  };
  return (
    <div className="mb-6">
    <div className="flex flex-wrap gap-2">
      {showCategory && (
        <label className="sr-only" htmlFor="f-cat">
          Categoria
        </label>
      )}
      {showCategory && (
        <select
          id="f-cat"
          className={sel}
          value={search.cat ?? ""}
          onChange={(e) => onChange(setKey(search, "cat", e.target.value))}
        >
          <option value="">Todas as categorias</option>
          {cats.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.name}
            </option>
          ))}
        </select>
      )}
      <label className="sr-only" htmlFor="f-mk">
        Marketplace
      </label>
      <select
        id="f-mk"
        className={sel}
        value={search.mk ?? ""}
        onChange={(e) => onChange(setKey(search, "mk", e.target.value))}
      >
        <option value="">Todos os marketplaces</option>
        {marketplaces.map((m) => (
          <option key={m.slug} value={m.slug}>
            {m.name}
          </option>
        ))}
      </select>
      <label className="sr-only" htmlFor="f-ordem">
        Ordenar
      </label>
      <select
        id="f-ordem"
        className={sel}
        value={search.ordem ?? "recentes"}
        onChange={(e) =>
          onChange(setKey(search, "ordem", e.target.value === "recentes" ? "" : e.target.value))
        }
      >
        <option value="recentes">Mais recentes</option>
        <option value="menor-preco">Menor preço</option>
        <option value="maior-preco">Maior preço</option>
      </select>
    </div>
      {chips.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2" aria-label="Filtros ativos">
          {chips.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => remove(c.key)}
              aria-label={`Remover filtro ${c.label}`}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-accent px-3 text-xs font-bold text-accent-foreground"
            >
              {c.label}
              <X className="size-3.5" aria-hidden="true" />
            </button>
          ))}
          <button
            type="button"
            onClick={() => onChange({})}
            className="min-h-9 px-2 text-xs font-bold text-navy underline"
          >
            Limpar filtros
          </button>
        </div>
      )}
    </div>
  );
}
