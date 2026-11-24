import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type IntegrationStatus = "not_configured" | "awaiting_authorization" | "connected" | "error";
const API_SLUGS = ["shopee", "mercadolivre"] as const;

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

async function assertAdmin(ctx: { supabase: SupabaseClient<Database>; userId: string }) {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (!data) throw new Error("Sem permissão para esta ação.");
}

/** Situação de cada loja: credencial presente no servidor + resultado do último teste real. */
export const listIntegrations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { shopeeConfigured } = await import("@/lib/marketplaces/shopee.server");
    const { mercadolivreConfigured } = await import("@/lib/marketplaces/mercadolivre.server");
    const configured: Record<string, boolean> = {
      shopee: shopeeConfigured(),
      mercadolivre: mercadolivreConfigured(),
      amazon: false,
      magalu: false,
    };
    const { data: rows } = await context.supabase.from("marketplace_integrations").select("*");
    return Object.entries(configured).map(([slug, has]) => {
      const row = (rows ?? []).find(
        (r: { marketplace_slug: string }) => r.marketplace_slug === slug,
      );
      const status: IntegrationStatus = !has
        ? "not_configured"
        : row?.status === "connected" || row?.status === "error"
          ? row.status
          : "awaiting_authorization";
      return {
        slug,
        configured: has,
        hasApi: (API_SLUGS as readonly string[]).includes(slug),
        status,
        lastCheckedAt: (row?.last_checked_at as string | null) ?? null,
        lastSyncAt: (row?.last_sync_at as string | null) ?? null,
        lastError: has ? ((row?.last_error as string | null) ?? null) : null,
      };
    });
  });

/** Testa a credencial com uma requisição real à API oficial e grava o resultado. */
export const testIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { slug: string }) => {
    if (!(API_SLUGS as readonly string[]).includes(d?.slug)) throw new Error("Loja sem API.");
    return { slug: d.slug as (typeof API_SLUGS)[number] };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    let status: IntegrationStatus = "connected";
    let error: string | null = null;
    try {
      if (data.slug === "shopee") {
        const s = await import("@/lib/marketplaces/shopee.server");
        if (!s.shopeeConfigured()) return { status: "not_configured" as const, error: null };
        await s.shopeeSearch("", 1, 1);
      } else {
        const m = await import("@/lib/marketplaces/mercadolivre.server");
        if (!m.mercadolivreConfigured()) return { status: "not_configured" as const, error: null };
        await m.mercadolivreAppToken();
      }
    } catch (e) {
      console.error("Integração", data.slug, (e as Error).message);
      status = "error";
      error = (e as Error).message.slice(0, 300);
    }
    await context.supabase.from("marketplace_integrations").upsert({
      marketplace_slug: data.slug,
      status,
      last_checked_at: new Date().toISOString(),
      last_error: error,
      updated_at: new Date().toISOString(),
    });
    return { status, error };
  });

/** Busca ofertas reais na Shopee (productOfferV2). Só funciona com credenciais válidas. */
export const searchShopeeOffers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { keyword: string; page?: number; sort?: number }) => ({
    keyword: String(d?.keyword ?? "").slice(0, 100),
    page: Math.min(Math.max(1, Number(d?.page) || 1), 50),
    sort: [1, 2, 3, 4, 5].includes(Number(d?.sort)) ? Number(d?.sort) : 2,
  }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const s = await import("@/lib/marketplaces/shopee.server");
    if (!s.shopeeConfigured())
      return { error: "A Shopee ainda não foi configurada.", nodes: [], hasNextPage: false };
    try {
      const r = await s.shopeeSearch(data.keyword, data.page, data.sort);
      await context.supabase.from("marketplace_integrations").upsert({
        marketplace_slug: "shopee",
        status: "connected",
        last_sync_at: new Date().toISOString(),
        last_error: null,
        updated_at: new Date().toISOString(),
      });
      return { error: null as string | null, nodes: r.nodes, hasNextPage: r.pageInfo.hasNextPage };
    } catch (e) {
      console.error("Shopee busca", (e as Error).message);
      return {
        error: "A Shopee recusou a consulta. Teste a conexão em Integrações.",
        nodes: [],
        hasNextPage: false,
      };
    }
  });

/** Teste autenticado (X-API-Key, só no servidor) do MCP do Afiliado + uma consulta real de amostra. */
export const testAfiliado = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const af = await import("@/lib/discovery/mcp-afiliado.server");
    const at = new Date().toISOString();
    if (!af.afConfigured())
      return {
        ok: false,
        at,
        error: "A chave MCP_AFILIADO_API_KEY não está configurada no servidor.",
        conta: null,
        conectados: [] as string[],
        pesquisaveis: [] as { site: string; monetized: boolean }[],
        amostra: null,
      };
    try {
      const b = await af.botInfo();
      const pesquisaveis = af.searchableSites(b);
      const conectados = [
        ...new Set([
          ...(b.search_sites ?? []),
          ...(b.convertible_routes?.by_provider ?? []).map((p) => p.provider),
        ]),
      ];
      let amostra: {
        site: string;
        consulta: string;
        itens: { nome: string; preco: number | null; url: string }[];
        erro: string | null;
      } | null = null;
      const site = pesquisaveis[0]?.site;
      if (site) {
        try {
          const items = await af.searchProducts({
            query: "fone bluetooth",
            site,
            sort: "relevance",
            limit: 3,
          });
          amostra = {
            site,
            consulta: "fone bluetooth",
            itens: items
              .filter((i) => i.title && i.url)
              .map((i) => ({
                nome: String(i.title).slice(0, 150),
                preco: i.price_number ?? null,
                url: String(i.url),
              })),
            erro: null,
          };
        } catch (e) {
          amostra = {
            site,
            consulta: "fone bluetooth",
            itens: [],
            erro: (e as Error).message.slice(0, 200),
          };
        }
      }
      return {
        ok: true,
        at,
        error: null as string | null,
        conta: (b as { bot?: { name?: string } }).bot?.name ?? null,
        conectados,
        pesquisaveis,
        amostra,
      };
    } catch (e) {
      const m = (e as Error).message;
      const msg = /invalid_api_key|401/.test(m)
        ? "Chave inválida ou revogada (401). Gere uma nova chave no painel do MCP do Afiliado e atualize o segredo."
        : /insufficient_scope|403/.test(m)
          ? "A chave é só de leitura (403). Gere uma chave com nível write."
          : `Falha ao consultar o MCP do Afiliado: ${m.slice(0, 200)}`;
      return {
        ok: false,
        at,
        error: msg,
        conta: null,
        conectados: [],
        pesquisaveis: [],
        amostra: null,
      };
    }
  });
