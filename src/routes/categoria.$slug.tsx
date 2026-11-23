import { createFileRoute, notFound } from "@tanstack/react-router";
import { ProductFilters, applySort, type ListSearch, validateListSearch } from "@/components/site/ProductFilters";
import { ProductGrid } from "@/components/site/ProductCard";
import { EmptyState } from "@/components/site/EmptyState";
import { getCategory, searchProducts } from "@/lib/sample-data";

export const Route = createFileRoute("/categoria/$slug")({
  validateSearch: (s): ListSearch => validateListSearch(s),
  loader: ({ params }) => {
    const category = getCategory(params.slug);
    if (!category) throw notFound();
    return { category };
  },
  head: ({ loaderData, params }) => {
    const t = loaderData ? `${loaderData.category.name} — Garimou Achou!` : "Categoria não encontrada — Garimou Achou!";
    const d = loaderData ? `Achadinhos garimpados em ${loaderData.category.name}.` : "Categoria indisponível.";
    return {
      meta: [{ title: t }, { name: "description", content: d }, { property: "og:title", content: t }, { property: "og:description", content: d }],
      links: [{ rel: "canonical", href: `https://garimouachou.com.br/categoria/${params.slug}` }],
    };
  },
  component: CategoryPage,
});

function CategoryPage() {
  const { category } = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const items = applySort(searchProducts("", category.slug, search.mk), search.ordem);
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="mb-4 text-2xl md:text-3xl">{category.name}</h1>
      <ProductFilters search={search} onChange={(s) => navigate({ search: s })} />
      {items.length ? <ProductGrid products={items} /> : <EmptyState />}
    </div>
  );
}
