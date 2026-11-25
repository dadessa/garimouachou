/** Garimpo automático: execução em passos curtos (trava única, limite de consultas, progresso real). */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { classifyCategory } from "@/lib/radar/engine";
import { emptyDraft } from "@/lib/import/rules";
import { importOneWith } from "@/lib/import/importer-core";
import { claimStepLease, hasStepLease, stepLeaseUntil, StepLeaseLostError } from "./step-lock";
import {
  CREATE_PER_STEP,
  STALE_RUN_MIN,
  buildPlan,
  blockedSearchMessage,
  isSearchBlocked,
  discardReason,
  runStatusOf,
  searchSources,
  type SearchSource,
  type GarimpoSettings,
  type PlanStep,
} from "./rules";

type Sb = SupabaseClient<Database>;
type Run = Database["public"]["Tables"]["garimpo_runs"]["Row"];

export async function loadSettings(sb: Sb): Promise<GarimpoSettings> {
  const { data, error } = await sb.from("garimpo_settings").select("*").eq("id", 1).maybeSingle();
  if (error || !data) throw new Error("Configuração do garimpo não encontrada.");
  return {
    ...data,
    min_commission_pct: data.min_commission_pct,
    min_discount_pct: data.min_discount_pct,
  };
}

async function releaseStale(sb: Sb) {
  const { error } = await sb
    .from("garimpo_runs")
    .update({
      status: "failed",
      phase: "done",
      finished_at: new Date().toISOString(),
      errors: ["Execução interrompida."],
    })
    .eq("status", "running")
    .lt("updated_at", new Date(Date.now() - STALE_RUN_MIN * 60_000).toISOString());
  if (error) throw new Error("Não foi possível verificar execuções interrompidas.");
}

export async function activeRun(sb: Sb) {
  await releaseStale(sb);
  const { data, error } = await sb
    .from("garimpo_runs")
    .select("*")
    .eq("status", "running")
    .maybeSingle();
  if (error) throw new Error("Não foi possível consultar o garimpo ativo.");
  return data;
}

/** Inicia uma execução. Devolve a ativa quando já existe uma (trava única no banco). */
export async function startGarimpo(sb: Sb, trigger: "manual" | "agendada") {
  const cur = await activeRun(sb);
  if (cur) return { run: cur, busy: true };
  const s = await loadSettings(sb);
  const af = await import("@/lib/discovery/mcp-afiliado.server");
  const d = await import("@/lib/discovery/mcp-afiliado");
  const errors: string[] = [];
  let plan: PlanStep[] = [];
  const sources: { fonte: string; status: string }[] = [];
  const shopee = await import("@/lib/marketplaces/shopee.server");
  let mcpSites: SearchSource[] = [];
  if (af.afConfigured()) {
    try {
      mcpSites = af.searchableSites(await af.botInfo(8000));
    } catch {
      errors.push("MCP do Afiliado: não foi possível consultar as lojas da conta.");
    }
  } else {
    sources.push({ fonte: "MCP do Afiliado", status: "Não configurado" });
  }
  const sites = searchSources(mcpSites, shopee.shopeeConfigured());
  const { data: cats } = await sb.from("categories").select("name").eq("is_active", true);
  const kws = s.keywords.length
    ? s.keywords
    : [...d.DEFAULT_KEYWORDS, ...(cats ?? []).map((c) => c.name)];
  let trending: string[] = [];
  if (!s.keywords.length) {
    const { fetchGoogleTrends } = await import("@/lib/discovery/google-trends.server");
    const trends = await fetchGoogleTrends();
    trending = trends.keywords;
    sources.push({
      fonte: "Google Trends BR (RSS)",
      status: trends.ok
        ? trending.length
          ? `Consultado em ${trends.checkedAt}; termos comerciais: ${trending.join(", ")}`
          : "Consultado; sem termos comerciais elegíveis"
        : "Indisponível; usando palavras-chave padrão",
    });
  } else {
    sources.push({
      fonte: "Google Trends BR (RSS)",
      status: "Não consultado: palavras-chave manuais configuradas",
    });
  }
  plan = buildPlan(sites, kws, s, new Date(), trending);
  for (const x of sites)
    sources.push({
      fonte: x.provider === "shopee_api" ? "Shopee API oficial" : `MCP do Afiliado · ${x.site}`,
      status: x.monetized ? "com comissão" : "sem comissão na conta",
    });
  if (!sites.length)
    errors.push("Nenhuma fonte pesquisável disponível. Confira as integrações.");
  else if (!plan.length)
    errors.push(
      "Nenhuma loja pesquisável corresponde à configuração. Revise Lojas prioritárias.",
    );
  const failed = !plan.length;
  const { data: run, error } = await sb
    .from("garimpo_runs")
    .insert({
      trigger,
      plan,
      sources,
      errors,
      ...(failed ? { status: "failed", phase: "done", finished_at: new Date().toISOString() } : {}),
    })
    .select("*")
    .single();
  if (error) {
    if (error.code === "23505") return { run: await activeRun(sb), busy: true };
    throw new Error("Não foi possível iniciar o garimpo.");
  }
  return { run, busy: false };
}

/** Cada chamada disputa uma concessão temporária (lease) persistida em updated_at.
 * A atualização condicional é atômica no Postgres e funciona entre instâncias do servidor.
 */
export async function stepGarimpo(sb: Sb, runId: string, budgetMs: number) {
  const { data: r0, error: readError } = await sb
    .from("garimpo_runs")
    .select("*")
    .eq("id", runId)
    .maybeSingle();
  if (readError || !r0) throw new Error("Execução não encontrada.");
  if (r0.status !== "running") return { run: r0, busy: false };
  const leased = await claimStepLease(r0, async (expected, until) => {
    const { data, error } = await sb
      .from("garimpo_runs")
      .update({ updated_at: until })
      .eq("id", runId)
      .eq("status", "running")
      .eq("updated_at", expected)
      .select("*")
      .maybeSingle();
    if (error) throw new Error("Não foi possível obter a trava do garimpo.");
    return data;
  });
  if (!leased) return { run: r0, busy: true };

  let run: Run = leased;
  const save = async (patch: Partial<Run>) => {
    if (!hasStepLease(run.updated_at)) throw new StepLeaseLostError();
    const finished = patch.status != null && patch.status !== "running";
    const { data, error } = await sb
      .from("garimpo_runs")
      .update({
        ...patch,
        updated_at: finished ? new Date().toISOString() : stepLeaseUntil(run.updated_at),
      })
      .eq("id", runId)
      .eq("status", "running")
      .eq("updated_at", run.updated_at)
      .select("*")
      .maybeSingle();
    if (error || !data) throw new StepLeaseLostError();
    run = data;
  };
  const ensureLease = async () => {
    if (!hasStepLease(run.updated_at)) throw new StepLeaseLostError();
    // Renovar antes de efeitos externos quando estiver perto do vencimento.
    if (new Date(run.updated_at).getTime() - Date.now() < 60_000) await save({});
  };
  try {
    await advanceGarimpo(sb, () => run, save, ensureLease, budgetMs);
    return { run, busy: false };
  } catch (e) {
    if (e instanceof StepLeaseLostError) return { run, busy: true };
    throw e;
  } finally {
    // Nunca liberar a trava de outro worker. Se o processo cair, ela vence sozinha.
    if (run.status === "running") {
      try {
        const { error } = await sb
          .from("garimpo_runs")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", runId)
          .eq("status", "running")
          .eq("updated_at", run.updated_at);
        if (error) console.error("Garimpo: não foi possível liberar a trava.");
      } catch {
        console.error("Garimpo: a trava será liberada por expiração.");
      }
    }
  }
}

async function advanceGarimpo(
  sb: Sb,
  current: () => Run,
  save: (patch: Partial<Run>) => Promise<void>,
  ensureLease: () => Promise<void>,
  budgetMs: number,
) {
  const t0 = Date.now();
  const s = await loadSettings(sb);
  let run = current();
  const af = await import("@/lib/discovery/mcp-afiliado.server");
  const d = await import("@/lib/discovery/mcp-afiliado");
  const plan = run.plan as PlanStep[];

  while (Date.now() - t0 < budgetMs && run.status === "running") {
    await ensureLease();
    run = current();
    if (run.phase === "search") {
      const step = plan[run.cursor];
      if (!step) {
        await save({ phase: "convert", cursor: 0 });
        run = current();
        continue;
      }
      const errors = [...run.errors];
      if (isSearchBlocked(step.site, errors)) {
        // A suspensão fica no checkpoint, inclusive entre chamadas manuais e agendadas.
        await save({ cursor: run.cursor + 1 });
        run = current();
        continue;
      }
      const reasons = { ...(run.discard_reasons as Record<string, number>) };
      let discarded = run.discarded;
      let found = run.found;
      const ids = new Set(run.candidates);
      let successful = false;
      try {
        let rows: Database["public"]["Tables"]["radar_opportunities"]["Insert"][];
        if (step.provider === "shopee_api") {
          const shopee = await import("@/lib/marketplaces/shopee.server");
          const { shopeeToRow } = await import("@/lib/radar/collect");
          const result = await shopee.shopeeRadarPage({
            keyword: step.keyword,
            page: 1,
            sortType: shopee.SHOPEE_SORT.maisVendidos,
            limit: 8,
            timeoutMs: 10_000,
          });
          if (!Array.isArray(result?.nodes)) throw new Error("Resposta inválida da Shopee.");
          rows = result.nodes
            .filter((n) => typeof n.productName === "string" && n.productName.trim())
            .map((n) => {
              const row = shopeeToRow(n, new Date());
              return {
                ...row,
                affiliate_url: d.safeHttps(n.offerLink) ? n.offerLink : null,
                original_price_cents: null,
                signals: [],
              };
            });
        } else {
          const items = await af.searchProducts(
            {
              query: step.keyword,
              site: step.site,
              sort: "sales_desc",
              limit: 8,
            },
            10_000,
          );
          rows = items
            .filter((it) => !it.site || it.site.toLowerCase() === step.site.toLowerCase())
            .map((it) => d.afToRow({ ...it, site: step.site }, step.monetized))
            .filter((x): x is NonNullable<typeof x> => !!x);
        }
        found += rows.length;
        const keep = rows.filter((x) => {
          const why = discardReason(
            {
              marketplace_slug: x.marketplace_slug,
              price_cents: x.price_cents ?? null,
              discount_pct: x.discount_pct ?? null,
              commission_rate: x.commission_rate ?? null,
            },
            s,
          );
          if (why) {
            discarded++;
            reasons[why] = (reasons[why] ?? 0) + 1;
          }
          return !why;
        });
        if (keep.length) {
          await ensureLease();
          const { data: saved, error } = await sb
            .from("radar_opportunities")
            .upsert(keep, { onConflict: "marketplace_slug,external_id" })
            .select("id");
          if (error) errors.push(`${step.site}/${step.keyword}: falha ao gravar no Radar.`);
          else {
            saved?.forEach((x) => ids.add(x.id));
            successful = true;
          }
        } else successful = true;
      } catch (e) {
        if (e instanceof StepLeaseLostError) throw e;
        const message = e instanceof Error ? e.message : "";
        const blocked = blockedSearchMessage(step.site, message);
        errors.push(blocked ?? `${step.site}/${step.keyword}: falha na consulta à fonte.`);
      }
      const sources = run.sources as { fonte: string; status: string; successes?: number }[];
      const source = step.provider === "shopee_api" ? "Shopee API oficial" : `MCP do Afiliado · ${step.site}`;
      await save({
        sources: sources.map((item) =>
          item.fonte === source && successful
            ? { ...item, successes: (item.successes ?? 0) + 1 }
            : item,
        ),
        cursor: run.cursor + 1,
        requests: run.requests + 1,
        found,
        discarded,
        discard_reasons: reasons,
        candidates: [...ids],
        errors,
      });
    } else if (run.phase === "convert") {
      // Gera links da conta só onde o MCP do Afiliado tem rota autorizada; falha = pendência.
      const errors = [...run.errors];
      const { data: opp, error: readError } = run.candidates.length
        ? await sb
            .from("radar_opportunities")
            .select("id,external_id,affiliate_url,signals,source")
            .in("id", run.candidates)
        : { data: [], error: null };
      if (readError) throw new Error("Não foi possível consultar as oportunidades para conversão.");
      const need = (opp ?? []).filter(
        (o) =>
          o.source === "mcp_afiliado" &&
          !o.affiliate_url &&
          !o.signals.includes("sem_comissao_na_conta"),
      );
      if (need.length) {
        try {
          const m = await af.convertLinks(need.map((o) => o.external_id));
          for (const o of need) {
            const link = m.get(o.external_id);
            if (link && link !== o.external_id && /^https:\/\//i.test(link)) {
              await ensureLease();
              const { error } = await sb
                .from("radar_opportunities")
                .update({ affiliate_url: link })
                .eq("id", o.id);
              if (error) errors.push("Não foi possível salvar um link convertido no Radar.");
            }
          }
        } catch (e) {
          if (e instanceof StepLeaseLostError) throw e;
          errors.push(`Conversão de links: ${(e as Error).message.slice(0, 120)}`);
        }
      }
      await save({
        phase: "create",
        cursor: 0,
        errors,
        requests: run.requests + (need.length ? 1 : 0),
      });
    } else if (run.phase === "create") {
      await createBatch(sb, run, s, save, ensureLease);
    } else break;
    run = current();
  }
}

async function createBatch(
  sb: Sb,
  run: Run,
  s: GarimpoSettings,
  save: (p: Partial<Run>) => Promise<void>,
  ensureLease: () => Promise<void>,
) {
  const { data: opp, error: readError } = run.candidates.length
    ? await sb
        .from("radar_opportunities")
        .select("*")
        .in("id", run.candidates)
        .order("sales", { ascending: false, nullsFirst: false })
        .order("id")
    : { data: [], error: null };
  if (readError) throw new Error("Não foi possível consultar as oportunidades para pré-cadastro.");
  const list = opp ?? [];
  const slice = list.slice(run.cursor, run.cursor + CREATE_PER_STEP);
  let { queued, unmonetized, duplicates } = run;
  // Recupera cadastros gravados antes de uma interrupção no checkpoint da execução.
  const { data: existing, error: existingError } = await sb
    .from("products")
    .select("id")
    .eq("garimpo_run_id", run.id);
  if (existingError) throw new Error("Não foi possível reconciliar os pré-cadastros.");
  const created = [...new Set([...run.created_ids, ...(existing ?? []).map((p) => p.id)])];
  queued = Math.max(queued, created.length);
  const errors = [...run.errors];
  if (slice.length && queued < s.daily_limit) {
    const [mks, cats] = await Promise.all([
      sb.from("marketplaces").select("*"),
      sb.from("categories").select("*"),
    ]);
    if (mks.error || cats.error) throw new Error("Não foi possível consultar lojas e categorias.");
    const noAi = async () => ({ error: null, description: "", tags: [] as string[] });
    for (const o of slice) {
      if (queued >= s.daily_limit) break;
      if (
        !o.affiliate_url ||
        o.affiliate_url === o.external_id ||
        o.signals.includes("sem_comissao_na_conta")
      ) {
        unmonetized++;
        continue;
      }
      if (!o.valid_until || !(new Date(o.valid_until).getTime() > Date.now())) {
        if (errors.length < 30)
          errors.push(`${o.name.slice(0, 50)}: oferta vencida; consulte novamente.`);
        continue;
      }
      const dr = emptyDraft(o.affiliate_url);
      dr.name = o.name.slice(0, 200);
      dr.imageUrl = o.image_url;
      dr.externalId = o.external_id;
      dr.fromApi = true;
      dr.priceCents = o.valid_until && new Date(o.valid_until) > new Date() ? o.price_cents : null;
      dr.priceCheckedAt = o.fetched_at;
      dr.categoryId = classifyCategory(o.name, o.category, cats.data ?? [])?.id ?? null;
      await ensureLease();
      const out = await importOneWith(
        sb,
        dr,
        { publish: false, defaultCategoryId: null, useAi: false, garimpoRunId: run.id },
        { mks: mks.data ?? [], cats: cats.data ?? [], genCopy: noAi },
      );
      if (out.status === "duplicate") {
        if (!out.productId || !created.includes(out.productId)) duplicates++;
      } else if (out.status === "created" && out.productId) {
        if (!created.includes(out.productId)) {
          created.push(out.productId);
          queued++;
        }
      } else if (out.status === "error") {
        // Loja não cadastrada no catálogo etc.: oportunidade fica no Radar como pendência.
        if (errors.length < 30) errors.push(`${o.name.slice(0, 50)}: ${out.message}`);
      }
    }
  }
  const cursor = run.cursor + CREATE_PER_STEP;
  const done = cursor >= list.length || queued >= s.daily_limit;
  await save({
    cursor,
    queued,
    unmonetized: done
      ? unmonetized + Math.max(0, list.slice(cursor).filter((o) => !o.affiliate_url).length)
      : unmonetized,
    duplicates,
    created_ids: created,
    errors,
    ...(done
      ? {
          phase: "done",
          status: runStatusOf(
            errors.length,
            queued,
            run.found,
            (run.sources as { successes?: number }[]).reduce((n, x) => n + (x.successes ?? 0), 0),
          ),
          finished_at: new Date().toISOString(),
        }
      : {}),
  });
}
