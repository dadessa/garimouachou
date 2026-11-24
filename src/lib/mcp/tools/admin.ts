/** Ferramentas administrativas: só aparecem para administradoras; RLS confere de novo em cada consulta. */
import { ToolError, type AuthContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { defineAppTool } from "../app-context";
import { supabaseForUser } from "../supabase";
import { VIEWS, type View } from "@/lib/radar/engine";

const onlyAdmin = ({ appContext }: { appContext: { isAdmin: boolean } }) => appContext.isAdmin;
const RO = { readOnlyHint: true, idempotentHint: true, openWorldHint: false } as const;

async function svc(ctx: AuthContext) {
  const s = await import("@/lib/agent/services.server");
  const sb = supabaseForUser(ctx);
  const uid = ctx.getUserId();
  if (!uid || !(await s.isAdmin(sb, uid))) throw new ToolError("Sem permissão.");
  return { s, sb, uid };
}
const out = (v: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(v) }] });
const viewKeys = Object.keys(VIEWS) as [View, ...View[]];

const rankTool = (name: string, title: string, description: string, view: View) =>
  defineAppTool({
    name, title, description, enabled: onlyAdmin, annotations: RO,
    inputSchema: {
      marketplace: z.string().max(30).optional().describe("Slug da loja, ex.: shopee."),
      limit: z.number().int().min(1).max(20).optional(),
    },
    handler: async (a, ctx) => {
      const { s, sb } = await svc(ctx);
      return out(s.rank(await s.loadRadar(sb), { view, limit: a.limit ?? 10, ...(a.marketplace ? { marketplace: a.marketplace } : {}) }));
    },
  });

export const adminTools = [
  defineAppTool({
    name: "get_integration_status", title: "Situação das lojas", enabled: onlyAdmin, annotations: RO,
    description: "Mostra se cada loja tem credencial salva e se a conexão foi validada com consulta real.",
    inputSchema: {},
    handler: async (_a, ctx) => { const { s, sb } = await svc(ctx); return out(await s.integrationStatus(sb)); },
  }),
  defineAppTool({
    name: "rank_opportunities", title: "Ranking de oportunidades", enabled: onlyAdmin, annotations: RO,
    description: "Ranking do Radar (mesmo score da tela) com visão e filtros; ofertas vencidas ficam de fora.",
    inputSchema: {
      view: z.enum(viewKeys).optional(),
      marketplace: z.string().max(30).optional(), category: z.string().max(60).optional(), keyword: z.string().max(60).optional(),
      max_price_reais: z.number().min(0).max(100000).optional(), min_commission_pct: z.number().min(0).max(100).optional(),
      only_new: z.boolean().optional(), limit: z.number().int().min(1).max(30).optional(),
    },
    handler: async (a, ctx) => {
      const { s, sb } = await svc(ctx);
      return out(s.rank(await s.loadRadar(sb), {
        view: a.view ?? "melhores", limit: a.limit ?? 10,
        ...(a.marketplace ? { marketplace: a.marketplace } : {}), ...(a.category ? { category: a.category } : {}), ...(a.keyword ? { keyword: a.keyword } : {}),
        ...(a.max_price_reais != null ? { maxPriceCents: Math.round(a.max_price_reais * 100) } : {}),
        ...(a.min_commission_pct != null ? { minCommissionPct: a.min_commission_pct } : {}), ...(a.only_new ? { onlyNew: true } : {}),
      }));
    },
  }),
  rankTool("get_best_sellers", "Mais vendidos", "Oportunidades com mais vendas informadas pela loja (vendas, não buscas).", "vendidos"),
  rankTool("get_commission_rates", "Maiores comissões", "Oportunidades com maior comissão estimada por venda.", "comissao"),
  defineAppTool({
    name: "get_market_trends", title: "Tendências", enabled: onlyAdmin, annotations: RO,
    description: "Oportunidades com procura crescente e termos mais buscados no site.",
    inputSchema: {},
    handler: async (_a, ctx) => {
      const { s, sb } = await svc(ctx);
      const c = await s.loadRadar(sb);
      return out({ ...s.rank(c, { view: "crescimento" }), buscas_no_site_30d: c.searches });
    },
  }),
  defineAppTool({
    name: "search_marketplace_offers", title: "Buscar ofertas", enabled: onlyAdmin,
    annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: true },
    description: "Busca ofertas por palavra-chave: ao vivo na Shopee quando conectada (salva no Radar), senão nos dados do Radar.",
    inputSchema: { keyword: z.string().min(2).max(60) },
    handler: async (a, ctx) => { const { s, sb } = await svc(ctx); return out(await s.searchOffers(sb, a.keyword)); },
  }),
  defineAppTool({
    name: "compare_offers", title: "Comparar lojas", enabled: onlyAdmin, annotations: RO,
    description: "Compara score médio, comissão média e melhor oferta por loja.",
    inputSchema: {},
    handler: async (_a, ctx) => { const { s, sb } = await svc(ctx); return out(s.compare(await s.loadRadar(sb))); },
  }),
  defineAppTool({
    name: "get_catalog", title: "Catálogo", enabled: onlyAdmin, annotations: RO,
    description: "Resumo do catálogo com cliques e visualizações dos últimos 30 dias.",
    inputSchema: {},
    handler: async (_a, ctx) => { const { s, sb } = await svc(ctx); return out(s.catalogReport(await s.loadRadar(sb))); },
  }),
  defineAppTool({
    name: "get_analytics", title: "Desempenho do site", enabled: onlyAdmin, annotations: RO,
    description: "Relatório de desempenho dos últimos N dias (cliques não são vendas).",
    inputSchema: { days: z.number().int().min(1).max(90).optional() },
    handler: async (a, ctx) => { const { s, sb } = await svc(ctx); return out(await s.analytics(sb, a.days ?? 30)); },
  }),
  defineAppTool({
    name: "check_expired_offers", title: "Ofertas vencidas", enabled: onlyAdmin, annotations: RO,
    description: "Lista oportunidades com dados vencidos.",
    inputSchema: {},
    handler: async (_a, ctx) => { const { s, sb } = await svc(ctx); return out(s.expiredReport(await s.loadRadar(sb))); },
  }),
  defineAppTool({
    name: "prepare_import", title: "Preparar importação", enabled: onlyAdmin,
    annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: false },
    description: "Gera prévia e um token de aprovação (15 min, uso único) para incluir oportunidades. Não cadastra nada.",
    inputSchema: { opportunity_ids: z.array(z.string().uuid()).min(1).max(20), publish: z.boolean().optional() },
    handler: async (a, ctx) => {
      const { s, sb, uid } = await svc(ctx);
      const r = await s.prepareImport(sb, uid, a.opportunity_ids, !!a.publish);
      await s.audit(sb, uid, "mcp", "prepare_import", { itens: a.opportunity_ids.length });
      return out(r);
    },
  }),
  defineAppTool({
    name: "confirm_import", title: "Confirmar importação", enabled: onlyAdmin,
    annotations: { readOnlyHint: false, idempotentHint: true, destructiveHint: false, openWorldHint: false },
    description: "Confirma uma importação preparada. Use SOMENTE depois que a administradora aprovar explicitamente a prévia.",
    inputSchema: { token: z.string().min(20).max(100) },
    handler: async (a, ctx) => {
      const { s, sb, uid } = await svc(ctx);
      try { return out(await s.confirmImport(sb, uid, a.token, "mcp")); } catch (e) { throw new ToolError((e as Error).message); }
    },
  }),
  defineAppTool({
    name: "generate_campaign", title: "Gerar campanha", enabled: onlyAdmin,
    annotations: { readOnlyHint: true, idempotentHint: false, openWorldHint: false },
    description: "Gera legendas, textos de WhatsApp, roteiros, stories, hashtags, links UTM e calendário. Nada é publicado.",
    inputSchema: { product_ids: z.array(z.string().uuid()).min(1).max(8), theme: z.string().max(100).optional() },
    handler: async (a, ctx) => { const { s, sb, uid } = await svc(ctx); const r = await s.generateCampaign(sb, a.product_ids, a.theme ?? ""); await s.audit(sb, uid, "mcp", "generate_campaign", {}); return out(r); },
  }),
  defineAppTool({
    name: "daily_sales_plan", title: "Plano diário", enabled: onlyAdmin, annotations: RO,
    description: "Plano de divulgação do dia com dados reais do Radar e do catálogo.",
    inputSchema: {},
    handler: async (_a, ctx) => { const { s, sb } = await svc(ctx); return out(await s.buildDailyPlan(sb)); },
  }),
];
