import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { DEFAULT_WEIGHTS, scoreAll, type Weights } from "./score";

async function assertAdmin(ctx: { supabase: SupabaseClient<Database>; userId: string }) {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (!data) throw new Error("Sem permissão para esta ação.");
}

/** Atualizar agora: só consulta fontes oficiais com credencial; nada é simulado. */
export const refreshRadar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const report: { source: string; status: string; count: number }[] = [];
    const s = await import("@/lib/marketplaces/shopee.server");
    if (!s.shopeeConfigured()) report.push({ source: "Shopee", status: "Não configurada", count: 0 });
    else {
      try {
        const r = await s.shopeeSearch("", 1, 2);
        const now = new Date();
        const rows = r.nodes.map((n) => ({
          marketplace_slug: "shopee",
          external_id: `${n.shopId}:${n.itemId}`,
          name: n.productName.slice(0, 200),
          image_url: n.imageUrl,
          affiliate_url: n.offerLink,
          price_cents: n.priceMin ?? n.price ? Math.round(Number(n.priceMin ?? n.price) * 100) : null,
          commission_rate: n.commissionRate ? Number(n.commissionRate) * 100 : null,
          sales: n.sales,
          source: "shopee_api",
          fetched_at: now.toISOString(),
          valid_until: new Date(now.getTime() + 24 * 3600_000).toISOString(),
        }));
        if (rows.length)
          await context.supabase
            .from("radar_opportunities")
            .upsert(rows, { onConflict: "marketplace_slug,external_id" });
        report.push({ source: "Shopee", status: "Atualizada", count: rows.length });
      } catch (e) {
        console.error("Radar Shopee", (e as Error).message);
        report.push({ source: "Shopee", status: "Erro na consulta", count: 0 });
      }
    }
    const m = await import("@/lib/marketplaces/mercadolivre.server");
    report.push({
      source: "Mercado Livre",
      status: m.mercadolivreConfigured() ? "Conectada, sem consulta de tendências ainda" : "Não configurada",
      count: 0,
    });
    return report;
  });

/** Assistente: responde só com dados reais do Radar e do desempenho do site. */
export const askRadar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { question: string; history?: { role: "user" | "assistant"; text: string }[] }) => ({
    question: String(d?.question ?? "").slice(0, 1000),
    history: (d?.history ?? []).slice(-8).map((h) => ({
      role: h.role === "assistant" ? ("assistant" as const) : ("user" as const),
      text: String(h.text).slice(0, 2000),
    })),
  }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (!data.question.trim()) return { error: "Escreva a pergunta.", answer: "", ids: [] as string[] };
    const sb = context.supabase;
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const [{ data: ops }, { data: st }, { data: ev }, { data: prods }] = await Promise.all([
      sb.from("radar_opportunities").select("*").order("fetched_at", { ascending: false }).limit(150),
      sb.from("radar_settings").select("weights").eq("id", 1).maybeSingle(),
      sb.from("analytics_events").select("event_type,product_id").gte("created_at", since).limit(10000),
      sb.from("products").select("id,name,external_id,affiliate_url"),
    ]);
    const weights = { ...DEFAULT_WEIGHTS, ...((st?.weights as Partial<Weights>) ?? {}) };
    const clicks = new Map<string, number>();
    const counts: Record<string, number> = {};
    for (const e of ev ?? []) {
      counts[e.event_type] = (counts[e.event_type] ?? 0) + 1;
      if (e.event_type === "offer_click" && e.product_id)
        clicks.set(e.product_id, (clicks.get(e.product_id) ?? 0) + 1);
    }
    const scores = scoreAll(
      (ops ?? []).map((o) => ({
        id: o.id,
        marketplace: o.marketplace_slug,
        category: o.category,
        priceCents: o.price_cents,
        commissionRate: o.commission_rate,
        sales: o.sales,
        searchVolume: o.search_volume,
        growthPct: o.growth_pct,
        rating: o.rating,
        seasonalDates: o.seasonal_dates,
        internalClicks: null,
      })),
      weights,
    );
    const facts = (ops ?? []).map((o) => {
      const s = scores.get(o.id)!;
      return {
        id: o.id, nome: o.name, loja: o.marketplace_slug, categoria: o.category,
        preco_reais: o.price_cents != null ? o.price_cents / 100 : null,
        comissao_pct: o.commission_rate, comissao_estimada_reais: s.commissionCents != null ? s.commissionCents / 100 : null,
        vendas: o.sales, procura: o.search_volume, crescimento_pct: o.growth_pct, avaliacao: o.rating,
        score: s.score, confianca: s.confidence, sem_dados: s.missing, fonte: o.source, atualizado: o.fetched_at,
        ja_no_catalogo: (prods ?? []).some((p) => p.external_id === o.external_id || (o.affiliate_url && p.affiliate_url === o.affiliate_url)),
      };
    });
    const topProducts = [...clicks.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
      .map(([id, n]) => ({ produto: (prods ?? []).find((p) => p.id === id)?.name ?? id, cliques: n }));
    const { askRadarAi } = await import("./radar.server");
    try {
      const out = await askRadarAi(data.question, data.history, {
        oportunidades: facts,
        desempenho_30_dias: { eventos: counts, produtos_mais_clicados: topProducts },
      });
      const valid = new Set(facts.map((f) => f.id));
      return { error: null as string | null, answer: out.answer, ids: out.ids.filter((i) => valid.has(i)) };
    } catch (e) {
      const status = (e as { statusCode?: number })?.statusCode;
      console.error("Radar IA:", e);
      return {
        error: status === 429 ? "Muitos pedidos seguidos. Espere um pouco." : status === 402 ? "Os créditos de IA acabaram." : "Não foi possível responder agora.",
        answer: "",
        ids: [] as string[],
      };
    }
  });
