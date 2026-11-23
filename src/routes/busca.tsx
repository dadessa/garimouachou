import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { EmptyState, LoadError } from "@/components/site/EmptyState";
import { ProductFilters, applySort, type ListSearch, validateListSearch } from "@/components/site/ProductFilters";
import { ProductGrid, ProductGridSkeleton } from "@/components/site/ProductCard";
import { searchQuery } from "@/lib/catalog/queries";

export const Route = createFileRoute("/busca")({
  validateSearch: (s): ListSearch => validateListSearch(s),
  loaderDeps: ({ search }) => ({ q: search.q, cat: search.cat, mk: search.mk }),
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(searchQuery(deps)),
  head: () => ({
    meta: [
      { title: "Busca — Garimou Achou!" },
      { name: "description", content: "Busque achadinhos por nome, categoria e marketplace." },
      { property: "og:title", content: "Busca — Garimou Achou!" },
      { property: "og:description", content: "Busque achadinhos garimpados." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "https://garimouachou.com.br/busca" }],
  }),
  pendingComponent: () => <div className="mx-auto max-w-6xl px-4 py-8"><ProductGridSkeleton /></div>,
  errorComponent: LoadError,
  component: SearchPage,
});

const PAGE = 8;
function SearchPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data } = useSuspenseQuery(searchQuery({ q: search.q, cat: search.cat, mk: search.mk }));
  const all = applySort(data, search.ordem);
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
      ) : <EmptyState title={search.q ? `Não achamos nada para “${search.q}”.` : undefined} />}
    </div>
  );
}
