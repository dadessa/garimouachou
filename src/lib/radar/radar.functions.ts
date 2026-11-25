import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { DEFAULT_WEIGHTS, justify, type Weights } from "./score";
import { buildRadar, type Opp } from "./engine";

async function assertAdmin(ctx: { supabase: SupabaseClient<Database>; userId: string }) {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (!data) throw new Error("Sem permissão para esta ação.");
}

/** Atualizar agora: só consulta fontes oficiais com credencial; nada é simulado. */
export const refreshRadar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { runRadarRefresh } = await import("./refresh.server");
    const r = await runRadarRefresh(context.supabase, "manual");
    if (r.busy)
      return [{ source: "Radar", status: "Já existe uma atualização em andamento", count: 0 }];
    return r.report;
  });

/** Assistente: responde só com dados reais do Radar e do desempenho do site. */
export const askRadar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: { question: string; history?: { role: "user" | "assistant"; text: string }[] }) => ({
      question: String(d?.question ?? "").slice(0, 1000),
      history: (d?.history ?? []).slice(-8).map((h) => ({
        role: h.role === "assistant" ? ("assistant" as const) : ("user" as const),
        text: String(h.text).slice(0, 2000),
      })),
    }),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (!data.question.trim())
      return { error: "Escreva a pergunta.", answer: "", ids: [] as string[] };
    const sb = context.supabase;
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const [
      { data: ops },
      { data: st },
      { data: ev },
      { data: prods },
      { data: snaps },
      { data: searches },
    ] = await Promise.all([
      sb
        .from("radar_opportunities")
        .select("*")
        .order("fetched_at", { ascending: false })
        .limit(300),
      sb.from("radar_settings").select("weights").eq("id", 1).maybeSingle(),
      sb
        .from("analytics_events")
        .select("event_type,product_id")
        .gte("created_at", since)
        .limit(20000),
      sb.from("products").select("id,name,external_id,affiliate_url,status"),
      sb
        .from("radar_snapshots")
        .select("opportunity_id,day,sales,search_volume")
        .gte("day", since.slice(0, 10)),
      sb.from("site_searches").select("term,count").gte("day", since.slice(0, 10)).limit(5000),
    ]);
    const weights = { ...DEFAULT_WEIGHTS, ...((st?.weights as Partial<Weights>) ?? {}) };
    const clicks = new Map<string, number>();
    const views = new Map<string, number>();
    const counts: Record<string, number> = {};
    for (const e of ev ?? []) {
      counts[e.event_type] = (counts[e.event_type] ?? 0) + 1;
      if (!e.product_id) continue;
      if (e.event_type === "offer_click")
        clicks.set(e.product_id, (clicks.get(e.product_id) ?? 0) + 1);
      if (e.event_type === "product_view")
        views.set(e.product_id, (views.get(e.product_id) ?? 0) + 1);
    }
    const rows = buildRadar((ops ?? []) as Opp[], weights, {
      catalog: prods ?? [],
      clicks,
      snaps: snaps ?? [],
    });
    const facts = rows
      .filter((r) => !r.expired)
      .sort((a, b) => b.s.score - a.s.score)
      .slice(0, 120)
      .map(({ o, s, catalogId, growth, growthFromHistory }) => ({
        id: o.id,
        nome: o.name,
        loja: o.marketplace_slug,
        categoria: o.category,
        preco_reais: o.price_cents != null ? o.price_cents / 100 : null,
        desconto_pct: o.discount_pct,
        comissao_pct: o.commission_rate,
        comissao_extra_pct: o.extra_commission_rate,
        comissao_estimada_por_venda_reais:
          s.commissionCents != null ? s.commissionCents / 100 : null,
        vendas_na_loja: o.sales,
        procura: o.search_volume,
        crescimento_pct: growth,
        crescimento_pelo_historico: growthFromHistory,
        avaliacao: o.rating,
        score: s.score,
        confianca: s.confidence,
        sem_dados: s.missing,
        justificativa: justify(s),
        fonte: o.source,
        consultado_em: o.fetched_at,
        valido_ate: o.valid_until,
        ja_no_catalogo: !!catalogId,
      }));
    const vencidas = rows.filter((r) => r.expired).length;
    const term = new Map<string, number>();
    for (const x of searches ?? []) term.set(x.term, (term.get(x.term) ?? 0) + x.count);
    const catalogo = (prods ?? [])
      .filter((p) => p.status === "published")
      .map((p) => ({
        produto: p.name,
        visualizacoes_30d: views.get(p.id) ?? 0,
        cliques_oferta_30d: clicks.get(p.id) ?? 0,
      }))
      .sort((a, b) => a.cliques_oferta_30d - b.cliques_oferta_30d);
    const { askRadarAi } = await import("./radar.server");
    try {
      const out = await askRadarAi(data.question, data.history, {
        oportunidades_atuais: facts,
        oportunidades_vencidas_ocultas: vencidas,
        desempenho_30_dias: {
          eventos: counts,
          observacao: "cliques e visualizações não são vendas",
        },
        catalogo_publicado_por_cliques: catalogo.slice(0, 60),
        buscas_no_site_30_dias: [...term.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 30)
          .map(([t, n]) => ({ termo: t, buscas: n })),
      });
      const valid = new Set(facts.map((f) => f.id));
      return {
        error: null as string | null,
        answer: out.answer,
        ids: out.ids.filter((i) => valid.has(i)),
      };
    } catch (e) {
      const status = (e as { statusCode?: number })?.statusCode;
      console.error("Radar IA:", e);
      return {
        error:
          status === 429
            ? "Muitos pedidos seguidos. Espere um pouco."
            : status === 402
              ? "Os créditos de IA acabaram."
              : "Não foi possível responder agora.",
        answer: "",
        ids: [] as string[],
      };
    }
  });
