import { useMutation, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { refreshRadar } from "@/lib/radar/radar.functions";
import { createFileRoute, Link } from "@tanstack/react-router";
import { adminMarketplaces, adminProducts, isPriceStale } from "@/lib/admin/api";

export const Route = createFileRoute("/admin/_painel/")({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(adminProducts),
      context.queryClient.ensureQueryData(adminMarketplaces),
    ]),
  head: () => ({
    meta: [
      { title: "Visão geral — Painel Garimou Achou!" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: Overview,
});

const demandSections = [
  { key: "growth_pct", title: "Procura em alta" },
  { key: "search_volume", title: "Mais buscados" },
  { key: "sales", title: "Mais vendidos" },
] as const;

const dateFormat = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Fortaleza" });
const observationTime = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Fortaleza",
  hour: "2-digit",
  minute: "2-digit",
});
const numberFormat = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

const sourceNames: Record<string, string> = {
  mercadolivre_api: "API Mercado Livre",
  shopee_api: "API Shopee",
  mcp_afiliado: "MCP do Afiliado",
  manual: "Registro manual",
  relatorio: "Relatório",
  mensagem: "Mensagem",
  pagina_publica: "Página pública",
};

async function loadDailyDemand(day: string) {
  const now = new Date().toISOString();
  return Promise.all(
    demandSections.map(async ({ key, title }) => {
      const { data, error } = await supabase
        .from("radar_opportunities")
        .select("id,name,marketplace_slug,source,fetched_at,growth_pct,search_volume,sales")
        .gte("fetched_at", `${day}T00:00:00-03:00`)
        .lte("fetched_at", now)
        .or(`valid_until.is.null,valid_until.gt.${now}`)
        .gt(key, 0)
        .order(key, { ascending: false })
        .order("fetched_at", { ascending: false })
        .order("id")
        .limit(5);
      if (error) throw error;
      return { key, title, items: data ?? [] };
    }),
  );
}

function DailyDemand({ marketplaces }: { marketplaces: Map<string, string> }) {
  const day = dateFormat.format(new Date());
  const refresh = useServerFn(refreshRadar);
  const demand = useQuery({
    queryKey: ["admin", "daily-demand", day],
    queryFn: () => loadDailyDemand(day),
    refetchInterval: 60_000,
  });
  const update = useMutation({
    mutationFn: () => refresh(),
    onSuccess: () => demand.refetch(),
  });

  const hasItems = demand.data?.some(({ items }) => items.length > 0);

  return (
    <section
      aria-labelledby="daily-demand-title"
      className="mb-5 rounded-2xl border border-border bg-card p-4 shadow-card sm:p-5"
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="daily-demand-title" className="text-xl font-extrabold text-navy">
            Em alta hoje
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Sinais de demanda coletados hoje pelas fontes do Radar.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link to="/admin/radar" className="text-sm font-bold text-navy underline">
            Abrir Radar
          </Link>
          <Button variant="outline" onClick={() => update.mutate()} disabled={update.isPending}>
            {update.isPending ? "Atualizando…" : "Atualizar agora"}
          </Button>
        </div>
      </header>
      {update.isError && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          Não foi possível atualizar o Radar. Confira as integrações e tente novamente.
        </p>
      )}
      {!!update.data?.length && (
        <ul aria-live="polite" className="mt-3 space-y-1 text-xs text-muted-foreground">
          {update.data.map(({ source, status, count }) => (
            <li key={source}>
              {source} · {status} · {count} itens
            </li>
          ))}
        </ul>
      )}
      {demand.isPending && (
        <p role="status" className="mt-4 text-sm text-muted-foreground">
          Carregando os itens de hoje…
        </p>
      )}
      {demand.isError && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          Não foi possível carregar os itens de hoje.
        </p>
      )}
      {demand.isSuccess && !hasItems && (
        <p className="mt-4 text-sm text-muted-foreground">
          O Radar ainda não registrou sinais de demanda hoje. Use Atualizar agora para consultar as
          fontes conectadas.
        </p>
      )}
      {hasItems && (
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          {demand.data?.map(({ key, title, items }) => (
            <section key={key} className="min-w-0 rounded-xl border border-border p-3">
              <h3 className="font-extrabold text-navy">{title}</h3>
              {items.length === 0 && (
                <p className="mt-2 text-xs text-muted-foreground">Sem dados de hoje.</p>
              )}
              <ul className="mt-1 divide-y divide-border">
                {items.map((item) => (
                  <li key={item.id} className="py-2">
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 break-words text-sm font-semibold">{item.name}</p>
                      <strong className="shrink-0 text-sm text-navy">
                        {numberFormat.format(item[key] ?? 0)}
                        {key === "growth_pct" && "%"}
                      </strong>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {marketplaces.get(item.marketplace_slug) ?? item.marketplace_slug} ·{" "}
                      {sourceNames[item.source] ?? item.source} ·{" "}
                      <time dateTime={item.fetched_at}>
                        {observationTime.format(new Date(item.fetched_at))}
                      </time>
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}

function Overview() {
  const { data: products } = useSuspenseQuery(adminProducts);
  const { data: mks } = useSuspenseQuery(adminMarketplaces);
  const mk = new Map(mks.map((m) => [m.id, m]));
  const cards = [
    { label: "Publicados", n: products.filter((p) => p.status === "published").length },
    { label: "Rascunhos", n: products.filter((p) => p.status === "draft").length },
    { label: "Inativos", n: products.filter((p) => p.status === "inactive").length },
    {
      label: "Com preço vencido",
      n: products.filter((p) =>
        isPriceStale(p, p.marketplace_id ? mk.get(p.marketplace_id) : undefined),
      ).length,
      warn: true,
    },
  ];
  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold text-navy">Visão geral</h1>
        <Link
          to="/admin/produtos/$id"
          params={{ id: "novo" }}
          className="rounded-full bg-primary px-5 py-2.5 text-sm font-extrabold text-primary-foreground"
        >
          Novo produto
        </Link>
      </div>
      <DailyDemand marketplaces={new Map(mks.map((m) => [m.slug, m.name]))} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {cards.map((c) => (
          <div
            key={c.label}
            className={`rounded-2xl border bg-card p-4 shadow-card ${c.warn && c.n > 0 ? "border-primary" : "border-border"}`}
          >
            <p className="text-3xl font-extrabold text-navy">{c.n}</p>
            <p className="text-sm font-semibold text-muted-foreground">{c.label}</p>
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        Preço vencido: o preço não aparece no site até ser confirmado de novo.
      </p>
    </>
  );
}
