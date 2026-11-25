/** Garimpo automático: execução em passos curtos (trava única, limite de consultas, progresso real). */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { classifyCategory } from "@/lib/radar/engine";
import { emptyDraft } from "@/lib/import/rules";
import { importOneWith } from "@/lib/import/importer-core";
import {
  CREATE_PER_STEP,
  STALE_RUN_MIN,
  buildPlan,
  discardReason,
  runStatusOf,
  type GarimpoSettings,
  type PlanStep,
} from "./rules";

type Sb = SupabaseClient<Database>;
type Run = Database["public"]["Tables"]["garimpo_runs"]["Row"];

export async function loadSettings(sb: Sb): Promise<GarimpoSettings> {
  const { data } = await sb.from("garimpo_settings").select("*").eq("id", 1).maybeSingle();
  if (!data) throw new Error("Configuração do garimpo não encontrada.");
  return { ...data, min_commission_pct: data.min_commission_pct, min_discount_pct: data.min_discount_pct };
}

async function releaseStale(sb: Sb) {
  await sb
    .from("garimpo_runs")
    .update({ status: "failed", phase: "done", finished_at: new Date().toISOString(), errors: ["Execução interrompida."] })
    .eq("status", "running")
    .lt("updated_at", new Date(Date.now() - STALE_RUN_MIN * 60_000).toISOString());
}

export async function activeRun(sb: Sb) {
  await releaseStale(sb);
  const { data } = await sb.from("garimpo_runs").select("*").eq("status", "running").maybeSingle();
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
  if (!af.afConfigured()) errors.push("MCP do Afiliado não configurado.");
  else {
    try {
      const sites = af.searchableSites(await af.botInfo());
      const { data: cats } = await sb.from("categories").select("name").eq("is_active", true);
      const kws = s.keywords.length ? s.keywords : [...d.DEFAULT_KEYWORDS, ...(cats ?? []).map((c) => c.name)];
      plan = buildPlan(sites, kws, s);
      for (const x of sites)
        sources.push({ fonte: `MCP do Afiliado · ${x.site}`, status: x.monetized ? "com comissão" : "sem comissão na conta" });
      if (!sites.length) errors.push("Nenhuma loja pesquisável no MCP do Afiliado.");
    } catch (e) {
      errors.push(`MCP do Afiliado: ${(e as Error).message.slice(0, 160)}`);
    }
  }
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

/** Avança a execução até o orçamento de tempo acabar. Cada passo grava o progresso. */
export async function stepGarimpo(sb: Sb, runId: string, budgetMs: number) {
  const t0 = Date.now();
  const { data: r0 } = await sb.from("garimpo_runs").select("*").eq("id", runId).maybeSingle();
  if (!r0) throw new Error("Execução não encontrada.");
  let run: Run = r0;
  if (run.status !== "running") return run;
  const s = await loadSettings(sb);
  const save = async (patch: Partial<Run>) => {
    const { data, error } = await sb
      .from("garimpo_runs")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", runId)
      .select("*")
      .single();
    if (error) throw new Error("Não foi possível registrar o progresso.");
    run = data;
  };
  const af = await import("@/lib/discovery/mcp-afiliado.server");
  const d = await import("@/lib/discovery/mcp-afiliado");
  const plan = run.plan as PlanStep[];

  while (Date.now() - t0 < budgetMs && run.status === "running") {
    if (run.phase === "search") {
      const step = plan[run.cursor];
      if (!step) {
        await save({ phase: "convert", cursor: 0 });
        continue;
      }
      const errors = [...run.errors];
      const reasons = { ...(run.discard_reasons as Record<string, number>) };
      let discarded = run.discarded;
      let found = run.found;
      const ids = new Set(run.candidates);
      try {
        const items = await af.searchProducts({ query: step.keyword, site: step.site, sort: "sales_desc", limit: 8 });
        const rows = items
          .map((it) => d.afToRow({ ...it, site: it.site ?? step.site }, step.monetized))
          .filter((x): x is NonNullable<typeof x> => !!x);
        found += rows.length;
        const keep = rows.filter((x) => {
          const why = discardReason(x, s);
          if (why) {
            discarded++;
            reasons[why] = (reasons[why] ?? 0) + 1;
          }
          return !why;
        });
        if (keep.length) {
          const { data: saved, error } = await sb
            .from("radar_opportunities")
            .upsert(keep, { onConflict: "marketplace_slug,external_id" })
            .select("id");
          if (error) errors.push(`${step.site}/${step.keyword}: falha ao gravar no Radar.`);
          else saved?.forEach((x) => ids.add(x.id));
        }
      } catch (e) {
        errors.push(`${step.site}/${step.keyword}: ${(e as Error).message.slice(0, 120)}`);
      }
      await save({
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
        ? await sb.from("radar_opportunities").select("id,external_id,affiliate_url,signals").in("id", run.candidates)
        : { data: [], error: null };
      if (readError) throw new Error("Não foi possível consultar as oportunidades para conversão.");
      const need = (opp ?? []).filter((o) => !o.affiliate_url && !o.signals.includes("sem_comissao_na_conta"));
      if (need.length) {
        try {
          const m = await af.convertLinks(need.map((o) => o.external_id));
          for (const o of need) {
            const link = m.get(o.external_id);
            if (link && link !== o.external_id && /^https:\/\//i.test(link)) {
              const { error } = await sb.from("radar_opportunities").update({ affiliate_url: link }).eq("id", o.id);
              if (error) errors.push("Não foi possível salvar um link convertido no Radar.");
            }
          }
        } catch (e) {
          errors.push(`Conversão de links: ${(e as Error).message.slice(0, 120)}`);
        }
      }
      await save({ phase: "create", cursor: 0, errors, requests: run.requests + (need.length ? 1 : 0) });
    } else if (run.phase === "create") {
      await createBatch(sb, run, s, save);
    } else break;
  }
  return run;
}

async function createBatch(sb: Sb, run: Run, s: GarimpoSettings, save: (p: Partial<Run>) => Promise<void>) {
  const { data: opp, error: readError } = run.candidates.length
    ? await sb.from("radar_opportunities").select("*").in("id", run.candidates)
        .order("sales", { ascending: false, nullsFirst: false }).order("id")
    : { data: [], error: null };
  if (readError) throw new Error("Não foi possível consultar as oportunidades para pré-cadastro.");
  const list = opp ?? [];
  const slice = list.slice(run.cursor, run.cursor + CREATE_PER_STEP);
  let { queued, unmonetized, duplicates } = run;
  const created = [...run.created_ids];
  const errors = [...run.errors];
  if (slice.length && queued < s.daily_limit) {
    const [mks, cats] = await Promise.all([sb.from("marketplaces").select("*"), sb.from("categories").select("*")]);
    const noAi = async () => ({ error: null, description: "", tags: [] as string[] });
    for (const o of slice) {
      if (queued >= s.daily_limit) break;
      if (!o.affiliate_url || o.affiliate_url === o.external_id) {
        unmonetized++;
        continue;
      }
      if (!o.valid_until || !(new Date(o.valid_until).getTime() > Date.now())) {
        if (errors.length < 30) errors.push(`${o.name.slice(0, 50)}: oferta vencida; consulte novamente.`);
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
      const out = await importOneWith(
        sb,
        dr,
        { publish: false, defaultCategoryId: null, useAi: false, garimpoRunId: run.id },
        { mks: mks.data ?? [], cats: cats.data ?? [], genCopy: noAi },
      );
      if (out.status === "duplicate") duplicates++;
      else if (out.status === "created" && out.productId) {
        created.push(out.productId);
        queued++;
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
    unmonetized: done ? unmonetized + Math.max(0, list.slice(cursor).filter((o) => !o.affiliate_url).length) : unmonetized,
    duplicates,
    created_ids: created,
    errors,
    ...(done
      ? {
          phase: "done",
          status: runStatusOf(errors.length, queued, run.found),
          finished_at: new Date().toISOString(),
        }
      : {}),
  });
}
