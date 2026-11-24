import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { AGENT_RUNS_PER_HOUR } from "./rules";

type Ctx = { supabase: import("./services.server").Sb; userId: string };
async function guard(c: Ctx) {
  const { isAdmin } = await import("./services.server");
  if (!(await isAdmin(c.supabase, c.userId))) throw new Error("Sem permissão para esta ação.");
}
const aiError = (e: unknown) => {
  const s = (e as { statusCode?: number })?.statusCode;
  console.error("Garimou IA:", e);
  return s === 429 ? "Muitos pedidos seguidos. Espere um pouco." : s === 402 ? "Os créditos de IA acabaram." : (e as Error)?.message?.startsWith("Sem permissão") ? "Sem permissão." : "Não foi possível concluir agora.";
};

export const askAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { question: string; history?: { role: "user" | "assistant"; text: string }[] }) => ({
    question: String(d?.question ?? "").slice(0, 1000),
    history: (d?.history ?? []).slice(-8).map((h) => ({ role: h.role === "assistant" ? ("assistant" as const) : ("user" as const), text: String(h.text).slice(0, 2000) })),
  }))
  .handler(async ({ data, context }) => {
    await guard(context);
    if (!data.question.trim()) return { error: "Escreva o pedido.", answer: "", cards: [], tools: [] as string[] };
    const { count } = await context.supabase.from("agent_audit").select("id", { count: "exact", head: true })
      .eq("action", "agent_run").eq("user_id", context.userId).gte("created_at", new Date(Date.now() - 3600_000).toISOString());
    if ((count ?? 0) >= AGENT_RUNS_PER_HOUR) return { error: `Limite de ${AGENT_RUNS_PER_HOUR} pedidos por hora atingido.`, answer: "", cards: [], tools: [] };
    const { runAgent } = await import("./agent.server");
    try { return { error: null as string | null, ...(await runAgent(context.supabase, context.userId, data.question, data.history)) }; }
    catch (e) { return { error: aiError(e), answer: "", cards: [], tools: [] }; }
  });

export const prepareImportFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { ids: string[]; publish: boolean }) => ({ ids: (d?.ids ?? []).map(String).slice(0, 20), publish: !!d?.publish }))
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
    try { return { error: null as string | null, ...(await s.confirmImport(context.supabase, context.userId, data.token, "painel")) }; }
    catch (e) { return { error: (e as Error).message, resultado: [] }; }
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
  .inputValidator((d: { ids: string[]; theme: string }) => ({ ids: (d?.ids ?? []).map(String).slice(0, 8), theme: String(d?.theme ?? "").slice(0, 100) }))
  .handler(async ({ data, context }) => {
    await guard(context);
    const s = await import("./services.server");
    try { const r = await s.generateCampaign(context.supabase, data.ids, data.theme); await s.audit(context.supabase, context.userId, "painel", "generate_campaign", { produtos: data.ids }); return { error: null as string | null, ...r }; }
    catch (e) { return { error: aiError(e) }; }
  });
