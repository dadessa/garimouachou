import { SITE_URL } from "@/lib/site";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { EmptyState, LoadError } from "@/components/site/EmptyState";
import { ProductGrid, ProductGridSkeleton } from "@/components/site/ProductCard";
import { offersQuery } from "@/lib/catalog/queries";

export const Route = createFileRoute("/ofertas")({
  loader: ({ context }) => context.queryClient.ensureQueryData(offersQuery),
  head: () => ({
    meta: [
      { title: "Ofertas em destaque — Garimou Achou!" },
      {
        name: "description",
        content: "Os achadinhos em destaque, dos mais recentes aos mais antigos.",
      },
      { property: "og:title", content: "Ofertas em destaque — Garimou Achou!" },
      { property: "og:description", content: "Os achadinhos em destaque garimpados para você." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/ofertas` }],
  }),
  pendingComponent: () => (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <ProductGridSkeleton />
    </div>
  ),
  errorComponent: LoadError,
  component: Offers,
});

function Offers() {
  const { data } = useSuspenseQuery(offersQuery);
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="mb-6 text-2xl md:text-3xl">Ofertas</h1>
      {data.length ? (
        <ProductGrid products={data} />
      ) : (
        <EmptyState title="Nenhuma oferta em destaque no momento." />
      )}
    </div>
  );
}
