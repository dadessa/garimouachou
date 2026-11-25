import { queryOptions, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { adminCategories, adminMarketplaces } from "@/lib/admin/api";
import { generateCopy } from "@/lib/admin/ai.functions";
import { importOne } from "@/lib/import/importer";
import { emptyDraft, parseCsv } from "@/lib/import/rules";
import { askRadar, refreshRadar } from "@/lib/radar/radar.functions";
import {
  BR_CALENDAR,
  DEFAULT_WEIGHTS,
  INDICATORS,
  INDICATOR_LABEL,
  justify,
  revenueScenarios,
  scoreAll,
  type Weights,
} from "@/lib/radar/score";
import {
  VIEWS,
  applyView,
  buildRadar,
  classifyCategory,
  financialPotential,
  type Opp,
  type View,
} from "@/lib/radar/engine";

const radarData = queryOptions({
  queryKey: ["admin", "radar"],
  queryFn: async () => {
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const [ops, st, prods, ev, snaps, runs] = await Promise.all([
      supabase.from("radar_opportunities").select("*").order("fetched_at", { ascending: false }),
      supabase
        .from("radar_settings")
        .select("weights,daily_enabled,max_items")
        .eq("id", 1)
        .maybeSingle(),
      supabase.from("products").select("id,external_id,affiliate_url"),
      supabase
        .from("analytics_events")
        .select("product_id")
        .eq("event_type", "offer_click")
        .gte("created_at", since)
        .limit(10000),
      supabase
        .from("radar_snapshots")
        .select("opportunity_id,day,sales,search_volume")
        .gte("day", since.slice(0, 10)),
      supabase.from("radar_runs").select("*").order("started_at", { ascending: false }).limit(10),
    ]);
    if (ops.error) throw ops.error;
    return {
      ops: ops.data,
      weights: { ...DEFAULT_WEIGHTS, ...((st.data?.weights as Partial<Weights>) ?? {}) },
      prods: prods.data ?? [],
      clicks: (ev.data ?? []).map((e) => e.product_id),
      snaps: snaps.data ?? [],
      runs: runs.data ?? [],
      daily: st.data?.daily_enabled ?? false,
      maxItems: st.data?.max_items ?? 100,
    };
  },
});

export const Route = createFileRoute("/admin/_painel/radar")({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(radarData),
      context.queryClient.ensureQueryData(adminCategories),
      context.queryClient.ensureQueryData(adminMarketplaces),
    ]),
  head: () => ({
    meta: [
      { title: "Radar de Oportunidades — Painel Garimou Achou!" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: Radar,
});

const SOURCE: Record<string, string> = {
  manual: "Manual",
  relatorio: "Relatório",
  shopee_api: "API Shopee",
  mercadolivre_api: "API Mercado Livre",
  mensagem: "Mensagem colada (não confirmado)",
  pagina_publica: "Página pública + mensagem (não confirmado)",
};
const brl = (c: number | null) =>
  c == null ? "—" : (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));
const sel = "h-10 rounded-full border-2 border-input bg-background px-3 text-sm font-semibold";

function Radar() {
  const { data } = useSuspenseQuery(radarData);
  const { data: cats } = useSuspenseQuery(adminCategories);
  const { data: mks } = useSuspenseQuery(adminMarketplaces);
  const qc = useQueryClient();
  const refresh = useServerFn(refreshRadar);
  const genCopy = useServerFn(generateCopy);
  const [view, setView] = useState<View>("melhores");
  const [f, setF] = useState({
    mk: "",
    cat: "",
    maxPrice: "",
    minComm: "",
    minSales: "",
    minScore: "",
  });
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<{ source: string; status: string; count: number }[] | null>(
    null,
  );

  const rows = useMemo(() => {
    const clicks = new Map<string, number>();
    for (const id of data.clicks) if (id) clicks.set(id, (clicks.get(id) ?? 0) + 1);
    return buildRadar(data.ops as Opp[], data.weights, {
      catalog: data.prods,
      clicks,
      snaps: data.snaps,
    }).map((r) => ({ ...r, inCatalog: !!r.catalogId }));
  }, [data]);

  const shown = useMemo(() => {
    let r = rows.filter(
      ({ o, s }) =>
        (!f.mk || o.marketplace_slug === f.mk) &&
        (!f.cat || (o.category ?? "").toLowerCase().includes(f.cat.toLowerCase())) &&
        (!f.maxPrice || (o.price_cents != null && o.price_cents <= Number(f.maxPrice) * 100)) &&
        (!f.minComm || (o.commission_rate ?? -1) >= Number(f.minComm)) &&
        (!f.minSales || (o.sales ?? -1) >= Number(f.minSales)) &&
        (!f.minScore || s.score >= Number(f.minScore)),
    );
    r = applyView(r, view) as typeof r;
    return r.slice(0, 60);
  }, [rows, f, view]);

  const reload = () => qc.invalidateQueries({ queryKey: ["admin", "radar"] });

  async function include(ids: string[]) {
    setBusy(true);
    let ok = 0;
    for (const id of ids) {
      const o = data.ops.find((x) => x.id === id);
      if (!o) continue;
      if (!o.affiliate_url) {
        toast.error(`${o.name}: sem link de afiliada.`);
        continue;
      }
      const d = emptyDraft(o.affiliate_url);
      d.name = o.name;
      d.imageUrl = o.image_url;
      d.priceCents = o.price_cents;
      d.priceCheckedAt = o.fetched_at;
      d.externalId = o.external_id;
      d.fromApi = o.source.endsWith("_api");
      d.categoryId = classifyCategory(o.name, o.category, cats)?.id ?? null;
      const expired = !!o.valid_until && new Date(o.valid_until) < new Date();
      if (expired)
        toast.warning(
          `${o.name}: dados vencidos — salvo como rascunho sem preço. Atualize o Radar antes de publicar.`,
        );
      if (expired) d.priceCents = null;
      const r = await importOne(
        d,
        { publish: !expired, defaultCategoryId: null, useAi: true },
        { mks, cats, genCopy },
      );
      if (r.status === "error") toast.error(`${o.name}: ${r.message}`);
      else {
        ok++;
        toast.success(`${o.name}: ${r.message}`);
      }
    }
    setBusy(false);
    setPicked(new Set());
    qc.invalidateQueries({ queryKey: ["admin"] });
    if (ok) reload();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-navy">Radar de Oportunidades</h1>
          <p className="text-sm text-muted-foreground">
            Score de 0 a 100 calculado só com dados reais. Comissões são estimativas, não valores
            confirmados.
          </p>
        </div>
        <Button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              setReport(await refresh());
              reload();
            } catch {
              toast.error("Não foi possível atualizar.");
            }
            setBusy(false);
          }}
        >
          Atualizar agora
        </Button>
      </div>
      {report && (
        <div className="rounded-2xl border border-border bg-card p-3 text-sm">
          {report.map((r) => (
            <p key={r.source}>
              <b>{r.source}:</b> {r.status}
              {r.count ? ` — ${r.count} ofertas` : ""}
            </p>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {(Object.keys(VIEWS) as View[]).map((k) => (
          <button
            key={k}
            onClick={() => setView(k)}
            className={`rounded-full px-3 py-1.5 text-sm font-bold ${view === k ? "bg-navy text-secondary-foreground" : "bg-card text-navy"}`}
          >
            {VIEWS[k]}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
        <select
          aria-label="Loja"
          className={sel}
          value={f.mk}
          onChange={(e) => setF({ ...f, mk: e.target.value })}
        >
          <option value="">Todas as lojas</option>
          {mks.map((m) => (
            <option key={m.slug} value={m.slug}>
              {m.name}
            </option>
          ))}
        </select>
        <Input
          aria-label="Categoria"
          placeholder="Categoria"
          value={f.cat}
          onChange={(e) => setF({ ...f, cat: e.target.value })}
        />
        <Input
          aria-label="Preço máximo"
          placeholder="Preço até R$"
          inputMode="decimal"
          value={f.maxPrice}
          onChange={(e) => setF({ ...f, maxPrice: e.target.value })}
        />
        <Input
          aria-label="Comissão mínima"
          placeholder="Comissão ≥ %"
          inputMode="decimal"
          value={f.minComm}
          onChange={(e) => setF({ ...f, minComm: e.target.value })}
        />
        <Input
          aria-label="Vendas mínimas"
          placeholder="Vendas ≥"
          inputMode="numeric"
          value={f.minSales}
          onChange={(e) => setF({ ...f, minSales: e.target.value })}
        />
        <Input
          aria-label="Score mínimo"
          placeholder="Score ≥"
          inputMode="numeric"
          value={f.minScore}
          onChange={(e) => setF({ ...f, minScore: e.target.value })}
        />
      </div>

      {picked.size > 0 && (
        <Button disabled={busy} onClick={() => include([...picked])}>
          Incluir {picked.size} no catálogo
        </Button>
      )}

      {shown.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
          Nenhuma oportunidade aqui ainda. Conecte a Shopee ou o Mercado Livre em Integrações, ou
          cadastre dados manualmente / por relatório abaixo.
        </p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {shown.map((r) => {
            const { o, s, inCatalog, expired } = r;
            const fin = financialPotential(r);
            return (
              <li key={o.id} className="flex gap-3 rounded-2xl border border-border bg-card p-3">
                <input
                  type="checkbox"
                  aria-label={`Selecionar ${o.name}`}
                  disabled={inCatalog}
                  checked={picked.has(o.id)}
                  onChange={(e) => {
                    const n = new Set(picked);
                    if (e.target.checked) n.add(o.id);
                    else n.delete(o.id);
                    setPicked(n);
                  }}
                />
                {o.image_url ? (
                  <img
                    src={o.image_url}
                    alt={o.name}
                    className="size-20 shrink-0 rounded-xl object-cover"
                  />
                ) : (
                  <div className="size-20 shrink-0 rounded-xl bg-muted" />
                )}
                <div className="min-w-0 flex-1 space-y-1 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-bold text-navy">{o.name}</p>
                    <span className="shrink-0 rounded-full bg-yellow px-2 py-0.5 text-xs font-extrabold text-navy">
                      {s.score}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {mks.find((m) => m.slug === o.marketplace_slug)?.name ?? o.marketplace_slug}
                    {o.category ? ` · ${o.category}` : ""} · {SOURCE[o.source]} · atualizado{" "}
                    {new Date(o.fetched_at).toLocaleString("pt-BR")}
                    {expired && <b className="text-destructive"> · vencido</b>}
                  </p>
                  <p>
                    {brl(o.price_cents)} · comissão{" "}
                    {o.commission_rate != null ? `${o.commission_rate}%` : "—"}
                    {o.extra_commission_rate ? ` + ${o.extra_commission_rate}% extra` : ""}
                    {o.discount_pct ? ` · ${o.discount_pct}% de desconto` : ""} (
                    {brl(s.commissionCents)} estimado/venda)
                  </p>
                  <p className="text-xs">
                    Vendas: {o.sales ?? "—"} · Procura: {o.search_volume ?? "—"} · Crescimento:{" "}
                    {r.growth != null
                      ? `${r.growth}%${r.growthFromHistory ? " (histórico)" : ""}`
                      : "—"}{" "}
                    · Avaliação: {o.rating ?? "—"}
                  </p>
                  <p className="text-xs">
                    Confiança <b>{s.confidence}</b>. {justify(s)}
                  </p>
                  {fin != null && (
                    <p className="text-xs">
                      Potencial financeiro (estimado): <b>{brl(fin)}</b>
                    </p>
                  )}
                  {revenueScenarios(s.commissionCents) && (
                    <p className="text-xs text-muted-foreground">
                      Estimativa por 100 cliques:{" "}
                      {revenueScenarios(s.commissionCents)!
                        .map((x) => `${x.conversion * 100}% conv. ${brl(x.cents)}`)
                        .join(" · ")}
                    </p>
                  )}
                  {inCatalog ? (
                    <p className="text-xs font-bold text-navy">Já está no catálogo</p>
                  ) : (
                    <Button size="sm" disabled={busy} onClick={() => include([o.id])}>
                      Incluir no catálogo
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Assistant
        onInclude={include}
        names={new Map(data.ops.map((o) => [o.id, o.name]))}
        busy={busy}
      />
      <RunsPanel runs={data.runs} daily={data.daily} maxItems={data.maxItems} onSaved={reload} />
      <WeightsForm weights={data.weights} onSaved={reload} />
      <ManualEntry mks={mks} onSaved={reload} />
    </div>
  );
}

const PRESETS = [
  "Quais os melhores produtos para divulgar hoje?",
  "Compare as oportunidades da Shopee e do Mercado Livre.",
  "Quais têm preço até R$ 50 e comissão acima de 10%?",
  "Quais nichos e categorias valem mais a pena?",
  "Monte um plano de divulgação para hoje.",
  "Sugira produtos para o Instagram e para o WhatsApp.",
  "Quais produtos do catálogo devo substituir?",
];

const RUN_STATUS: Record<string, string> = {
  running: "Em andamento",
  ok: "Concluída",
  partial: "Parcial",
  failed: "Falhou",
  skipped: "Sem fontes conectadas",
};
type RunRow = {
  id: string;
  trigger: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  items: number;
  requests: number;
  errors: string[];
  sources: unknown;
};
function RunsPanel({
  runs,
  daily,
  maxItems,
  onSaved,
}: {
  runs: RunRow[];
  daily: boolean;
  maxItems: number;
  onSaved: () => void;
}) {
  const [d, setD] = useState(daily);
  const [m, setM] = useState(String(maxItems));
  async function save() {
    const n = Math.round(Number(m));
    if (!(n >= 10 && n <= 500))
      return void toast.error("O limite deve ficar entre 10 e 500 produtos.");
    const { error } = await supabase
      .from("radar_settings")
      .update({ daily_enabled: d, max_items: n, updated_at: new Date().toISOString() })
      .eq("id", 1);
    if (error) toast.error("Não foi possível salvar.");
    else {
      toast.success("Configuração salva.");
      onSaved();
    }
  }
  return (
    <section className="rounded-3xl border border-border bg-card p-4">
      <h2 className="text-lg font-extrabold text-navy">Atualização automática</h2>
      <p className="mb-3 text-xs text-muted-foreground">
        Roda uma vez por dia, por volta das 7h (Brasília), só com lojas conectadas. Duas
        atualizações nunca rodam ao mesmo tempo.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" checked={d} onChange={(e) => setD(e.target.checked)} />
          Atualizar todo dia
        </label>
        <div>
          <Label htmlFor="max-items">Máx. de produtos por execução</Label>
          <Input
            id="max-items"
            inputMode="numeric"
            value={m}
            onChange={(e) => setM(e.target.value)}
            className="w-32"
          />
        </div>
        <Button onClick={save}>Salvar</Button>
      </div>
      <h3 className="mt-4 font-extrabold text-navy">Últimas execuções</h3>
      {runs.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma execução ainda.</p>
      ) : (
        <ul className="mt-2 space-y-1 text-sm">
          {runs.map((r) => (
            <li key={r.id} className="rounded-xl border border-border p-2">
              <b>{new Date(r.started_at).toLocaleString("pt-BR")}</b> ·{" "}
              {r.trigger === "manual" ? "Manual" : "Agendada"} · {RUN_STATUS[r.status] ?? r.status}{" "}
              · {r.items} itens · {r.requests} consultas
              {Array.isArray(r.sources) && (
                <span className="text-muted-foreground">
                  ·{" "}
                  {(r.sources as { source: string; status: string }[])
                    .map((x) => `${x.source}: ${x.status}`)
                    .join(" · ")}
                </span>
              )}
              {r.errors.length > 0 && (
                <p className="text-xs text-destructive">{r.errors.join(" | ")}</p>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-xs text-muted-foreground">
        Custo: as consultas às lojas não são cobradas pela loja; o uso de IA aparece no consumo de
        créditos do projeto.
      </p>
    </section>
  );
}

function Assistant({
  onInclude,
  names,
  busy,
}: {
  onInclude: (ids: string[]) => void;
  names: Map<string, string>;
  busy: boolean;
}) {
  const ask = useServerFn(askRadar);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [msgs, setMsgs] = useState<{ role: "user" | "assistant"; text: string; ids?: string[] }[]>(
    [],
  );
  async function send() {
    const question = q.trim();
    if (!question) return;
    setQ("");
    setMsgs((m) => [...m, { role: "user", text: question }]);
    setLoading(true);
    const r = await ask({
      data: { question, history: msgs.map(({ role, text }) => ({ role, text })) },
    }).catch(() => ({ error: "Falha na conexão.", answer: "", ids: [] }));
    setLoading(false);
    setMsgs((m) => [...m, { role: "assistant", text: r.error ?? r.answer, ids: r.ids }]);
  }
  return (
    <section className="rounded-3xl border border-border bg-card p-4">
      <h2 className="text-lg font-extrabold text-navy">Assistente do Radar</h2>
      <p className="mb-3 text-xs text-muted-foreground">
        Responde só com os dados do Radar e do Desempenho. Cliques não são vendas.
      </p>
      <div className="mb-3 max-h-96 space-y-2 overflow-y-auto">
        {msgs.map((m, i) => (
          <div
            key={i}
            className={`whitespace-pre-wrap rounded-2xl p-3 text-sm ${m.role === "user" ? "ml-8 bg-muted" : "mr-8 border border-border"}`}
          >
            {m.text}
            {!!m.ids?.length && (
              <div className="mt-2 flex flex-wrap gap-2">
                {m.ids.map((id) => (
                  <Button
                    key={id}
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => onInclude([id])}
                  >
                    Incluir: {names.get(id)?.slice(0, 40)}
                  </Button>
                ))}
                {m.ids.length > 1 && (
                  <Button size="sm" disabled={busy} onClick={() => onInclude(m.ids!)}>
                    Incluir todos
                  </Button>
                )}
              </div>
            )}
          </div>
        ))}
        {loading && <p className="text-sm text-muted-foreground">Analisando…</p>}
      </div>
      <div className="mb-2 flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <Button key={p} size="sm" variant="outline" disabled={loading} onClick={() => setQ(p)}>
            {p}
          </Button>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          aria-label="Pergunta ao assistente"
          placeholder="Ex.: Quais produtos de casa têm melhor comissão?"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
        />
        <Button disabled={loading} onClick={send}>
          Perguntar
        </Button>
      </div>
    </section>
  );
}

function WeightsForm({ weights, onSaved }: { weights: Weights; onSaved: () => void }) {
  const [w, setW] = useState(weights);
  return (
    <section className="rounded-3xl border border-border bg-card p-4">
      <h2 className="text-lg font-extrabold text-navy">Pesos do score</h2>
      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        {INDICATORS.map((k) => (
          <div key={k}>
            <Label htmlFor={`w-${k}`}>{INDICATOR_LABEL[k]}</Label>
            <Input
              id={`w-${k}`}
              inputMode="numeric"
              value={w[k]}
              onChange={(e) => setW({ ...w, [k]: Math.max(0, Number(e.target.value) || 0) })}
            />
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <Button
          onClick={async () => {
            const { error } = await supabase
              .from("radar_settings")
              .upsert({ id: 1, weights: w, updated_at: new Date().toISOString() });
            if (error) toast.error("Não foi possível salvar.");
            else {
              toast.success("Pesos salvos.");
              onSaved();
            }
          }}
        >
          Salvar pesos
        </Button>
        <Button variant="outline" onClick={() => setW(DEFAULT_WEIGHTS)}>
          Voltar ao padrão
        </Button>
      </div>
    </section>
  );
}

const CSV_HELP =
  "nome, loja, codigo, link, foto, categoria, preco, comissao, comissao_extra, desconto, vendas, procura, crescimento, avaliacao";
function ManualEntry({
  mks,
  onSaved,
}: {
  mks: { slug: string; name: string }[];
  onSaved: () => void;
}) {
  const blank = {
    name: "",
    mk: mks[0]?.slug ?? "",
    code: "",
    link: "",
    image: "",
    category: "",
    price: "",
    comm: "",
    extra: "",
    discount: "",
    sales: "",
    search: "",
    growth: "",
    rating: "",
    season: [] as string[],
  };
  const [v, setV] = useState(blank);
  const [csv, setCsv] = useState("");
  const toRow = (x: typeof blank, source: "manual" | "relatorio") => ({
    marketplace_slug: x.mk,
    external_id: x.code || x.link || x.name,
    name: x.name.slice(0, 200),
    affiliate_url: x.link || null,
    image_url: x.image || null,
    category: x.category || null,
    price_cents: num(x.price) != null ? Math.round(num(x.price)! * 100) : null,
    commission_rate: num(x.comm),
    extra_commission_rate: num(x.extra),
    discount_pct: num(x.discount),
    sales: num(x.sales),
    search_volume: num(x.search),
    growth_pct: num(x.growth),
    rating: num(x.rating),
    seasonal_dates: x.season,
    source,
    fetched_at: new Date().toISOString(),
  });
  async function save(rows: ReturnType<typeof toRow>[]): Promise<boolean | void> {
    const bad = rows.filter((r) => !r.name || !mks.some((m) => m.slug === r.marketplace_slug));
    if (bad.length)
      return void toast.error("Cada linha precisa de nome e de uma loja cadastrada (slug).");
    const { error } = await supabase
      .from("radar_opportunities")
      .upsert(rows, { onConflict: "marketplace_slug,external_id" });
    if (error) return void toast.error("Não foi possível salvar.");
    toast.success(`${rows.length} oportunidade(s) salva(s).`);
    onSaved();
    return true;
  }
  const field = (k: keyof typeof blank, label: string) => (
    <div>
      <Label htmlFor={`m-${k}`}>{label}</Label>
      <Input
        id={`m-${k}`}
        value={v[k] as string}
        onChange={(e) => setV({ ...v, [k]: e.target.value })}
      />
    </div>
  );
  return (
    <section className="rounded-3xl border border-border bg-card p-4">
      <h2 className="text-lg font-extrabold text-navy">Adicionar dados manualmente</h2>
      <p className="mb-3 text-xs text-muted-foreground">
        Use só números que você conferiu na loja ou em relatório oficial. Campos vazios ficam como
        "sem dados".
      </p>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {field("name", "Nome *")}
        <div>
          <Label htmlFor="m-mk">Loja *</Label>
          <select
            id="m-mk"
            className={`${sel} w-full`}
            value={v.mk}
            onChange={(e) => setV({ ...v, mk: e.target.value })}
          >
            {mks.map((m) => (
              <option key={m.slug} value={m.slug}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
        {field("code", "Código na loja")}
        {field("link", "Link de afiliada")}
        {field("image", "Link da foto")}
        {field("category", "Categoria")}
        {field("price", "Preço (R$)")}
        {field("comm", "Comissão (%)")}
        {field("extra", "Comissão extra (%)")}
        {field("discount", "Desconto (%)")}
        {field("sales", "Vendas")}
        {field("search", "Procura")}
        {field("growth", "Crescimento (%)")}
        {field("rating", "Avaliação (0-5)")}
      </div>
      <fieldset className="mt-3 flex flex-wrap gap-2 text-xs">
        <legend className="mb-1 text-sm font-bold">Datas comerciais</legend>
        {BR_CALENDAR.map((c) => (
          <label key={c.key} className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={v.season.includes(c.key)}
              onChange={(e) =>
                setV({
                  ...v,
                  season: e.target.checked
                    ? [...v.season, c.key]
                    : v.season.filter((s) => s !== c.key),
                })
              }
            />
            {c.name}
          </label>
        ))}
      </fieldset>
      <Button
        className="mt-3"
        onClick={async () => {
          if (await save([toRow(v, "manual")])) setV(blank);
        }}
      >
        Salvar oportunidade
      </Button>

      <h3 className="mt-6 font-extrabold text-navy">Importar relatório (CSV)</h3>
      <p className="text-xs text-muted-foreground">
        Colunas: {CSV_HELP}. "loja" é o slug (ex.: shopee).
      </p>
      <Textarea
        aria-label="Conteúdo do relatório CSV"
        rows={4}
        value={csv}
        onChange={(e) => setCsv(e.target.value)}
      />
      <Button
        className="mt-2"
        variant="outline"
        onClick={async () => {
          const rows = parseCsv(csv)
            .slice(0, 200)
            .map((r) =>
              toRow(
                {
                  ...blank,
                  name: r["nome"] ?? "",
                  mk: r["loja"] ?? "",
                  code: r["codigo"] ?? "",
                  link: r["link"] ?? "",
                  image: r["foto"] ?? "",
                  category: r["categoria"] ?? "",
                  price: r["preco"] ?? "",
                  comm: r["comissao"] ?? "",
                  extra: r["comissao_extra"] ?? "",
                  discount: r["desconto"] ?? "",
                  sales: r["vendas"] ?? "",
                  search: r["procura"] ?? "",
                  growth: r["crescimento"] ?? "",
                  rating: r["avaliacao"] ?? "",
                  season: [],
                },
                "relatorio",
              ),
            );
          if (!rows.length) return void toast.error("Planilha vazia.");
          if (await save(rows)) setCsv("");
        }}
      >
        Importar relatório
      </Button>
    </section>
  );
}
