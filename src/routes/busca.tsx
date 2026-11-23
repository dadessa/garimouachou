import { createFileRoute } from "@tanstack/react-router";
import { EmptyState } from "@/components/site/EmptyState";
import { ProductFilters, applySort, type ListSearch, validateListSearch } from "@/components/site/ProductFilters";
import { ProductGrid } from "@/components/site/ProductCard";
import { searchProducts } from "@/lib/sample-data";

export const Route = createFileRoute("/busca")({
  validateSearch: (s): ListSearch => validateListSearch(s),
  head: () => ({
    meta: [
      { title: "Busca — Garimou Achou!" },
      { name: "description", content: "Busque achadinhos por nome, categoria e marketplace." },
      { property: "og:title", content: "Busca — Garimou Achou!" },
      { property: "og:description", content: "Busque achadinhos garimpados." },
    ],
    links: [{ rel: "canonical", href: "https://garimouachou.com.br/busca" }],
  }),
  component: SearchPage,
});

const PAGE = 8;
function SearchPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const all = applySort(searchProducts(search.q ?? "", search.cat, search.mk), search.ordem);
  const limit = search.n ?? PAGE;
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="mb-1 text-2xl md:text-3xl">{search.q ? `Resultados para “${search.q}”` : "Todos os achadinhos"}</h1>
      <p className="mb-4 text-sm text-muted-foreground">{all.length} {all.length === 1 ? "resultado" : "resultados"}</p>
      <ProductFilters search={search} showCategory onChange={(s) => navigate({ search: s })} />
      {all.length ? (
        <>
          <ProductGrid products={all.slice(0, limit)} />
          {all.length > limit && (
            <div className="mt-8 text-center">
              <button onClick={() => navigate({ search: { ...search, n: limit + PAGE }, resetScroll: false })} className="h-11 rounded-full bg-navy px-6 text-sm font-bold text-secondary-foreground">Carregar mais</button>
            </div>
          )}
        </>
      ) : <EmptyState />}
    </div>
  );
}
