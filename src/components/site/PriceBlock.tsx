import { getMarketplace } from "@/lib/marketplaces";
import { displayablePrice, formatBRL } from "@/lib/price";
import type { Product } from "@/lib/sample-data";

export function PriceBlock({ product, detailed }: { product: Product; detailed?: boolean }) {
  const mk = getMarketplace(product.marketplaceSlug);
  const price = mk ? displayablePrice(product, mk) : null;
  if (!price) return null;
  const d = price.checkedAt;
  return (
    <div>
      {price.previous && <span className="mr-2 text-sm text-muted-foreground line-through">{formatBRL(price.previous)}</span>}
      <span className={`font-extrabold text-navy ${detailed ? "text-3xl" : "text-lg"}`}>{formatBRL(price.current)}</span>
      {detailed && (
        <p className="mt-1 text-xs text-muted-foreground">
          Verificado em {d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} às {d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}. Preços e disponibilidade podem mudar.
        </p>
      )}
    </div>
  );
}
