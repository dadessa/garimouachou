import { Link } from "@tanstack/react-router";
import { getMarketplace } from "@/lib/marketplaces";
import type { Product } from "@/lib/sample-data";
import { OfferButton } from "./OfferButton";
import { PriceBlock } from "./PriceBlock";
import { ProductImage } from "./ProductImage";

export function MarketplaceBadge({ slug }: { slug: string }) {
  return <span className="inline-block rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-bold text-navy">{getMarketplace(slug)?.name}</span>;
}

export function ProductCard({ product }: { product: Product }) {
  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-card transition hover:-translate-y-0.5 hover:shadow-lift">
      <Link to="/p/$slug" params={{ slug: product.slug }} className="block">
        <ProductImage alt={product.imageAlt} />
      </Link>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <MarketplaceBadge slug={product.marketplaceSlug} />
        <h3 className="line-clamp-2 text-sm font-bold leading-snug">
          <Link to="/p/$slug" params={{ slug: product.slug }} className="hover:underline">{product.name}</Link>
        </h3>
        <PriceBlock product={product} />
        <div className="mt-auto pt-1">
          <OfferButton product={product} className="w-full" />
          <p className="mt-1.5 text-center text-[11px] text-muted-foreground">Link de afiliado</p>
        </div>
      </div>
    </article>
  );
}

export function ProductGrid({ products }: { products: Product[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-5 lg:grid-cols-4">
      {products.map((p) => <ProductCard key={p.slug} product={p} />)}
    </div>
  );
}
