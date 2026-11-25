import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { dailyGoogleTrends, refreshRadar } from "@/lib/radar/radar.functions";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  adminCategories,
  adminMarketplaces,
  adminProducts,
  isPriceStale,
  type MarketplaceRow,
  type ProductRow,
} from "@/lib/admin/api";
import { importOne } from "@/lib/import/importer";
import { emptyDraft } from "@/lib/import/rules";
import { isAllowedAffiliateUrl } from "@/lib/marketplaces/types";
import { formatBRL } from "@/lib/price";
import { classifyCategory } from "@/lib/radar/engine";

export const Route = createFileRoute("/admin/_painel/")({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(adminProducts),
      context.queryClient.ensureQueryData(adminMarketplaces),
      context.queryClient.ensureQueryData(adminCategories),
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
        .select(
          "id,name,marketplace_slug,source,fetched_at,growth_pct,search_volume,sales,external_id,affiliate_url,category",
        )
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

type DemandGroups = Awaited<ReturnType<typeof loadDailyDemand>>;

function ReviewQueue({
  groups,
  products,
  marketplaces,
}: {
  groups: DemandGroups;
  products: ProductRow[];
  marketplaces: MarketplaceRow[];
}) {
  const { data: categories } = useSuspenseQuery(adminCategories);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const pending = products.filter((p) => p.status === "draft" && p.review_status === "pending");
  const bySlug = new Map(marketplaces.map((m) => [m.slug, m]));
  const byId = new Map(marketplaces.map((m) => [m.id, m]));
  const candidates = new Map<
    string,
    { item: DemandGroups[number]["items"][number]; reasons: string[] }
  >();
  for (const { key, items } of groups) {
    for (const item of items) {
      const amount = numberFormat.format(item[key] ?? 0);
      const metric = {
        growth_pct: `+${amount}% de crescimento na procura`,
        search_volume: `${amount} buscas informadas`,
        sales: `${amount} vendas informadas`,
      }[key];
      const existing = candidates.get(item.id);
      if (existing) existing.reasons.push(metric);
      else candidates.set(item.id, { item, reasons: [metric] });
    }
  }
  const items = [...candidates.values()].filter(({ item }) => {
    const mk = bySlug.get(item.marketplace_slug);
    return !products.some(
      (p) =>
        (p.marketplace_id === mk?.id && p.external_id === item.external_id) ||
        p.affiliate_url === item.affiliate_url,
    );
  });
  const prepare = useMutation({
    mutationFn: async (item: DemandGroups[number]["items"][number]) => {
      const mk = bySlug.get(item.marketplace_slug);
      if (
        !mk ||
        !item.affiliate_url ||
        !isAllowedAffiliateUrl(item.affiliate_url, mk.allowed_domains)
      )
        throw new Error("Este item precisa de um link de afiliada autorizado.");
      const draft = emptyDraft(item.affiliate_url);
      draft.name = item.name;
      draft.externalId = item.external_id;
      draft.categoryId = classifyCategory(item.name, item.category, categories)?.id ?? null;
      const result = await importOne(
        draft,
        { publish: false, reviewPending: true, defaultCategoryId: null, useAi: false },
        {
          mks: [mk],
          cats: categories,
          genCopy: async () => ({ error: null, description: "", tags: [] }),
        },
      );
      if (!result.productId) throw new Error(result.message);
      return result.productId;
    },
    onSuccess: async (id) => {
      await qc.invalidateQueries({ queryKey: adminProducts.queryKey });
      await navigate({ to: "/admin/produtos/$id", params: { id } });
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <section
      aria-labelledby="daily-review-title"
      className="mt-5 rounded-xl border border-border p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="daily-review-title" className="font-extrabold text-navy">
          Fila de revisão
        </h3>
        <Link to="/admin/desempenho" className="text-sm font-bold text-navy underline">
          Acompanhar resultados
        </Link>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Abra a oferta, confira o preço e o destino do link de afiliada e decida no cadastro se vale
        publicar.
      </p>
      {!pending.length && !items.length && (
        <p className="mt-3 text-sm text-muted-foreground">
          A fila está vazia. Atualize o Radar ou cadastre um produto com seu link de afiliada.
        </p>
      )}
      <ul className="mt-2 divide-y divide-border">
        {pending.slice(0, 5).map((product) => {
          const mk = product.marketplace_id ? byId.get(product.marketplace_id) : undefined;
          const validLink = mk && isAllowedAffiliateUrl(product.affiliate_url, mk.allowed_domains);
          const match = [...candidates.values()].find(
            ({ item }) =>
              (item.marketplace_slug === mk?.slug && item.external_id === product.external_id) ||
              item.affiliate_url === product.affiliate_url,
          );
          const price = product.current_price_cents;
          return (
            <li key={product.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <div className="min-w-0">
                <p className="break-words text-sm font-bold">{product.name}</p>
                <p className="text-xs text-muted-foreground">
                  {match?.reasons.join(" · ") ?? "Rascunho aguardando revisão"}
                  {" · "}
                  {price != null && !isPriceStale(product, mk)
                    ? `Preço registrado: ${formatBRL(price)}`
                    : "Conferir preço na loja"}
                </p>
              </div>
              <div className="flex flex-wrap gap-3 text-sm font-bold text-navy">
                {validLink && (
                  <a
                    href={product.affiliate_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                  >
                    Abrir oferta
                  </a>
                )}
                <Link to="/admin/produtos/$id" params={{ id: product.id }} className="underline">
                  Revisar rascunho
                </Link>
              </div>
            </li>
          );
        })}
        {items.slice(0, 5).map(({ item, reasons }) => {
          const mk = bySlug.get(item.marketplace_slug);
          const url =
            mk &&
            item.affiliate_url &&
            isAllowedAffiliateUrl(item.affiliate_url, mk.allowed_domains)
              ? item.affiliate_url
              : null;
          return (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <div className="min-w-0">
                <p className="break-words text-sm font-bold">{item.name}</p>
                <p className="text-xs text-muted-foreground">
                  {reasons.join(" · ")} · {sourceNames[item.source] ?? item.source}
                </p>
                {!url && (
                  <p className="text-xs text-muted-foreground">Link de afiliada pendente.</p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-3 text-sm font-bold text-navy">
                {url ? (
                  <>
                    <a href={url} target="_blank" rel="noopener noreferrer" className="underline">
                      Abrir oferta
                    </a>
                    <Button
                      variant="outline"
                      disabled={prepare.isPending}
                      onClick={() => prepare.mutate(item)}
                    >
                      {prepare.isPending && prepare.variables?.id === item.id
                        ? "Preparando…"
                        : "Preparar revisão"}
                    </Button>
                  </>
                ) : (
                  <Link to="/admin/produtos/$id" params={{ id: "novo" }} className="underline">
                    Cadastrar com meu link
                  </Link>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function GoogleTrendsPanel() {
  const fetchTrends = useServerFn(dailyGoogleTrends);
  const trends = useQuery({
    queryKey: ["admin", "google-trends-br"],
    queryFn: () => fetchTrends(),
    staleTime: 10 * 60_000,
  });
  const result = trends.data;

  return (
    <section
      aria-labelledby="google-trends-title"
      className="mt-5 rounded-xl border border-border p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="google-trends-title" className="font-extrabold text-navy">
          Pesquisas em alta no Google Brasil
        </h3>
        <Link to="/admin/garimpo" className="text-sm font-bold text-navy underline">
          Abrir Garimpo
        </Link>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Volume estimado de buscas no Google. As vendas são medidas pelas fontes do Radar.
      </p>
      {trends.isPending && <p role="status">Consultando o Google Trends…</p>}
      {(trends.isError || result?.ok === false) && (
        <p role="status" className="mt-2 text-sm text-muted-foreground">
          Google Trends indisponível no momento.
        </p>
      )}
      {result?.ok && (
        <>
          <p className="mt-2 text-xs text-muted-foreground">
            Consultado em{" "}
            <time dateTime={result.checkedAt}>
              {dateFormat.format(new Date(result.checkedAt))} às{" "}
              {observationTime.format(new Date(result.checkedAt))}
            </time>
          </p>
          <p className="mt-2 text-sm">
            <strong>Termos para garimpar</strong>{" "}
            {result.keywords.length
              ? result.keywords.join(", ")
              : "Nenhuma tendência recente correspondeu às categorias de produto reconhecidas."}
          </p>
          <ul className="mt-2 divide-y divide-border text-sm">
            {result.trends.map((trend) => (
              <li key={trend.title} className="flex justify-between gap-3 py-2">
                <span className="min-w-0 break-words">{trend.title}</span>
                {trend.traffic && <span className="shrink-0">{trend.traffic} buscas</span>}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function DailyDemand({
  marketplaces,
  products,
}: {
  marketplaces: MarketplaceRow[];
  products: ProductRow[];
}) {
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
  const marketplaceNames = new Map(marketplaces.map((m) => [m.slug, m.name]));

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
      <GoogleTrendsPanel />
      <ReviewQueue groups={demand.data ?? []} products={products} marketplaces={marketplaces} />
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
                      {marketplaceNames.get(item.marketplace_slug) ?? item.marketplace_slug} ·{" "}
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
      <DailyDemand marketplaces={mks} products={products} />
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
