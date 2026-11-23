import { Link } from "@tanstack/react-router";
import type { Product } from "@/lib/catalog/types";
import { OfferButton } from "./OfferButton";
import { PriceBlock } from "./PriceBlock";
import { ProductImage } from "./ProductImage";

export function MarketplaceBadge({ name }: { name: string }) {
  return <span className="inline-block rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-bold text-navy">{name}</span>;
}

export function ProductCard({ product, preview }: { product: Product; preview?: boolean }) {
  const img = <ProductImage src={product.imageUrl} alt={product.imageAlt} />;
  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-card transition hover:-translate-y-0.5 hover:shadow-lift">
      {preview ? img : <Link to="/p/$slug" params={{ slug: product.slug }} className="block">{img}</Link>}
      <div className="flex flex-1 flex-col gap-2 p-3">
        <MarketplaceBadge name={product.marketplace.name} />
        <h3 className="line-clamp-2 text-sm font-bold leading-snug">
          {preview ? product.name || "Sem nome" : <Link to="/p/$slug" params={{ slug: product.slug }} className="hover:underline">{product.name}</Link>}
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

export function ProductGridSkeleton({ n = 8 }: { n?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-5 lg:grid-cols-4" aria-busy="true" aria-label="Carregando">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="aspect-square animate-pulse bg-muted" />
          <div className="space-y-2 p-3"><div className="h-3 w-1/3 animate-pulse rounded bg-muted" /><div className="h-4 animate-pulse rounded bg-muted" /><div className="h-11 animate-pulse rounded-full bg-muted" /></div>
        </div>
      ))}
    </div>
  );
}
