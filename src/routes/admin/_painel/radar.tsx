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

const radarData = queryOptions({
  queryKey: ["admin", "radar"],
  queryFn: async () => {
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const [ops, st, prods, ev] = await Promise.all([
      supabase.from("radar_opportunities").select("*").order("fetched_at", { ascending: false }),
      supabase.from("radar_settings").select("weights").eq("id", 1).maybeSingle(),
      supabase.from("products").select("id,external_id,affiliate_url"),
      supabase.from("analytics_events").select("product_id").eq("event_type", "offer_click").gte("created_at", since).limit(10000),
    ]);
    if (ops.error) throw ops.error;
    return {
      ops: ops.data,
      weights: { ...DEFAULT_WEIGHTS, ...((st.data?.weights as Partial<Weights>) ?? {}) },
      prods: prods.data ?? [],
      clicks: (ev.data ?? []).map((e) => e.product_id),
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
    meta: [{ title: "Radar de Oportunidades — Painel Garimou Achou!" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: Radar,
});

const VIEWS = {
  melhores: "Melhores do dia",
  vendidos: "Mais vendidos",
  procurados: "Mais procurados",
  crescimento: "Em crescimento",
  comissao: "Maiores comissões",
  sazonais: "Sazonais",
  divulgacao: "Potencial de divulgação",
  novos: "Ainda não cadastrados",
} as const;
type View = keyof typeof VIEWS;
const SOURCE: Record<string, string> = { manual: "Manual", relatorio: "Relatório", shopee_api: "API Shopee", mercadolivre_api: "API Mercado Livre" };
const brl = (c: number | null) => (c == null ? "—" : (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
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
  const [f, setF] = useState({ mk: "", cat: "", maxPrice: "", minComm: "", minSales: "", minScore: "" });
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<{ source: string; status: string; count: number }[] | null>(null);

  const rows = useMemo(() => {
    const ownClicks = new Map<string, number>();
    for (const id of data.clicks) if (id) ownClicks.set(id, (ownClicks.get(id) ?? 0) + 1);
    const inCatalog = (o: (typeof data.ops)[number]) =>
      data.prods.find((p) => p.external_id === o.external_id || (!!o.affiliate_url && p.affiliate_url === o.affiliate_url));
    const scores = scoreAll(
      data.ops.map((o) => {
        const p = inCatalog(o);
        return {
          id: o.id, marketplace: o.marketplace_slug, category: o.category, priceCents: o.price_cents,
          commissionRate: o.commission_rate, sales: o.sales, searchVolume: o.search_volume, growthPct: o.growth_pct,
          rating: o.rating, seasonalDates: o.seasonal_dates, internalClicks: p ? (ownClicks.get(p.id) ?? 0) : null,
        };
      }),
      data.weights,
    );
    return data.ops.map((o) => ({ o, s: scores.get(o.id)!, inCatalog: !!inCatalog(o), expired: !!o.valid_until && new Date(o.valid_until) < new Date() }));
  }, [data]);

  const shown = useMemo(() => {
    let r = rows.filter(({ o, s }) =>
      (!f.mk || o.marketplace_slug === f.mk) &&
      (!f.cat || (o.category ?? "").toLowerCase().includes(f.cat.toLowerCase())) &&
      (!f.maxPrice || (o.price_cents != null && o.price_cents <= Number(f.maxPrice) * 100)) &&
      (!f.minComm || (o.commission_rate ?? -1) >= Number(f.minComm)) &&
      (!f.minSales || (o.sales ?? -1) >= Number(f.minSales)) &&
      (!f.minScore || s.score >= Number(f.minScore)),
    );
    const by = (g: (x: (typeof r)[number]) => number | null) =>
      r.filter((x) => g(x) != null).sort((a, b) => (g(b) ?? 0) - (g(a) ?? 0));
    if (view === "vendidos") r = by((x) => x.o.sales);
    else if (view === "procurados") r = by((x) => x.o.search_volume);
    else if (view === "crescimento") r = by((x) => x.o.growth_pct);
    else if (view === "comissao") r = by((x) => x.s.commissionCents);
    else if (view === "sazonais") r = by((x) => x.s.values.seasonality ?? null).filter((x) => (x.s.values.seasonality ?? 0) > 0);
    else if (view === "divulgacao") r = by((x) => (x.s.commissionCents != null && x.s.values.demand != null ? x.s.commissionCents * x.s.values.demand : null));
    else if (view === "novos") r = by((x) => x.s.score).filter((x) => !x.inCatalog);
    else r = by((x) => x.s.score).filter((x) => !x.expired);
    return r.slice(0, 60);
  }, [rows, f, view]);

  const reload = () => qc.invalidateQueries({ queryKey: ["admin", "radar"] });

  async function include(ids: string[]) {
    setBusy(true);
    let ok = 0;
    for (const id of ids) {
      const o = data.ops.find((x) => x.id === id);
      if (!o) continue;
      if (!o.affiliate_url) { toast.error(`${o.name}: sem link de afiliada.`); continue; }
      const d = emptyDraft(o.affiliate_url);
      d.name = o.name;
      d.imageUrl = o.image_url;
      d.priceCents = o.price_cents;
      d.externalId = o.external_id;
      d.fromApi = o.source.endsWith("_api");
      d.categoryId = cats.find((c) => c.name.toLowerCase() === (o.category ?? "").toLowerCase())?.id ?? null;
      const r = await importOne(d, { publish: true, defaultCategoryId: null, useAi: true }, { mks, cats, genCopy });
      if (r.status === "error") toast.error(`${o.name}: ${r.message}`);
      else { ok++; toast.success(`${o.name}: ${r.message}`); }
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
          <p className="text-sm text-muted-foreground">Score de 0 a 100 calculado só com dados reais. Comissões são estimativas, não valores confirmados.</p>
        </div>
        <Button disabled={busy} onClick={async () => { setBusy(true); try { setReport(await refresh()); reload(); } catch { toast.error("Não foi possível atualizar."); } setBusy(false); }}>
          Atualizar agora
        </Button>
      </div>
      {report && (
        <div className="rounded-2xl border border-border bg-card p-3 text-sm">
          {report.map((r) => <p key={r.source}><b>{r.source}:</b> {r.status}{r.count ? ` — ${r.count} ofertas` : ""}</p>)}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {(Object.keys(VIEWS) as View[]).map((k) => (
          <button key={k} onClick={() => setView(k)} className={`rounded-full px-3 py-1.5 text-sm font-bold ${view === k ? "bg-navy text-secondary-foreground" : "bg-card text-navy"}`}>{VIEWS[k]}</button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
        <select aria-label="Loja" className={sel} value={f.mk} onChange={(e) => setF({ ...f, mk: e.target.value })}>
          <option value="">Todas as lojas</option>
          {mks.map((m) => <option key={m.slug} value={m.slug}>{m.name}</option>)}
        </select>
        <Input aria-label="Categoria" placeholder="Categoria" value={f.cat} onChange={(e) => setF({ ...f, cat: e.target.value })} />
        <Input aria-label="Preço máximo" placeholder="Preço até R$" inputMode="decimal" value={f.maxPrice} onChange={(e) => setF({ ...f, maxPrice: e.target.value })} />
        <Input aria-label="Comissão mínima" placeholder="Comissão ≥ %" inputMode="decimal" value={f.minComm} onChange={(e) => setF({ ...f, minComm: e.target.value })} />
        <Input aria-label="Vendas mínimas" placeholder="Vendas ≥" inputMode="numeric" value={f.minSales} onChange={(e) => setF({ ...f, minSales: e.target.value })} />
        <Input aria-label="Score mínimo" placeholder="Score ≥" inputMode="numeric" value={f.minScore} onChange={(e) => setF({ ...f, minScore: e.target.value })} />
      </div>

      {picked.size > 0 && (
        <Button disabled={busy} onClick={() => include([...picked])}>Incluir {picked.size} no catálogo</Button>
      )}

      {shown.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
          Nenhuma oportunidade aqui ainda. Conecte a Shopee ou o Mercado Livre em Integrações, ou cadastre dados manualmente / por relatório abaixo.
        </p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {shown.map(({ o, s, inCatalog, expired }) => (
            <li key={o.id} className="flex gap-3 rounded-2xl border border-border bg-card p-3">
              <input type="checkbox" aria-label={`Selecionar ${o.name}`} disabled={inCatalog} checked={picked.has(o.id)}
                onChange={(e) => { const n = new Set(picked); if (e.target.checked) n.add(o.id); else n.delete(o.id); setPicked(n); }} />
              {o.image_url ? <img src={o.image_url} alt={o.name} className="size-20 shrink-0 rounded-xl object-cover" /> : <div className="size-20 shrink-0 rounded-xl bg-muted" />}
              <div className="min-w-0 flex-1 space-y-1 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-bold text-navy">{o.name}</p>
                  <span className="shrink-0 rounded-full bg-yellow px-2 py-0.5 text-xs font-extrabold text-navy">{s.score}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {mks.find((m) => m.slug === o.marketplace_slug)?.name ?? o.marketplace_slug}{o.category ? ` · ${o.category}` : ""} · {SOURCE[o.source]} · atualizado {new Date(o.fetched_at).toLocaleString("pt-BR")}
                  {expired && <b className="text-destructive"> · vencido</b>}
                </p>
                <p>
                  {brl(o.price_cents)} · comissão {o.commission_rate != null ? `${o.commission_rate}%` : "—"} ({brl(s.commissionCents)} estimado/venda)
                </p>
                <p className="text-xs">
                  Vendas: {o.sales ?? "—"} · Procura: {o.search_volume ?? "—"} · Crescimento: {o.growth_pct != null ? `${o.growth_pct}%` : "—"} · Avaliação: {o.rating ?? "—"}
                </p>
                <p className="text-xs">Confiança <b>{s.confidence}</b>. {justify(s)}</p>
                {revenueScenarios(s.commissionCents) && (
                  <p className="text-xs text-muted-foreground">
                    Estimativa por 100 cliques: {revenueScenarios(s.commissionCents)!.map((x) => `${x.conversion * 100}% conv. ${brl(x.cents)}`).join(" · ")}
                  </p>
                )}
                {inCatalog ? <p className="text-xs font-bold text-navy">Já está no catálogo</p> : (
                  <Button size="sm" disabled={busy} onClick={() => include([o.id])}>Incluir no catálogo</Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Assistant onInclude={include} names={new Map(data.ops.map((o) => [o.id, o.name]))} busy={busy} />
      <WeightsForm weights={data.weights} onSaved={reload} />
      <ManualEntry mks={mks} onSaved={reload} />
    </div>
  );
}

function Assistant({ onInclude, names, busy }: { onInclude: (ids: string[]) => void; names: Map<string, string>; busy: boolean }) {
  const ask = useServerFn(askRadar);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [msgs, setMsgs] = useState<{ role: "user" | "assistant"; text: string; ids?: string[] }[]>([]);
  async function send() {
    const question = q.trim();
    if (!question) return;
    setQ("");
    setMsgs((m) => [...m, { role: "user", text: question }]);
    setLoading(true);
    const r = await ask({ data: { question, history: msgs.map(({ role, text }) => ({ role, text })) } }).catch(() => ({ error: "Falha na conexão.", answer: "", ids: [] }));
    setLoading(false);
    setMsgs((m) => [...m, { role: "assistant", text: r.error ?? r.answer, ids: r.ids }]);
  }
  return (
    <section className="rounded-3xl border border-border bg-card p-4">
      <h2 className="text-lg font-extrabold text-navy">Assistente do Radar</h2>
      <p className="mb-3 text-xs text-muted-foreground">Responde só com os dados do Radar e do Desempenho. Cliques não são vendas.</p>
      <div className="mb-3 max-h-96 space-y-2 overflow-y-auto">
        {msgs.map((m, i) => (
          <div key={i} className={`whitespace-pre-wrap rounded-2xl p-3 text-sm ${m.role === "user" ? "ml-8 bg-muted" : "mr-8 border border-border"}`}>
            {m.text}
            {!!m.ids?.length && (
              <div className="mt-2 flex flex-wrap gap-2">
                {m.ids.map((id) => <Button key={id} size="sm" variant="outline" disabled={busy} onClick={() => onInclude([id])}>Incluir: {names.get(id)?.slice(0, 40)}</Button>)}
                {m.ids.length > 1 && <Button size="sm" disabled={busy} onClick={() => onInclude(m.ids!)}>Incluir todos</Button>}
              </div>
            )}
          </div>
        ))}
        {loading && <p className="text-sm text-muted-foreground">Analisando…</p>}
      </div>
      <div className="flex gap-2">
        <Input aria-label="Pergunta ao assistente" placeholder="Ex.: Quais produtos de casa têm melhor comissão?" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} />
        <Button disabled={loading} onClick={send}>Perguntar</Button>
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
            <Input id={`w-${k}`} inputMode="numeric" value={w[k]} onChange={(e) => setW({ ...w, [k]: Math.max(0, Number(e.target.value) || 0) })} />
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <Button onClick={async () => { const { error } = await supabase.from("radar_settings").upsert({ id: 1, weights: w, updated_at: new Date().toISOString() }); if (error) toast.error("Não foi possível salvar."); else { toast.success("Pesos salvos."); onSaved(); } }}>Salvar pesos</Button>
        <Button variant="outline" onClick={() => setW(DEFAULT_WEIGHTS)}>Voltar ao padrão</Button>
      </div>
    </section>
  );
}

const CSV_HELP = "nome, loja, codigo, link, foto, categoria, preco, comissao, vendas, procura, crescimento, avaliacao";
function ManualEntry({ mks, onSaved }: { mks: { slug: string; name: string }[]; onSaved: () => void }) {
  const blank = { name: "", mk: mks[0]?.slug ?? "", code: "", link: "", image: "", category: "", price: "", comm: "", sales: "", search: "", growth: "", rating: "", season: [] as string[] };
  const [v, setV] = useState(blank);
  const [csv, setCsv] = useState("");
  const toRow = (x: typeof blank, source: "manual" | "relatorio") => ({
    marketplace_slug: x.mk, external_id: x.code || x.link || x.name, name: x.name.slice(0, 200),
    affiliate_url: x.link || null, image_url: x.image || null, category: x.category || null,
    price_cents: num(x.price) != null ? Math.round(num(x.price)! * 100) : null, commission_rate: num(x.comm),
    sales: num(x.sales), search_volume: num(x.search), growth_pct: num(x.growth), rating: num(x.rating),
    seasonal_dates: x.season, source, fetched_at: new Date().toISOString(),
  });
  async function save(rows: ReturnType<typeof toRow>[]): Promise<boolean | void> {
    const bad = rows.filter((r) => !r.name || !mks.some((m) => m.slug === r.marketplace_slug));
    if (bad.length) return void toast.error("Cada linha precisa de nome e de uma loja cadastrada (slug).");
    const { error } = await supabase.from("radar_opportunities").upsert(rows, { onConflict: "marketplace_slug,external_id" });
    if (error) return void toast.error("Não foi possível salvar.");
    toast.success(`${rows.length} oportunidade(s) salva(s).`);
    onSaved();
    return true;
  }
  const field = (k: keyof typeof blank, label: string) => (
    <div><Label htmlFor={`m-${k}`}>{label}</Label><Input id={`m-${k}`} value={v[k] as string} onChange={(e) => setV({ ...v, [k]: e.target.value })} /></div>
  );
  return (
    <section className="rounded-3xl border border-border bg-card p-4">
      <h2 className="text-lg font-extrabold text-navy">Adicionar dados manualmente</h2>
      <p className="mb-3 text-xs text-muted-foreground">Use só números que você conferiu na loja ou em relatório oficial. Campos vazios ficam como "sem dados".</p>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {field("name", "Nome *")}
        <div><Label htmlFor="m-mk">Loja *</Label><select id="m-mk" className={`${sel} w-full`} value={v.mk} onChange={(e) => setV({ ...v, mk: e.target.value })}>{mks.map((m) => <option key={m.slug} value={m.slug}>{m.name}</option>)}</select></div>
        {field("code", "Código na loja")}{field("link", "Link de afiliada")}{field("image", "Link da foto")}{field("category", "Categoria")}
        {field("price", "Preço (R$)")}{field("comm", "Comissão (%)")}{field("sales", "Vendas")}{field("search", "Procura")}{field("growth", "Crescimento (%)")}{field("rating", "Avaliação (0-5)")}
      </div>
      <fieldset className="mt-3 flex flex-wrap gap-2 text-xs">
        <legend className="mb-1 text-sm font-bold">Datas comerciais</legend>
        {BR_CALENDAR.map((c) => (
          <label key={c.key} className="flex items-center gap-1"><input type="checkbox" checked={v.season.includes(c.key)} onChange={(e) => setV({ ...v, season: e.target.checked ? [...v.season, c.key] : v.season.filter((s) => s !== c.key) })} />{c.name}</label>
        ))}
      </fieldset>
      <Button className="mt-3" onClick={async () => { if (await save([toRow(v, "manual")])) setV(blank); }}>Salvar oportunidade</Button>

      <h3 className="mt-6 font-extrabold text-navy">Importar relatório (CSV)</h3>
      <p className="text-xs text-muted-foreground">Colunas: {CSV_HELP}. "loja" é o slug (ex.: shopee).</p>
      <Textarea aria-label="Conteúdo do relatório CSV" rows={4} value={csv} onChange={(e) => setCsv(e.target.value)} />
      <Button className="mt-2" variant="outline" onClick={async () => {
        const rows = parseCsv(csv).slice(0, 200).map((r) => toRow({ ...blank, name: r["nome"] ?? "", mk: r["loja"] ?? "", code: r["codigo"] ?? "", link: r["link"] ?? "", image: r["foto"] ?? "", category: r["categoria"] ?? "", price: r["preco"] ?? "", comm: r["comissao"] ?? "", sales: r["vendas"] ?? "", search: r["procura"] ?? "", growth: r["crescimento"] ?? "", rating: r["avaliacao"] ?? "", season: [] }, "relatorio"));
        if (!rows.length) return void toast.error("Planilha vazia.");
        if (await save(rows)) setCsv("");
      }}>Importar relatório</Button>
    </section>
  );
}
