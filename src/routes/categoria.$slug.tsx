import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, notFound } from "@tanstack/react-router";
import {
  ProductFilters,
  applySort,
  type ListSearch,
  validateListSearch,
} from "@/components/site/ProductFilters";
import { ProductGrid, ProductGridSkeleton } from "@/components/site/ProductCard";
import { EmptyState, LoadError } from "@/components/site/EmptyState";
import { categoryQuery, searchQuery } from "@/lib/catalog/queries";

export const Route = createFileRoute("/categoria/$slug")({
  validateSearch: (s): ListSearch => validateListSearch(s),
  loaderDeps: ({ search }) => ({ mk: search.mk }),
  loader: async ({ context, params, deps }) => {
    const category = await context.queryClient.ensureQueryData(categoryQuery(params.slug));
    if (!category) throw notFound();
    await context.queryClient.ensureQueryData(searchQuery({ cat: params.slug, mk: deps.mk }));
    return { category };
  },
  head: ({ loaderData, params }) => {
    const t = loaderData
      ? `${loaderData.category.name} — Garimou Achou!`
      : "Categoria não encontrada — Garimou Achou!";
    const d = loaderData
      ? `Achadinhos garimpados em ${loaderData.category.name}.`
      : "Categoria indisponível.";
    return {
      meta: [
        { title: t },
        { name: "description", content: d },
        { property: "og:title", content: t },
        { property: "og:description", content: d },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary" },
        ...(loaderData ? [] : [{ name: "robots", content: "noindex" }]),
      ],
      links: [{ rel: "canonical", href: `https://garimouachou.com.br/categoria/${params.slug}` }],
    };
  },
  pendingComponent: () => (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <ProductGridSkeleton />
    </div>
  ),
  errorComponent: LoadError,
  component: CategoryPage,
});

function CategoryPage() {
  const { category } = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data } = useSuspenseQuery(searchQuery({ cat: category.slug, mk: search.mk }));
  const items = applySort(data, search.ordem);
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="mb-4 text-2xl md:text-3xl">{category.name}</h1>
      <ProductFilters search={search} onChange={(s) => navigate({ search: s })} />
      {items.length ? (
        <ProductGrid products={items} />
      ) : (
        <EmptyState title={`Ainda não há achadinhos em ${category.name}.`} />
      )}
    </div>
  );
}
