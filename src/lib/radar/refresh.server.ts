import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  MAX_REQUESTS_PER_RUN,
  REQUEST_GAP_MS,
  STALE_RUN_MIN,
  pagePlan,
  runStatus,
  shopeeToRow,
} from "./collect";

type Sb = SupabaseClient<Database>;
export type SourceReport = { source: string; status: string; count: number };

/** Uma execução do Radar: trava única, limite de requisições, gravação conferida e histórico. */
export async function runRadarRefresh(sb: Sb, trigger: "manual" | "agendada") {
  await sb
    .from("radar_runs")
    .update({
      status: "failed",
      finished_at: new Date().toISOString(),
      errors: ["Execução interrompida."],
    })
    .eq("status", "running")
    .lt("started_at", new Date(Date.now() - STALE_RUN_MIN * 60_000).toISOString());
  const { data: run, error: lockErr } = await sb
    .from("radar_runs")
    .insert({ trigger })
    .select("id")
    .single();
  if (lockErr) {
    if (lockErr.code === "23505")
      return { busy: true, report: [] as SourceReport[], status: "skipped" as const };
    throw new Error("Não foi possível iniciar a atualização.");
  }
  const { data: st } = await sb
    .from("radar_settings")
    .select("max_items")
    .eq("id", 1)
    .maybeSingle();
  const maxItems = st?.max_items ?? 100;
  const report: SourceReport[] = [];
  const errors: string[] = [];
  let items = 0;
  let requests = 0;
  let tried = 0;

  const s = await import("@/lib/marketplaces/shopee.server");
  if (!s.shopeeConfigured()) report.push({ source: "Shopee", status: "Não configurada", count: 0 });
  else {
    tried++;
    const sorts = [s.SHOPEE_SORT.maisVendidos, s.SHOPEE_SORT.maiorComissao];
    const pages = pagePlan(maxItems, sorts.length);
    const now = new Date();
    const rows = new Map<string, ReturnType<typeof shopeeToRow>>();
    let failed = false;
    outer: for (const sortType of sorts)
      for (let page = 1; page <= pages; page++) {
        if (requests >= MAX_REQUESTS_PER_RUN || rows.size >= maxItems) break outer;
        if (requests) await new Promise((r) => setTimeout(r, REQUEST_GAP_MS));
        requests++;
        try {
          const r = await s.shopeeRadarPage({ page, sortType });
          for (const n of r.nodes)
            if (rows.size < maxItems) {
              const x = shopeeToRow(n, now);
              rows.set(x.external_id, x);
            }
          if (!r.pageInfo.hasNextPage) break;
        } catch (e) {
          failed = true;
          errors.push(`Shopee: ${(e as Error).message.slice(0, 200)}`);
          break outer;
        }
      }
    let saved = 0;
    if (rows.size) {
      const { error } = await sb
        .from("radar_opportunities")
        .upsert([...rows.values()], { onConflict: "marketplace_slug,external_id" });
      if (error) errors.push("Shopee: falha ao gravar no banco.");
      else saved = rows.size;
    }
    items += saved;
    report.push({
      source: "Shopee",
      status: saved ? (failed ? "Parcial" : "Atualizada") : "Erro na consulta",
      count: saved,
    });
  }

  const af = await import("@/lib/discovery/mcp-afiliado.server");
  if (!af.afConfigured())
    report.push({ source: "MCP do Afiliado", status: "Não configurado", count: 0 });
  else {
    tried++;
    try {
      const { discoverExternal } = await import("@/lib/agent/services.server");
      const r = await discoverExternal(sb, "tendencia", undefined, 30);
      const n = r.fontes
        .filter((f) => f.fonte.startsWith("MCP do Afiliado"))
        .reduce((a, f) => a + f.itens, 0);
      requests += r.fontes.length * 3 + 1;
      items += n;
      report.push({
        source: "MCP do Afiliado",
        status: n ? "Atualizada" : "Sem resultados",
        count: n,
      });
      if (r.semIntegracao) errors.push(`MCP do Afiliado: ${r.limitacoes[0] ?? "sem lojas"}`);
    } catch (e) {
      errors.push(`MCP do Afiliado: ${(e as Error).message.slice(0, 200)}`);
      report.push({ source: "MCP do Afiliado", status: "Erro na consulta", count: 0 });
    }
  }

  const m = await import("@/lib/marketplaces/mercadolivre.server");
  report.push({
    source: "Mercado Livre",
    status: m.mercadolivreConfigured()
      ? "Credenciais salvas, falta autorizar a conta"
      : "Não configurada",
    count: 0,
  });

  const status = runStatus(items, errors.length, tried);
  const { error: finErr } = await sb
    .from("radar_runs")
    .update({
      status,
      finished_at: new Date().toISOString(),
      items,
      requests,
      sources: report,
      errors,
    })
    .eq("id", run.id);
  if (finErr) console.error("Radar: não registrou o fim da execução", finErr.message);
  return { busy: false, report, status };
}
