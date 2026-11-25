import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatBRL } from "@/lib/price";
import { activeCoupons, type Coupon } from "@/lib/coupons/rules";
import { publicCouponsFn } from "@/lib/coupons/coupons.functions";

function benefit(c: Coupon) {
  if (c.kind === "percent") return c.amount + "% de desconto";
  if (c.kind === "fixed" && c.amount !== null) return formatBRL(c.amount) + " de desconto";
  if (c.kind === "shipping") return "Frete grátis";
  return "Confira as condições";
}

export function CouponShelf({
  productSlug,
  marketplace,
}: {
  productSlug?: string;
  marketplace?: string;
}) {
  const load = useServerFn(publicCouponsFn);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 10_000);
    return () => clearInterval(timer);
  }, []);
  const q = useQuery({
    queryKey: ["public", "coupons"],
    queryFn: () => load(),
    refetchInterval: 60_000,
  });
  const coupons = activeCoupons(q.isError ? [] : (q.data ?? []), now).filter((c) =>
    productSlug ? c.productSlug === productSlug && c.marketplace === marketplace : !c.productSlug,
  );
  if (!coupons.length) return null;
  return (
    <section className="mx-auto max-w-6xl px-4 py-6" aria-label="Cupons válidos">
      <h2 className="mb-3 text-xl font-extrabold text-navy">Cupons válidos</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {coupons.map((c) => (
          <article key={c.id} className="space-y-2 rounded-2xl border border-border bg-card p-4">
            <p className="text-xs font-bold text-muted-foreground">{c.merchant}</p>
            <h3 className="font-extrabold text-navy">{c.title}</h3>
            <p className="text-sm font-bold">{benefit(c)}</p>
            <p className="break-all rounded-lg border border-dashed p-2 font-mono">{c.code}</p>
            <p className="text-xs">
              Válido até{" "}
              {new Date(c.endsAt).toLocaleString("pt-BR", {
                timeZone: "America/Sao_Paulo",
              })}{" "}
              (Brasília).
            </p>
            {c.minimumCents !== null && (
              <p className="text-xs">Compra mínima: {formatBRL(c.minimumCents)}</p>
            )}
            <details className="text-xs">
              <summary className="cursor-pointer font-bold">Regras de utilização</summary>
              <p className="mt-2 whitespace-pre-wrap break-words">{c.terms}</p>
            </details>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={async () => {
                  if (!activeCoupons([c]).length) {
                    setNow(new Date());
                    return;
                  }
                  try {
                    await navigator.clipboard.writeText(c.code);
                    toast.success("Cupom copiado.");
                  } catch {
                    toast.error("Não foi possível copiar. Selecione o código manualmente.");
                  }
                }}
              >
                Copiar cupom
              </Button>
              <a
                href={c.affiliateUrl}
                target="_blank"
                rel="noopener noreferrer sponsored"
                className="inline-flex min-h-10 items-center rounded-full bg-primary px-4 text-sm font-bold text-primary-foreground"
                onClick={(e) => {
                  if (!activeCoupons([c]).length) {
                    e.preventDefault();
                    setNow(new Date());
                  }
                }}
              >
                Ir à loja
              </a>
            </div>
          </article>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Verifique as condições no checkout. Podemos receber comissão pelos links de afiliada.
      </p>
    </section>
  );
}
