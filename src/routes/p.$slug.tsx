import { createFileRoute, notFound } from "@tanstack/react-router";
import { LoadError } from "@/components/site/EmptyState";
import { ProductGrid } from "@/components/site/ProductCard";
import { ProductDetail } from "@/components/site/ProductDetail";
import { productQuery } from "@/lib/catalog/queries";

export const Route = createFileRoute("/p/$slug")({
  loader: async ({ context, params }) => {
    const data = await context.queryClient.ensureQueryData(productQuery(params.slug));
    if (!data) throw notFound();
    return data;
  },
  head: ({ loaderData, params }) => {
    const p = loaderData?.product;
    const t = p ? `${p.name} — Garimou Achou!` : "Produto não encontrado — Garimou Achou!";
    const d = p?.shortDescription || "Este achadinho não está disponível.";
    const img = p?.imageUrl?.startsWith("https://") ? p.imageUrl : null;
    return {
      meta: [
        { title: t }, { name: "description", content: d }, { property: "og:title", content: t }, { property: "og:description", content: d },
        { property: "og:type", content: "product" }, { name: "twitter:card", content: "summary_large_image" },
        ...(img ? [{ property: "og:image", content: img }, { name: "twitter:image", content: img }] : []),
        ...(p ? [] : [{ name: "robots", content: "noindex" }]),
      ],
      links: [{ rel: "canonical", href: `https://garimouachou.com.br/p/${params.slug}` }],
    };
  },
  errorComponent: LoadError,
  component: ProductPage,
});

function ProductPage() {
  const { product, related } = Route.useLoaderData();
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 pb-28 md:pb-6">
      <ProductDetail product={product} />
      {related.length > 0 && (
        <section className="pt-12">
          <h2 className="mb-4 text-xl">Mais em {product.categoryName}</h2>
          <ProductGrid products={related} />
        </section>
      )}
    </div>
  );
}
