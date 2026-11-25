import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { type ComparisonOffer, type ComparisonStore } from "@/lib/marketplace-comparison";
import {
  GARIMOU_SCORE_VERSION,
  garimouScore,
  SCORE_LABELS,
  SCORE_WEIGHTS,
} from "@/lib/garimou-score";
import type { PriceSample } from "@/lib/price-history";

export function GarimouScorePanel({
  offers,
  stores,
  now,
}: {
  offers: ComparisonOffer[];
  stores: ComparisonStore[];
  now: Date;
}) {
  const selected = offers.slice(0, 10);
  const key = selected.map((o) => [o.id, o.source, o.fetched_at]);
  const history = useQuery({
    queryKey: ["admin", "garimou-score", key],
    enabled: selected.length >= 2,
    staleTime: 60_000,
    queryFn: async () => {
      const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
      return Promise.all(
        selected.map(async (o) => {
          const r = await supabase
            .from("radar_snapshots")
            .select("day,price_cents,source,fetched_at")
            .eq("opportunity_id", o.id)
            .eq("source", o.source)
            .gte("fetched_at", since)
            .order("day", { ascending: false })
            .limit(31);
          if (r.error) throw r.error;
          return { id: o.id, samples: r.data ?? [] };
        }),
      );
    },
  });
  const byId = new Map<string, PriceSample[]>(
    (history.data ?? []).map((row) => [row.id, row.samples]),
  );

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <div>
        <h2 className="text-lg font-extrabold text-navy">Garimou Score</h2>
        <p className="text-xs text-muted-foreground">
          Versão {GARIMOU_SCORE_VERSION} · Prévia administrativa de qualidade da oferta, sem
          influência da comissão. Histórico de 30 dias e comparação confirmada.
        </p>
      </div>
      {selected.length < 2 ? (
        <p className="text-sm">Oferta em avaliação. Confirme ofertas de pelo menos duas lojas.</p>
      ) : history.isError ? (
        <p role="alert" className="text-sm text-destructive">
          Oferta em avaliação. Não foi possível consultar o histórico.
        </p>
      ) : history.isPending ? (
        <p role="status" className="text-sm">Consultando histórico para calcular a nota...</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {selected.map((o) => {
            const result = garimouScore(o, offers, stores, byId.get(o.id) ?? [], now);
            return (
              <article key={o.id} className="space-y-2 rounded-xl border border-border p-3">
                <p className="break-words text-sm font-bold">{o.name}</p>
                <p className="text-xs text-muted-foreground">{o.marketplace_slug}</p>
                <p className="text-xl font-extrabold text-navy">
                  {result.score === null ? "—" : result.score + "/100"}
                </p>
                <p className="text-sm font-bold">{result.label}</p>
                {result.score === null ? (
                  <p className="text-xs text-muted-foreground">{result.missing.join("; ")}.</p>
                ) : (
                  <>
                    <p className="text-xs text-muted-foreground">
                      {result.days} dias de histórico anterior. Redução frente à mediana:{" "}
                      {result.reduction}%.
                    </p>
                    <dl className="space-y-1 text-xs">
                      {(Object.keys(SCORE_WEIGHTS) as (keyof typeof SCORE_WEIGHTS)[]).map((k) => (
                        <div key={k} className="flex justify-between gap-2">
                          <dt>{SCORE_LABELS[k]}</dt>
                          <dd>
                            {Math.round(result.points[k] ?? 0)}/{SCORE_WEIGHTS[k]}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </>
                )}
              </article>
            );
          })}
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Avaliações são notas do produto retornadas pela fonte, não reputação verificada do
        vendedor. Frete, estoque, pagamento e quantidade de avaliações não confirmados. A nota
        não é garantia de compra. A divulgação pública depende de autorização e identidade
        persistente das ofertas.
      </p>
    </section>
  );
}
