import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { AGENT_RUNS_PER_HOUR } from "./rules";
import { PRESET_MODE } from "@/lib/discovery/mcp-afiliado";

type Ctx = { supabase: import("./services.server").Sb; userId: string };
async function guard(c: Ctx) {
  const { isAdmin } = await import("./services.server");
  if (!(await isAdmin(c.supabase, c.userId))) throw new Error("Sem permissão para esta ação.");
}
const aiError = (e: unknown) => {
  const s = (e as { statusCode?: number })?.statusCode;
  console.error("Garimou IA:", e);
  return s === 429
    ? "Muitos pedidos seguidos. Espere um pouco."
    : s === 402
      ? "Os créditos de IA acabaram."
      : (e as Error)?.message?.startsWith("Sem permissão")
        ? "Sem permissão."
        : "Não foi possível concluir agora.";
};

export const askAgent = createServerFn({ method: "POST" })
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
    await guard(context);
    if (!data.question.trim())
      return {
        error: "Escreva o pedido.",
        answer: "",
        cards: [],
        tools: [] as string[],
        sources: [] as string[],
        limitations: [] as string[],
        noIntegration: false,
      };
    const { count } = await context.supabase
      .from("agent_audit")
      .select("id", { count: "exact", head: true })
      .eq("action", "agent_run")
      .eq("user_id", context.userId)
      .gte("created_at", new Date(Date.now() - 3600_000).toISOString());
    if ((count ?? 0) >= AGENT_RUNS_PER_HOUR)
      return {
        error: `Limite de ${AGENT_RUNS_PER_HOUR} pedidos por hora atingido.`,
        answer: "",
        cards: [],
        tools: [],
        sources: [],
        limitations: [],
        noIntegration: false,
      };
    try {
      // Atalhos comerciais usam a API e o ranking determinístico, sem chamar o modelo pago.
      const mode = Object.hasOwn(PRESET_MODE, data.question.trim())
        ? PRESET_MODE[data.question.trim()]
        : undefined;
      if (mode) {
        const svc = await import("./services.server");
        const r = await svc.discoverExternal(context.supabase, mode);
        await svc.audit(context.supabase, context.userId, "painel", "agent_run", {
          pergunta: data.question.slice(0, 200),
          ferramentas: ["discover_products"],
          modo: "sem_ia",
        });
        const novos = r.cards.filter(
          (c) => !c.no_catalogo && !c.vencido && c.tem_link_afiliada,
        ).length;
        return {
          error: null as string | null,
          answer: r.semIntegracao
            ? "Pesquisa externa indisponível. Confira as integrações e as limitações abaixo."
            : r.cards.length
              ? `Pesquisa real concluída: ${r.cards.length} oportunidades exibidas, ${novos} novas com link de afiliada. Revise os dados nos cards antes de incluir no catálogo. Pesquisa e classificação sem uso do modelo de IA.`
              : "Nenhuma oportunidade válida retornou das fontes consultadas. Confira as limitações e tente outras categorias.",
          cards: r.cards,
          tools: ["discover_products"],
          sources: r.fontes.map((f) => `${f.fonte}: ${f.status} (${f.itens})`),
          limitations: r.limitacoes,
          noIntegration: r.semIntegracao,
        };
      }
      const { runAgent } = await import("./agent.server");
      return {
        error: null as string | null,
        ...(await runAgent(
          context.supabase,
          context.userId,
          data.question,
          data.history,
          undefined,
        )),
      };
    } catch (e) {
      return {
        error: aiError(e),
        answer: "",
        cards: [],
        tools: [],
        sources: [],
        limitations: [],
        noIntegration: false,
      };
    }
  });

export const prepareImportFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { ids: string[]; publish: boolean }) => ({
    ids: (d?.ids ?? []).map(String).slice(0, 20),
    publish: !!d?.publish,
  }))
  .handler(async ({ data, context }) => {
    await guard(context);
    const s = await import("./services.server");
    return s.prepareImport(context.supabase, context.userId, data.ids, data.publish);
  });

export const confirmImportFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { token: string }) => ({ token: String(d?.token ?? "").slice(0, 100) }))
  .handler(async ({ data, context }) => {
    await guard(context);
    const s = await import("./services.server");
    try {
      return {
        error: null as string | null,
        ...(await s.confirmImport(context.supabase, context.userId, data.token, "painel")),
      };
    } catch (e) {
      return { error: (e as Error).message, resultado: [] };
    }
  });

export const runDailyPlanFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await guard(context);
    const s = await import("./services.server");
    const r = await s.runDailyPlan(context.supabase, "manual", context.userId);
    return r.ok ? { error: null } : { error: r.error };
  });

export const campaignFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { ids: string[]; theme: string }) => ({
    ids: (d?.ids ?? []).map(String).slice(0, 8),
    theme: String(d?.theme ?? "").slice(0, 100),
  }))
  .handler(async ({ data, context }) => {
    await guard(context);
    const s = await import("./services.server");
    try {
      const r = await s.generateCampaign(context.supabase, data.ids, data.theme);
      await s.audit(context.supabase, context.userId, "painel", "generate_campaign", {
        produtos: data.ids,
      });
      return { error: null as string | null, ...r };
    } catch (e) {
      return { error: aiError(e) };
    }
  });
