import { useEffect, useState } from "react";
import { displayablePrice, effectivePriceHours, formatBRL } from "@/lib/price";
import type { Product } from "@/lib/catalog/types";

export function PriceBlock({ product, detailed }: { product: Product; detailed?: boolean }) {
  const price = displayablePrice(product, product.marketplace);
  const [, refresh] = useState(0);
  const checkedAt = price?.checkedAt.getTime();
  const validHours = effectivePriceHours(product.marketplace.priceMaxAgeHours, product.priceSource);

  useEffect(() => {
    if (checkedAt === undefined) return;
    const remainingMs = checkedAt + validHours * 3_600_000 - Date.now();
    const timer = window.setTimeout(
      () => refresh((value) => value + 1),
      Math.max(0, Math.ceil(remainingMs) + 1),
    );
    return () => window.clearTimeout(timer);
  }, [checkedAt, validHours]);

  if (!price) {
    return <p className="text-xs font-semibold text-muted-foreground">Confira o preço na loja</p>;
  }
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
        <time dateTime={d.toISOString()}>
          Conferido em{" "}
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
        </time>
        {detailed && ". O preço pode mudar na loja."}
      </p>
    </div>
  );
}
