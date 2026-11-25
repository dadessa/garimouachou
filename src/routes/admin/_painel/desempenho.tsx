import { keepPreviousData, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { adminCategories, adminMarketplaces } from "@/lib/admin/api";
import { friendlyError } from "@/lib/admin/errors";
import { clickRate, toCsv } from "@/lib/analytics/campaign";
import { AffiliateFinance } from "@/components/admin/AffiliateFinance";

export const Route = createFileRoute("/admin/_painel/desempenho")({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(adminCategories),
      context.queryClient.ensureQueryData(adminMarketplaces),
    ]),
  head: () => ({
    meta: [
      { title: "Desempenho — Painel Garimou Achou!" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: Desempenho,
});

interface Report {
  visits: number;
  page_views: number;
  product_views: number;
  offer_clicks: number;
  shares: number;
  instagram_clicks: number;
  daily: { day: string; visits: number; product_views: number; offer_clicks: number }[];
  top_products: { name: string; slug: string; clicks: number; views: number }[];
  categories: { name: string; clicks: number; views: number }[];
  marketplaces: { name: string; clicks: number; views: number; shares: number }[];
  sources: { source: string; visits: number }[];
  share_channels: { channel: string; shares: number }[];
  no_clicks: { name: string; slug: string }[];
}

const PERIODS = [
  { days: 7, label: "7 dias" },
  { days: 30, label: "30 dias" },
  { days: 90, label: "90 dias" },
] as const;

const CHANNEL: Record<string, string> = {
  whatsapp: "WhatsApp",
  nativo: "Menu do celular",
  copiar: "Copiar link",
};
const sel = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";

function Desempenho() {
  const [tab, setTab] = useState<"trafego" | "financeiro">("trafego");
  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2" aria-label="Visões de desempenho">
        <Button
          variant={tab === "trafego" ? "default" : "outline"}
          onClick={() => setTab("trafego")}
        >
          Tráfego e cliques
        </Button>
        <Button
          variant={tab === "financeiro" ? "default" : "outline"}
          onClick={() => setTab("financeiro")}
        >
          Central financeira
        </Button>
      </div>
      {tab === "trafego" ? <TrafficReport /> : <AffiliateFinance />}
    </>
  );
}

function TrafficReport() {
  const { data: cats } = useSuspenseQuery(adminCategories);
  const { data: mks } = useSuspenseQuery(adminMarketplaces);
  const [days, setDays] = useState(30);
  const [mk, setMk] = useState("");
  const [cat, setCat] = useState("");
  const q = useQuery({
    queryKey: ["admin", "desempenho", days, mk, cat],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const to = new Date();
      const from = new Date(to.getTime() - days * 86_400_000);
      const { data, error } = await supabase.rpc("admin_performance_report", {
        _from: from.toISOString(),
        _to: to.toISOString(),
        ...(mk ? { _marketplace: mk } : {}),
        ...(cat ? { _category: cat } : {}),
      });
      if (error) throw error;
      return data as unknown as Report;
    },
  });
  const r = q.data;
  const rate = r ? clickRate(r.offer_clicks, r.visits) : 0;

  const exportCsv = () => {
    if (!r) return;
    const rows: (string | number)[][] = [
      ["Indicador", "Valor"],
      ["Período (dias)", days],
      ["Visitas", r.visits],
      ["Páginas vistas", r.page_views],
      ["Visualizações de produtos", r.product_views],
      ["Cliques nas ofertas", r.offer_clicks],
      ["Cliques por visita (%)", rate],
      ["Compartilhamentos", r.shares],
      ["Cliques no Instagram", r.instagram_clicks],
      [],
      ["Dia", "Visitas", "Visualizações de produtos", "Cliques nas ofertas"],
      ...r.daily.map((d) => [d.day, d.visits, d.product_views, d.offer_clicks]),
      [],
      ["Produto", "Cliques", "Visualizações"],
      ...r.top_products.map((p) => [p.name, p.clicks, p.views]),
      [],
      ["Categoria", "Cliques", "Visualizações"],
      ...r.categories.map((c) => [c.name, c.clicks, c.views]),
      [],
      ["Marketplace", "Cliques", "Visualizações", "Compartilhamentos"],
      ...r.marketplaces.map((m) => [m.name, m.clicks, m.views, m.shares]),
      [],
      ["Origem", "Visitas"],
      ...r.sources.map((s) => [s.source, s.visits]),
      [],
      ["Produtos sem cliques"],
      ...r.no_clicks.map((p) => [p.name]),
    ];
    const url = URL.createObjectURL(new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `desempenho-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-navy">Desempenho</h1>
          <p className="text-sm text-muted-foreground">
            Cliques mostram interesse, não vendas. Consulte a aba Central financeira para transações
            disponíveis na Awin.
          </p>
        </div>
        <Button variant="outline" onClick={exportCsv} disabled={!r}>
          Exportar CSV
        </Button>
      </div>

      <div className="mb-4 grid gap-3 rounded-2xl border border-border bg-card p-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor="periodo">Período</Label>
          <select
            id="periodo"
            className={sel}
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          >
            {PERIODS.map((p) => (
              <option key={p.days} value={p.days}>
                Últimos {p.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="mk">Marketplace</Label>
          <select id="mk" className={sel} value={mk} onChange={(e) => setMk(e.target.value)}>
            <option value="">Todos</option>
            {mks.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="cat">Categoria</Label>
          <select id="cat" className={sel} value={cat} onChange={(e) => setCat(e.target.value)}>
            <option value="">Todas</option>
            {cats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        {(mk || cat) && (
          <p className="text-xs text-muted-foreground sm:col-span-3">
            Visitas, origem e Instagram contam o site todo; os filtros valem para produtos, cliques
            e compartilhamentos.
          </p>
        )}
      </div>

      {q.error && <p className="mb-4 text-sm text-destructive">{friendlyError(q.error)}</p>}
      {!r ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : (
        <div className={q.isFetching ? "opacity-70" : ""}>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            <Kpi label="Visitas" value={r.visits} />
            <Kpi label="Produtos vistos" value={r.product_views} />
            <Kpi label="Cliques nas ofertas" value={r.offer_clicks} />
            <Kpi label="Cliques por visita" value={`${rate.toLocaleString("pt-BR")}%`} />
            <Kpi label="Compartilhamentos" value={r.shares} />
            <Kpi label="Cliques no Instagram" value={r.instagram_clicks} />
          </div>

          <Card title="Evolução diária">
            {r.visits + r.product_views + r.offer_clicks === 0 ? (
              <Empty>Ainda não há registros neste período.</Empty>
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={r.daily.map((d) => ({
                      ...d,
                      dia: d.day.slice(8, 10) + "/" + d.day.slice(5, 7),
                    }))}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="dia" fontSize={11} />
                    <YAxis allowDecimals={false} fontSize={11} width={32} />
                    <Tooltip />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="visits"
                      name="Visitas"
                      stroke="var(--navy)"
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="product_views"
                      name="Produtos vistos"
                      stroke="var(--primary)"
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="offer_clicks"
                      name="Cliques"
                      stroke="var(--yellow)"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card title="Produtos mais clicados">
              <Table
                head={["Produto", "Cliques", "Vistos"]}
                rows={r.top_products.map((p) => [p.name, p.clicks, p.views])}
              />
            </Card>
            <Card title="Categorias">
              <Table
                head={["Categoria", "Cliques", "Vistos"]}
                rows={r.categories.map((c) => [c.name, c.clicks, c.views])}
              />
            </Card>
            <Card title="Por marketplace">
              <Table
                head={["Marketplace", "Cliques", "Vistos", "Compart."]}
                rows={r.marketplaces.map((m) => [m.name, m.clicks, m.views, m.shares])}
              />
            </Card>
            <Card title="Origem do tráfego">
              <Table
                head={["Origem", "Visitas"]}
                rows={r.sources.map((s) => [s.source, s.visits])}
              />
            </Card>
            <Card title="Compartilhamentos">
              <Table
                head={["Canal", "Vezes"]}
                rows={r.share_channels.map((s) => [CHANNEL[s.channel] ?? s.channel, s.shares])}
              />
            </Card>
            <Card title={`Produtos publicados sem cliques (${r.no_clicks.length})`}>
              {r.no_clicks.length === 0 ? (
                <Empty>Todos os produtos publicados tiveram cliques.</Empty>
              ) : (
                <ul className="max-h-60 space-y-1 overflow-auto text-sm">
                  {r.no_clicks.map((p) => (
                    <li key={p.slug}>{p.name}</li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      )}
    </>
  );
}

function Kpi({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      <p className="text-xs font-bold text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-extrabold text-navy">{value}</p>
    </div>
  );
}
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-4 rounded-2xl border border-border bg-card p-4">
      <h2 className="mb-3 text-sm font-extrabold text-navy">{title}</h2>
      {children}
    </section>
  );
}
function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-4 text-center text-sm text-muted-foreground">{children}</p>;
}
function Table({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  if (rows.length === 0) return <Empty>Sem registros neste período.</Empty>;
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs text-muted-foreground">
          {head.map((h, i) => (
            <th key={h} className={`pb-1 ${i ? "text-right" : ""}`}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-t border-border">
            {r.map((c, j) => (
              <td key={j} className={`py-1.5 ${j ? "text-right tabular-nums" : ""}`}>
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
