import { Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { track } from "@/lib/analytics/track";
import type { Product } from "@/lib/catalog/types";
import { MarketplaceBadge } from "./ProductCard";
import { OfferButton } from "./OfferButton";
import { PriceBlock } from "./PriceBlock";
import { ProductImage } from "./ProductImage";
import { ShareButtons } from "./ShareButtons";

export function ProductDetail({ product, preview }: { product: Product; preview?: boolean }) {
  const mk = product.marketplace;
  useEffect(() => {
    if (!preview) track("product_view", { slug: product.slug });
  }, [preview, product.slug]);
  return (
    <>
      <nav aria-label="Trilha" className="mb-4 text-xs text-muted-foreground">
        {preview ? (
          <span>Início / {product.categoryName}</span>
        ) : (
          <>
            <Link to="/" className="hover:underline">
              Início
            </Link>{" "}
            /{" "}
            <Link
              to="/categoria/$slug"
              params={{ slug: product.categorySlug }}
              className="hover:underline"
            >
              {product.categoryName}
            </Link>
          </>
        )}
      </nav>
      <div className="grid gap-8 md:grid-cols-2">
        <div className="overflow-hidden rounded-3xl border border-border">
          <ProductImage src={product.imageUrl} alt={product.imageAlt} eager />
        </div>
        <div className="flex flex-col gap-4">
          <MarketplaceBadge name={mk.name} />
          <h1 className="text-2xl md:text-3xl">{product.name || "Sem nome"}</h1>
          <p className="text-muted-foreground">{product.shortDescription}</p>
          {product.tags.length > 0 && (
            <ul aria-label="Etiquetas" className="flex flex-wrap gap-2">
              {product.tags.map((tag) => (
                <li key={tag}>
                  {preview ? (
                    <span className="inline-block rounded-full border border-border bg-muted px-3 py-1 text-xs font-semibold text-navy">
                      {tag}
                    </span>
                  ) : (
                    <Link
                      to="/busca"
                      search={{ q: tag }}
                      className="inline-block rounded-full border border-border bg-muted px-3 py-1 text-xs font-semibold text-navy transition hover:bg-accent"
                    >
                      {tag}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )}
          <PriceBlock product={product} detailed />
          <div
            className={
              preview
                ? ""
                : "fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background p-3 md:static md:border-0 md:p-0"
            }
          >
            <OfferButton
              product={product}
              label={`Ver oferta na ${mk.name}`}
              className="h-12 w-full md:w-auto md:px-8"
            />
          </div>
          <div className="space-y-2 rounded-2xl bg-muted p-4 text-sm">
            <p>
              Você será direcionado ao site da {mk.name}. A compra, o pagamento, a entrega e as
              trocas são feitos lá.
            </p>
            <p>Este link pode gerar comissão, sem custo extra para você.</p>
          </div>
          {!preview && <ShareButtons product={product} />}
        </div>
      </div>
    </>
  );
}
