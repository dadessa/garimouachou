import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { MarketplaceBadge, ProductGrid } from "@/components/site/ProductCard";
import { OfferButton } from "@/components/site/OfferButton";
import { PriceBlock } from "@/components/site/PriceBlock";
import { ProductImage } from "@/components/site/ProductImage";
import { getMarketplace } from "@/lib/marketplaces";
import { getCategory, getProduct, publishedProducts } from "@/lib/sample-data";

export const Route = createFileRoute("/p/$slug")({
  loader: ({ params }) => {
    const product = getProduct(params.slug);
    if (!product) throw notFound();
    return { product };
  },
  head: ({ loaderData, params }) => {
    const t = loaderData ? `${loaderData.product.name} — Garimou Achou!` : "Produto não encontrado — Garimou Achou!";
    const d = loaderData?.product.shortDescription ?? "Este achadinho não está disponível.";
    return {
      meta: [
        { title: t },
        { name: "description", content: d },
        { property: "og:title", content: t },
        { property: "og:description", content: d },
        { property: "og:type", content: "product" },
        ...(loaderData ? [] : [{ name: "robots", content: "noindex" }]),
      ],
      links: [{ rel: "canonical", href: `https://garimouachou.com.br/p/${params.slug}` }],
    };
  },
  component: ProductPage,
});

function ProductPage() {
  const { product } = Route.useLoaderData();
  const mk = getMarketplace(product.marketplaceSlug)!;
  const cat = getCategory(product.categorySlug)!;
  const related = publishedProducts().filter((p) => p.categorySlug === cat.slug && p.slug !== product.slug).slice(0, 4);
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 pb-28 md:pb-6">
      <nav aria-label="Trilha" className="mb-4 text-xs text-muted-foreground">
        <Link to="/" className="hover:underline">Início</Link> /{" "}
        <Link to="/categoria/$slug" params={{ slug: cat.slug }} className="hover:underline">{cat.name}</Link>
      </nav>
      <div className="grid gap-8 md:grid-cols-2">
        <div className="overflow-hidden rounded-3xl border border-border"><ProductImage alt={product.imageAlt} eager /></div>
        <div className="flex flex-col gap-4">
          <MarketplaceBadge slug={mk.slug} />
          <h1 className="text-2xl md:text-3xl">{product.name}</h1>
          <p className="text-muted-foreground">{product.shortDescription}</p>
          <PriceBlock product={product} detailed />
          <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background p-3 md:static md:border-0 md:p-0">
            <OfferButton product={product} label={`Ver oferta na ${mk.name}`} className="h-12 w-full md:w-auto md:px-8" />
          </div>
          <div className="space-y-2 rounded-2xl bg-muted p-4 text-sm">
            <p>Você será direcionado ao site da {mk.name}. A compra, o pagamento, a entrega e as trocas são feitos lá.</p>
            <p>Este link pode gerar comissão para o Garimou Achou!, sem custo extra para você.</p>
          </div>
        </div>
      </div>
      {related.length > 0 && (
        <section className="pt-12">
          <h2 className="mb-4 text-xl">Mais em {cat.name}</h2>
          <ProductGrid products={related} />
        </section>
      )}
    </div>
  );
}
