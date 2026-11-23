import { displayablePrice, formatBRL } from "@/lib/price";
import type { Product } from "@/lib/catalog/types";

export function PriceBlock({ product, detailed }: { product: Product; detailed?: boolean }) {
  const price = displayablePrice(product, product.marketplace);
  if (!price) return null;
  const d = price.checkedAt;
  const off = price.previous ? Math.round((1 - price.current / price.previous) * 100) : 0;
  return (
    <div>
      {price.previous && (
        <span className="mr-2 text-sm text-muted-foreground line-through">
          {formatBRL(price.previous)}
        </span>
      )}
      <span className={`font-extrabold text-navy ${detailed ? "text-3xl" : "text-lg"}`}>
        {formatBRL(price.current)}
      </span>
      {off > 0 && (
        <span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-xs font-extrabold text-primary-foreground">
          {off}% OFF
        </span>
      )}
      <p className="mt-1 text-[11px] text-muted-foreground">
        Verificado em{" "}
        {d.toLocaleDateString("pt-BR", {
          day: "2-digit",
          month: "2-digit",
          timeZone: "America/Sao_Paulo",
        })}{" "}
        às{" "}
        {d.toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "America/Sao_Paulo",
        })}
        . Preços podem mudar.
      </p>
    </div>
  );
}
