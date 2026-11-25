import { useState } from "react";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { adminMarketplaces, adminProducts, isPriceStale } from "@/lib/admin/api";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL } from "@/lib/price";
import {
  isObservationCurrent,
  summarizePriceHistory,
  supportsPriceHistory,
} from "@/lib/price-history";

const box = "rounded-2xl border border-border bg-card p-4";
const money = (v: number | null) => (v == null ? "—" : formatBRL(v));

export function PriceMonitor() {
  const { data: products } = useSuspenseQuery(adminProducts);
  const { data: marketplaces } = useSuspenseQuery(adminMarketplaces);
  const [query, setQuery] = useState("");
  const [onlyStale, setOnlyStale] = useState(false);
  const [selected, setSelected] = useState("");
  const [days, setDays] = useState(30);
  const mks = new Map(marketplaces.map((m) => [m.id, m]));
  const published = products.filter((p) => p.status === "published");
  const stale = published.filter((p) => isPriceStale(p, mks.get(p.marketplace_id ?? "")));
  const missing = published.filter((p) => p.current_price_cents == null);
  const list = products.filter(
    (p) =>
      (!query.trim() || p.name.toLowerCase().includes(query.trim().toLowerCase())) &&
      (!onlyStale || isPriceStale(p, mks.get(p.marketplace_id ?? ""))),
  );
  const product = products.find((p) => p.id === selected);
  const marketplace = product ? mks.get(product.marketplace_id ?? "") : undefined;
  const slug = marketplace?.slug ?? "";
  const externalId = product?.external_id ?? "";
  const history = useQuery({
    queryKey: ["admin", "price-history", selected, slug, externalId, days],
    enabled: !!product && !!externalId && !!slug && slug !== "amazon",
    queryFn: async () => {
      const opportunity = await supabase
        .from("radar_opportunities")
        .select("id,price_cents,source,fetched_at,valid_until")
        .eq("marketplace_slug", slug)
        .eq("external_id", externalId)
        .maybeSingle();
      if (opportunity.error) throw opportunity.error;
      if (!opportunity.data || !supportsPriceHistory(slug, opportunity.data.source)) return null;
      const since = new Date(Date.now() - days * 86_400_000).toISOString();
      const snapshots = await supabase
        .from("radar_snapshots")
        .select("day,price_cents,source,fetched_at")
        .eq("opportunity_id", opportunity.data.id)
        .eq("source", opportunity.data.source)
        .gte("fetched_at", since)
        .order("day");
      if (snapshots.error) throw snapshots.error;
      return {
        observation: opportunity.data,
        summary: summarizePriceHistory(snapshots.data ?? [], opportunity.data.source, days),
      };
    },
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold text-navy">Histórico e monitoramento de preços</h1>
        <p className="text-sm text-muted-foreground">
          Amostras reais do Radar, vinculadas pelo marketplace e identificador exato do produto.
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
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Produtos publicados" value={String(published.length)} />
        <Stat label="Com preço vencido ou inválido" value={String(stale.length)} />
        <Stat label="Sem preço cadastrado" value={String(missing.length)} />
      </div>
      <section className={box}>
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <Input
            aria-label="Buscar produto"
            placeholder="Buscar produto"
            className="max-w-xs"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={onlyStale}
              onChange={(e) => setOnlyStale(e.target.checked)}
            />
            Somente preços vencidos
          </label>
        </div>
        <div className="max-h-72 overflow-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground">
                <th className="p-2">Produto</th>
                <th className="p-2">Preço cadastrado</th>
                <th className="p-2">Verificação</th>
                <th className="p-2">Histórico</th>
              </tr>
            </thead>
            <tbody>
              {list.map((p) => (
                <tr key={p.id} className="border-t border-border">
                  <td className="p-2">
                    {p.name}
                    <span className="block text-xs text-muted-foreground">
                      {mks.get(p.marketplace_id ?? "")?.name ?? "Sem loja"}
                    </span>
                  </td>
                  <td className="p-2 whitespace-nowrap">{money(p.current_price_cents)}</td>
                  <td className="p-2">
                    {p.current_price_cents == null
                      ? "Sem preço"
                      : isPriceStale(p, mks.get(p.marketplace_id ?? ""))
                        ? "Revalidar"
                        : "Dentro do prazo"}
                  </td>
                  <td className="p-2">
                    <Button
                      size="sm"
                      variant={selected === p.id ? "default" : "outline"}
                      onClick={() => setSelected(p.id)}
                    >
                      Consultar
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!list.length && (
            <p className="p-3 text-sm text-muted-foreground">Nenhum produto encontrado.</p>
          )}
        </div>
      </section>
      {product && (
        <section className={box}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-extrabold text-navy">{product.name}</h2>
            <div className="flex gap-1">
              {[30, 90, 180].map((n) => (
                <Button
                  key={n}
                  size="sm"
                  variant={days === n ? "default" : "outline"}
                  onClick={() => setDays(n)}
                >
                  {n} dias
                </Button>
              ))}
            </div>
          </div>
          {slug === "amazon" ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Histórico Amazon não habilitado nesta versão.
            </p>
          ) : !externalId || !slug ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Sem identificador externo ou marketplace. Não é possível vincular com segurança.
            </p>
          ) : history.isPending ? (
            <p role="status" className="mt-2 text-sm">
              Consultando histórico...
            </p>
          ) : history.isError ? (
            <p role="alert" className="mt-2 text-sm text-destructive">
              Não foi possível consultar o histórico.
            </p>
          ) : !history.data ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Nenhuma correspondência elegível no Radar. Não serão estimados preços.
            </p>
          ) : (
            <>
              <p className="mt-2 text-xs text-muted-foreground">
                Fonte: {history.data.observation.source} · Uma amostra por dia de coleta. Não
                representa necessariamente o menor preço praticado no mercado.
              </p>
              <div className="my-3 grid gap-2 sm:grid-cols-3">
                <Stat label="Menor observado" value={money(history.data.summary.min)} />
                <Stat label="Maior observado" value={money(history.data.summary.max)} />
                <Stat label="Média das amostras" value={money(history.data.summary.average)} />
              </div>
              <p className="text-sm">
                {isObservationCurrent(
                  history.data.observation,
                  marketplace?.price_max_age_hours ?? 0,
                )
                  ? "Última oferta observada: " + money(history.data.observation.price_cents)
                  : "Última oferta sem preço válido para exibição."}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Consultada em{" "}
                {new Date(history.data.observation.fetched_at).toLocaleString("pt-BR")}. O catálogo
                só é atualizado após uma consulta individual confirmada.
              </p>
              <div className="mt-3 max-h-72 overflow-auto">
                {history.data.summary.points.length ? (
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="text-xs text-muted-foreground">
                        <th className="p-2">Data da amostra</th>
                        <th className="p-2">Preço observado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...history.data.summary.points].reverse().map((p) => (
                        <tr key={p.day} className="border-t border-border">
                          <td className="p-2">{p.day.split("-").reverse().join("/")}</td>
                          <td className="p-2">{formatBRL(p.cents)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Sem amostras válidas nesse período.
                  </p>
                )}
              </div>
            </>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              to="/admin/produtos/$id"
              params={{ id: product.id }}
              className="rounded-full border px-4 py-2 text-sm font-bold"
            >
              Revisar produto
            </Link>
            <Button
              variant="outline"
              onClick={() => void history.refetch()}
              disabled={!history.isEnabled || history.isFetching}
            >
              Reconsultar registros
            </Button>
          </div>
        </section>
      )}
      <p className="text-xs text-muted-foreground">
        O Radar consulta até quatro produtos publicados por execução, em rodízio. Somente preços de
        API confirmados pelo identificador exato são atualizados. Preços de API expiram em até seis
        horas; a ausência de resultados não comprova indisponibilidade. A cobertura depende das
        fontes conectadas e da frequência do agendamento.
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className={box}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-extrabold text-navy">{value}</p>
    </div>
  );
}
