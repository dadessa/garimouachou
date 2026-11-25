import { useEffect, useState } from "react";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { adminMarketplaces } from "@/lib/admin/api";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL } from "@/lib/price";
import { GarimouScorePanel } from "@/components/admin/GarimouScorePanel";
import {
  compareOffers,
  declaredGtins,
  identityMatches,
  identityReady,
  normalizeGtin,
  offerEligibility,
  offerFingerprint,
  type ComparisonIdentity,
  type ConfirmedIdentity,
} from "@/lib/marketplace-comparison";

const box = "rounded-2xl border border-border bg-card p-4";
const initial = { brand: "", model: "", variant: "", gtin: "" };

export function MarketplaceCompare() {
  const { data: stores } = useSuspenseQuery(adminMarketplaces);
  const [reference, setReference] = useState<ComparisonIdentity>(initial);
  const [confirmed, setConfirmed] = useState<Record<string, ConfirmedIdentity>>({});
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const [term, setTerm] = useState("");
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const q = useQuery({
    queryKey: ["admin", "marketplace-comparison", term],
    enabled: term.length >= 2,
    refetchInterval: 60_000,
    queryFn: async () => {
      const r = await supabase
        .from("radar_opportunities")
        .select(
          "id,marketplace_slug,external_id,name,affiliate_url,price_cents,fetched_at,valid_until,source,signals,rating",
        )
        .ilike("name", "%" + term.replace(/[%_\\]/g, "") + "%")
        .order("fetched_at", { ascending: false })
        .limit(100);
      if (r.error) throw r.error;
      return r.data ?? [];
    },
  });

  const candidates = q.isError ? [] : (q.data ?? []);
  const comparison = compareOffers(candidates, stores, reference, confirmed, now);
  const ready = identityReady(reference);

  function change(key: keyof ComparisonIdentity, value: string) {
    setReference((old) => ({ ...old, [key]: value }));
    setConfirmed({});
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold text-navy">Comparador de marketplaces</h1>
        <p className="text-sm text-muted-foreground">
          Compare ofertas reais do Radar após confirmar a mesma marca, modelo e variação.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link
          to="/admin/produtos"
          search={{}}
          className="rounded-full border px-4 py-2 text-sm font-bold"
        >
          Voltar aos produtos
        </Link>
        <Link to="/admin/radar" className="rounded-full border px-4 py-2 text-sm font-bold">
          Atualizar Radar
        </Link>
      </div>
      <section className={box}>
        <h2 className="mb-3 font-extrabold text-navy">1. Identificar produto de referência</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              ["brand", "Marca"],
              ["model", "Modelo exato"],
              ["variant", "Variação (cor, tamanho, capacidade, voltagem, kit)"],
              ["gtin", "EAN / GTIN (se conhecido)"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="grid gap-1 text-sm font-semibold">
              {label}
              <Input
                value={reference[key]}
                maxLength={key === "gtin" ? 24 : 120}
                onChange={(e) => change(key, e.target.value)}
              />
            </label>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Confira as especificações originais de cada anúncio. Quando não houver variação, informe
          isso explicitamente. Um EAN válido não comprova por si só a identidade do anúncio.
        </p>
        {reference.gtin.trim() && !normalizeGtin(reference.gtin) && (
          <p role="alert" className="mt-2 text-sm text-destructive">
            EAN/GTIN inválido. Verifique o código e o dígito verificador.
          </p>
        )}
      </section>
      <section className={box}>
        <h2 className="mb-3 font-extrabold text-navy">
          2. Buscar e confirmar ofertas equivalentes
        </h2>
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const clean = query.replace(/[%_\\]/g, "").trim();
            if (clean.length < 2) return;
            setConfirmed({});
            setCodes({});
            setNow(new Date());
            if (clean === term) void q.refetch();
            else setTerm(clean);
          }}
        >
          <Input
            aria-label="Pesquisar ofertas do Radar"
            placeholder="Modelo ou termo no nome do produto"
            className="max-w-sm"
            maxLength={100}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <Button disabled={query.trim().length < 2 || q.isFetching}>Buscar no Radar</Button>
        </form>
        <p className="mt-2 text-xs text-muted-foreground">
          Até 100 registros recentes por busca. Atualize o Radar para obter novas observações. A
          disponibilidade não é informada pelas fontes atuais.
        </p>
        {q.isError && <p className="mt-2 text-sm text-destructive">Falha ao consultar o Radar.</p>}
        {term && q.isFetching && <p className="mt-2 text-sm">Consultando registros...</p>}
        {term && !q.isFetching && !q.isError && !candidates.length && (
          <p className="mt-2 text-sm text-muted-foreground">Nenhuma oferta encontrada.</p>
        )}
        <div className="mt-3 space-y-2">
          {candidates.map((o) => {
            const store = stores.find((s) => s.slug === o.marketplace_slug);
            const reason = offerEligibility(o, store, now);
            const declared = declaredGtins(o.name);
            const entered = codes[o.id] ?? declared[0] ?? "";
            const evidence = { fingerprint: offerFingerprint(o), gtin: entered };
            const eligible = ready && !reason && identityMatches(reference, o, evidence);
            const checked = !reason && identityMatches(reference, o, confirmed[o.id]);
            return (
              <div key={o.id} className="space-y-2 rounded-xl border border-border p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-sm font-bold">{o.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {store?.name ?? o.marketplace_slug} · {o.source}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Consulta: {new Date(o.fetched_at).toLocaleString("pt-BR")}
                    </p>
                  </div>
                  <p className="font-extrabold text-navy">
                    {!reason && o.price_cents !== null ? formatBRL(o.price_cents) : "—"}
                  </p>
                </div>
                {reason ? (
                  <p className="text-xs text-muted-foreground">{reason}</p>
                ) : (
                  <>
                    <a
                      href={o.affiliate_url!}
                      target="_blank"
                      rel="noopener noreferrer sponsored"
                      className="text-sm font-bold underline"
                    >
                      Conferir anúncio na loja
                    </a>
                    <label className="grid max-w-xs gap-1 text-xs">
                      EAN/GTIN conferido no anúncio (se disponível)
                      <Input
                        value={entered}
                        maxLength={24}
                        onChange={(e) => {
                          setCodes((old) => ({ ...old, [o.id]: e.target.value }));
                          setConfirmed((old) => {
                            const next = { ...old };
                            delete next[o.id];
                            return next;
                          });
                        }}
                      />
                    </label>
                    <label className="flex items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="mt-1 size-4"
                        checked={checked}
                        disabled={!eligible}
                        onChange={(e) => {
                          setConfirmed((old) => {
                            const next = { ...old };
                            if (e.target.checked) next[o.id] = evidence;
                            else delete next[o.id];
                            return next;
                          });
                        }}
                      />
                      Conferi marca, modelo, condição, quantidade e todas as variações deste
                      anúncio.
                    </label>
                    {ready && !eligible && (
                      <p className="text-xs text-muted-foreground">
                        Código ausente, inválido ou incompatível com a referência.
                      </p>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </section>
      <section className={box}>
        <h2 className="font-extrabold text-navy">3. Comparação de preços confirmados</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Menor preço por loja entre as ofertas selecionadas. Frete, condições de pagamento e
          estoque não confirmados. Não representa o menor preço de todo o mercado.
        </p>
        {comparison.difference !== null && (
          <p className="my-3 font-bold text-navy">
            Diferença entre os extremos: {formatBRL(comparison.difference)}
          </p>
        )}
        {comparison.offers.length < 2 && (
          <p className="mt-3 text-sm text-muted-foreground">
            Confirme ofertas válidas de pelo menos duas lojas para comparar.
          </p>
        )}
        <div className="mt-3 space-y-2">
          {comparison.offers.map((o) => (
            <div
              key={o.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold">
                  {stores.find((s) => s.slug === o.marketplace_slug)?.name ?? o.marketplace_slug}
                </p>
                <p className="break-words text-xs text-muted-foreground">{o.name}</p>
                {comparison.offers.length > 1 && o.cents === comparison.offers[0]?.cents && (
                  <p className="text-xs font-bold">Menor preço entre as ofertas confirmadas</p>
                )}
              </div>
              <p className="font-extrabold text-navy">{formatBRL(o.cents)}</p>
              <a
                href={o.affiliate_url!}
                target="_blank"
                rel="noopener noreferrer sponsored"
                className="rounded-full border px-3 py-2 text-sm font-bold"
              >
                Ver oferta
              </a>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Comparação administrativa temporária. Os links são os registrados pelas integrações;
          comissão efetiva não confirmada. Nenhuma publicação ou alteração de produto é realizada.
        </p>
      </section>
      <GarimouScorePanel offers={comparison.offers} stores={stores} now={now} />
    </div>
  );
}
