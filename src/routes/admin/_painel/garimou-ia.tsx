import { queryOptions, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { Markdown } from "@/components/admin/Markdown";
import { Link } from "@tanstack/react-router";
import {
  askAgent,
  campaignFn,
  confirmImportFn,
  prepareImportFn,
  runDailyPlanFn,
} from "@/lib/agent/agent.functions";

const iaData = queryOptions({
  queryKey: ["admin", "garimou-ia"],
  queryFn: async () => {
    const [prefs, plans, prods] = await Promise.all([
      supabase.from("commercial_preferences").select("*").eq("id", 1).maybeSingle(),
      supabase.from("daily_plans").select("*").order("created_at", { ascending: false }).limit(5),
      supabase.from("products").select("id,name").eq("status", "published").order("name"),
    ]);
    return { prefs: prefs.data, plans: plans.data ?? [], prods: prods.data ?? [] };
  },
});

export const Route = createFileRoute("/admin/_painel/garimou-ia")({
  loader: ({ context }) => context.queryClient.ensureQueryData(iaData),
  head: () => ({
    meta: [
      { title: "Garimou IA — Painel Garimou Achou!" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: GarimouIA,
});

const PRESETS = [
  "Encontrar melhores oportunidades de hoje",
  "Encontrar produtos em tendência",
  "Encontrar produtos com maiores comissões",
  "Comparar marketplaces",
  "Encontrar produtos baratos com boa demanda",
  "Analisar meu catálogo",
  "Criar plano de vendas",
  "Preparar campanha da semana",
];
const brl = (c: number | null) =>
  c == null ? "—" : (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
type AgentResult = Awaited<ReturnType<typeof askAgent>>;
type CardT = AgentResult["cards"][number];
type Msg = {
  role: "user" | "assistant";
  text: string;
  cards?: CardT[];
  tools?: string[];
  sources?: string[];
  limitations?: string[];
  noIntegration?: boolean;
};

function GarimouIA() {
  const { data } = useSuspenseQuery(iaData);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-navy">Garimou IA</h1>
        <p className="text-sm text-muted-foreground">
          Agente comercial que consulta o Radar, o catálogo e o desempenho. Ele só recomenda: nada é
          cadastrado sem a sua aprovação.
        </p>
      </div>
      <Chat />
      <DailyPlan plans={data.plans} enabled={data.prefs?.daily_plan_enabled ?? false} />
      <Campaign prods={data.prods} />
      <Prefs prefs={data.prefs} />
    </div>
  );
}

function Chat() {
  const ask = useServerFn(askAgent);
  const prepare = useServerFn(prepareImportFn);
  const confirm = useServerFn(confirmImportFn);
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [publish, setPublish] = useState(false);
  const [approval, setApproval] = useState<
    Awaited<ReturnType<typeof prepareImportFn>>["resultado"] | null
  >(null);
  const [results, setResults] = useState<
    { nome: string; status: string; mensagem: string }[] | null
  >(null);

  async function send(text: string) {
    const question = text.trim();
    if (!question || loading) return;
    setQ("");
    setMsgs((m) => [...m, { role: "user", text: question }]);
    setLoading(true);
    const r = await ask({
      data: { question, history: msgs.map(({ role, text }) => ({ role, text })) },
    }).catch(
      () =>
        ({
          error: "Falha na conexão.",
          answer: "",
          cards: [],
          tools: [],
          sources: [],
          limitations: [],
          noIntegration: false,
        }) as AgentResult,
    );
    setLoading(false);
    setMsgs((m) => [
      ...m,
      {
        role: "assistant",
        text: r.error ?? r.answer,
        cards: r.cards,
        tools: r.tools,
        sources: r.sources,
        limitations: r.limitations,
        noIntegration: r.noIntegration,
      },
    ]);
  }
  async function startImport(ids: string[]) {
    try {
      setResults(null);
      setApproval((await prepare({ data: { ids, publish } })).resultado);
    } catch {
      toast.error("Não foi possível preparar a importação.");
    }
  }
  async function doConfirm() {
    if (!approval) return;
    setLoading(true);
    const r = await confirm({ data: { token: approval.token } });
    setLoading(false);
    setApproval(null);
    setPicked(new Set());
    if (r.error) return void toast.error(r.error);
    setResults(r.resultado);
    qc.invalidateQueries({ queryKey: ["admin"] });
  }
  const toggle = (id: string, on: boolean) => {
    const n = new Set(picked);
    if (on) n.add(id);
    else n.delete(id);
    setPicked(n);
  };

  return (
    <section className="rounded-3xl border border-border bg-card p-4">
      <div className="mb-3 flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={loading}
          onClick={() => send("Garimpar agora")}
          className="bg-yellow font-extrabold text-navy hover:bg-yellow/90"
        >
          Garimpar agora
        </Button>
        {PRESETS.map((p) => (
          <Button key={p} size="sm" variant="outline" disabled={loading} onClick={() => send(p)}>
            {p}
          </Button>
        ))}
      </div>
      <div className="mb-3 max-h-[36rem] space-y-3 overflow-y-auto">
        {msgs.map((m, i) => (
          <div
            key={i}
            className={`rounded-2xl p-3 text-sm ${m.role === "user" ? "ml-8 bg-muted" : "mr-4 border border-border"}`}
          >
            {m.role === "user" ? (
              <p className="whitespace-pre-wrap">{m.text}</p>
            ) : (
              <Markdown text={m.text} />
            )}
            {!!m.sources?.length && (
              <p className="mt-2 text-xs text-muted-foreground">
                Fontes externas consultadas: {m.sources.join(" · ")}
              </p>
            )}
            {!!m.limitations?.length && (
              <ul className="mt-1 list-disc pl-5 text-xs text-muted-foreground">
                {m.limitations.map((l, j) => (
                  <li key={j}>{l}</li>
                ))}
              </ul>
            )}
            {m.noIntegration && (
              <Link
                to="/admin/integracoes"
                className="mt-2 inline-block text-xs font-bold text-navy underline"
              >
                Abrir Integrações
              </Link>
            )}
            {!!m.tools?.length && (
              <p className="mt-1 text-xs text-muted-foreground">
                Consultas: {[...new Set(m.tools)].join(", ")}
              </p>
            )}
            {!!m.cards?.length && (
              <ul className="mt-3 grid gap-3 md:grid-cols-2">
                {m.cards.map((c) => (
                  <li
                    key={c.id}
                    className="flex gap-3 rounded-2xl border border-border bg-background p-3"
                  >
                    <input
                      type="checkbox"
                      aria-label={`Selecionar ${c.nome}`}
                      checked={picked.has(c.id)}
                      onChange={(e) => toggle(c.id, e.target.checked)}
                    />
                    {c.foto ? (
                      <img
                        src={c.foto}
                        alt={c.nome}
                        className="size-16 shrink-0 rounded-xl object-cover"
                      />
                    ) : (
                      <div className="size-16 shrink-0 rounded-xl bg-muted" />
                    )}
                    <div className="min-w-0 flex-1 space-y-1 text-xs">
                      <div className="flex justify-between gap-2">
                        <b className="text-sm text-navy">{c.nome}</b>
                        <span className="h-fit rounded-full bg-yellow px-2 font-extrabold text-navy">
                          {c.score}
                        </span>
                      </div>
                      <p>
                        {c.loja} · {brl(c.preco_cents)} · comissão {c.comissao_pct ?? "—"}%
                        {c.comissao_extra_pct ? ` + ${c.comissao_extra_pct}% extra` : ""} (
                        {brl(c.comissao_estimada_cents)}/venda, estimado)
                      </p>
                      <p>
                        Vendas na loja: {c.vendas_na_loja ?? "—"} · Avaliação: {c.avaliacao ?? "—"}{" "}
                        · Procura: {c.procura ?? "—"} · Confiança <b>{c.confianca}</b>
                      </p>
                      {!c.tem_link_afiliada && (
                        <p className="font-semibold text-destructive">
                          Sem link de afiliada da sua conta: não pode ser publicado.
                        </p>
                      )}
                      {c.link_loja && (
                        <a
                          href={c.link_loja}
                          target="_blank"
                          rel="noopener noreferrer nofollow"
                          className="underline"
                        >
                          Ver na loja
                        </a>
                      )}
                      <p className="text-muted-foreground">{c.justificativa}</p>
                      <p className="text-muted-foreground">
                        Fonte: {c.fonte} · {new Date(c.consultado_em).toLocaleString("pt-BR")}
                      </p>
                      <Button size="sm" onClick={() => startImport([c.id])}>
                        Incluir no catálogo
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
        {loading && (
          <p className="text-sm text-muted-foreground" role="status">
            Pesquisando nas lojas conectadas e classificando pelo Radar… isso pode levar até 1
            minuto.
          </p>
        )}
      </div>
      {picked.size > 0 && (
        <Button className="mb-3" onClick={() => startImport([...picked])}>
          Incluir {picked.size} selecionado(s)
        </Button>
      )}
      <label className="mb-3 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} />
        Publicar quando tudo estiver completo
      </label>
      {approval && (
        <div
          role="dialog"
          aria-label="Aprovar importação"
          className="mb-3 rounded-2xl border-2 border-navy p-3 text-sm"
        >
          <p className="font-bold text-navy">
            Prévia da importação (vale até{" "}
            {new Date(approval.expira_em).toLocaleTimeString("pt-BR")})
          </p>
          <ul className="my-2 list-disc pl-5">
            {approval.itens.map((i) => (
              <li key={i.id}>
                {i.nome ?? i.id}: <b>{i.acao}</b>
                {i.pendencias.length ? ` — ${i.pendencias.join(", ")}` : ""}
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <Button disabled={loading} onClick={doConfirm}>
              Aprovar e importar
            </Button>
            <Button variant="outline" onClick={() => setApproval(null)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
      {results && (
        <ul className="mb-3 rounded-2xl border border-border p-3 text-sm">
          {results.map((r, i) => (
            <li key={i}>
              <b>{r.nome}</b>: {r.mensagem}
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <Input
          aria-label="Pedido para a Garimou IA"
          placeholder="Ex.: produtos de casa até R$ 50 com comissão acima de 8%"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send(q)}
        />
        <Button disabled={loading} onClick={() => send(q)}>
          Enviar
        </Button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Limite: 6 consultas por pedido e 30 pedidos por hora.
      </p>
    </section>
  );
}

type Plan = {
  id: string;
  created_at: string;
  status: string;
  trigger: string;
  error: string | null;
  plan: unknown;
};
function DailyPlan({ plans, enabled }: { plans: Plan[]; enabled: boolean }) {
  const run = useServerFn(runDailyPlanFn);
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const last = plans.find((p) => p.status === "ok");
  const p = last?.plan as
    | {
        oportunidades_nao_cadastradas: { nome: string; loja: string; score: number }[];
        divulgar_instagram: { nome: string; texto: string; link: string }[];
        divulgar_whatsapp: { nome: string; texto: string; link: string }[];
        comissao_atrativa: { nome: string; comissao_estimada_cents: number | null }[];
        precisam_revisao: { nome: string; motivo: string }[];
      }
    | undefined;
  return (
    <section className="rounded-3xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-extrabold text-navy">Plano comercial diário</h2>
        <Button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const r = await run();
            setBusy(false);
            if (r.error) toast.error(r.error);
            else toast.success("Plano gerado.");
            qc.invalidateQueries({ queryKey: ["admin", "garimou-ia"] });
          }}
        >
          Executar agora
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Automático às 7h30 (Brasília): {enabled ? "ligado" : "desligado (ligue nas preferências)"}.
        Última execução:{" "}
        {plans[0]
          ? `${new Date(plans[0].created_at).toLocaleString("pt-BR")} — ${plans[0].status === "ok" ? "ok" : `falhou: ${plans[0].error}`}`
          : "nenhuma"}
        .
      </p>
      {p && (
        <div className="mt-3 grid gap-4 text-sm md:grid-cols-2">
          <Block title="Oportunidades fora do catálogo">
            {p.oportunidades_nao_cadastradas.map((x, i) => (
              <li key={i}>
                {x.nome} ({x.loja}) — score {x.score}
              </li>
            ))}
          </Block>
          <Block title="Divulgar no Instagram">
            {p.divulgar_instagram.map((x, i) => (
              <li key={i}>
                <b>{x.nome}</b>
                <br />
                {x.texto}
                <br />
                <span className="break-all text-xs text-muted-foreground">{x.link}</span>
              </li>
            ))}
          </Block>
          <Block title="Ofertas para WhatsApp">
            {p.divulgar_whatsapp.map((x, i) => (
              <li key={i}>
                <b>{x.nome}</b>
                <br />
                {x.texto}
                <br />
                <span className="break-all text-xs text-muted-foreground">{x.link}</span>
              </li>
            ))}
          </Block>
          <Block title="Comissão atrativa">
            {p.comissao_atrativa.map((x, i) => (
              <li key={i}>
                {x.nome} — {brl(x.comissao_estimada_cents)}/venda (estimado)
              </li>
            ))}
          </Block>
          <Block title="Precisam de revisão">
            {p.precisam_revisao.map((x, i) => (
              <li key={i}>
                {x.nome}: {x.motivo}
              </li>
            ))}
          </Block>
        </div>
      )}
    </section>
  );
}
function Block({ title, children }: { title: string; children: React.ReactNode }) {
  const empty = Array.isArray(children) && children.length === 0;
  return (
    <div>
      <h3 className="font-extrabold text-navy">{title}</h3>
      {empty ? (
        <p className="text-muted-foreground">Sem dados ainda.</p>
      ) : (
        <ul className="list-disc space-y-1 pl-5">{children}</ul>
      )}
    </div>
  );
}

function Campaign({ prods }: { prods: { id: string; name: string }[] }) {
  const gen = useServerFn(campaignFn);
  const [ids, setIds] = useState<string[]>([]);
  const [theme, setTheme] = useState("");
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<string | null>(null);
  return (
    <section className="rounded-3xl border border-border bg-card p-4">
      <h2 className="text-lg font-extrabold text-navy">Campanha de divulgação</h2>
      <p className="mb-2 text-xs text-muted-foreground">
        Escolha até 8 produtos publicados. Gera legendas, WhatsApp, Reels, Stories, hashtags, links
        com UTM e calendário. Nada é publicado nas redes.
      </p>
      <div className="mb-2 flex max-h-40 flex-wrap gap-2 overflow-y-auto text-sm">
        {prods.map((p) => (
          <label
            key={p.id}
            className="flex items-center gap-1 rounded-full border border-border px-2"
          >
            <input
              type="checkbox"
              checked={ids.includes(p.id)}
              disabled={!ids.includes(p.id) && ids.length >= 8}
              onChange={(e) =>
                setIds(e.target.checked ? [...ids, p.id] : ids.filter((x) => x !== p.id))
              }
            />
            {p.name}
          </label>
        ))}
        {!prods.length && <p className="text-muted-foreground">Nenhum produto publicado.</p>}
      </div>
      <div className="flex gap-2">
        <Input
          aria-label="Tema da campanha"
          placeholder="Tema (ex.: Black Friday)"
          value={theme}
          onChange={(e) => setTheme(e.target.value)}
        />
        <Button
          disabled={busy || !ids.length}
          onClick={async () => {
            setBusy(true);
            const r = await gen({ data: { ids, theme } });
            setBusy(false);
            if (r.error || !("resultado" in r)) return void toast.error(r.error ?? "Falhou.");
            setOut(JSON.stringify(r.resultado, null, 2));
          }}
        >
          Gerar campanha
        </Button>
      </div>
      {out && (
        <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap rounded-2xl bg-muted p-3 text-xs">
          {out}
        </pre>
      )}
    </section>
  );
}

type PrefsRow = {
  priority_categories: string[];
  min_price_cents: number | null;
  max_price_cents: number | null;
  min_commission_pct: number | null;
  preferred_marketplaces: string[];
  daily_count: number;
  channel: string;
  monthly_goal_cents: number | null;
  daily_plan_enabled: boolean;
} | null;
function Prefs({ prefs }: { prefs: PrefsRow }) {
  const qc = useQueryClient();
  const n = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));
  const [v, setV] = useState({
    cats: prefs?.priority_categories.join(", ") ?? "",
    min: prefs?.min_price_cents != null ? String(prefs.min_price_cents / 100) : "",
    max: prefs?.max_price_cents != null ? String(prefs.max_price_cents / 100) : "",
    comm: prefs?.min_commission_pct != null ? String(prefs.min_commission_pct) : "",
    mks: prefs?.preferred_marketplaces.join(", ") ?? "",
    count: String(prefs?.daily_count ?? 10),
    channel: prefs?.channel ?? "instagram",
    goal: prefs?.monthly_goal_cents != null ? String(prefs.monthly_goal_cents / 100) : "",
    daily: prefs?.daily_plan_enabled ?? false,
  });
  const f = (k: keyof typeof v, label: string) => (
    <div>
      <Label htmlFor={`p-${k}`}>{label}</Label>
      <Input
        id={`p-${k}`}
        value={v[k] as string}
        onChange={(e) => setV({ ...v, [k]: e.target.value })}
      />
    </div>
  );
  async function save() {
    const cents = (x: string) => (n(x) == null ? null : Math.round(n(x)! * 100));
    const count = Math.round(Number(v.count));
    if (!(count >= 1 && count <= 30)) return void toast.error("Quantidade diária entre 1 e 30.");
    const list = (s: string) =>
      s
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean)
        .slice(0, 20);
    const { error } = await supabase.from("commercial_preferences").upsert({
      id: 1,
      priority_categories: list(v.cats),
      min_price_cents: cents(v.min),
      max_price_cents: cents(v.max),
      min_commission_pct: n(v.comm),
      preferred_marketplaces: list(v.mks).map((x) => x.toLowerCase()),
      daily_count: count,
      channel: v.channel,
      monthly_goal_cents: cents(v.goal),
      daily_plan_enabled: v.daily,
      updated_at: new Date().toISOString(),
    });
    if (error) toast.error("Não foi possível salvar.");
    else {
      toast.success("Preferências salvas.");
      qc.invalidateQueries({ queryKey: ["admin", "garimou-ia"] });
    }
  }
  return (
    <section className="rounded-3xl border border-border bg-card p-4">
      <h2 className="text-lg font-extrabold text-navy">Preferências comerciais</h2>
      <p className="mb-3 text-xs text-muted-foreground">
        Usadas no plano diário. Não há aprendizado automático: as recomendações seguem estas regras
        e o score do Radar.
      </p>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {f("cats", "Categorias prioritárias")}
        {f("min", "Preço mínimo (R$)")}
        {f("max", "Preço máximo (R$)")}
        {f("comm", "Comissão mínima (%)")}
        {f("mks", "Lojas preferidas (slug)")}
        {f("count", "Produtos por dia")}
        <div>
          <Label htmlFor="p-channel">Canal</Label>
          <select
            id="p-channel"
            className="h-10 w-full rounded-full border-2 border-input bg-background px-3 text-sm"
            value={v.channel}
            onChange={(e) => setV({ ...v, channel: e.target.value })}
          >
            <option value="instagram">Instagram</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="ambos">Ambos</option>
          </select>
        </div>
        {f("goal", "Meta mensal de comissões (R$)")}
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm font-semibold">
        <input
          type="checkbox"
          checked={v.daily}
          onChange={(e) => setV({ ...v, daily: e.target.checked })}
        />
        Gerar o plano automaticamente todo dia
      </label>
      <Button className="mt-3" onClick={save}>
        Salvar preferências
      </Button>
    </section>
  );
}
