import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { AWIN_RELATIONSHIPS, type AwinRelationship, type AwinProgramme } from "./awin";

async function assertAdmin(ctx: { supabase: SupabaseClient<Database>; userId: string }) {
  const { data, error } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (error || !data) throw new Error("Sem permissão para esta ação.");
}

export const awinProgrammesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { relationship: AwinRelationship }) => {
    if (!AWIN_RELATIONSHIPS.includes(d?.relationship)) throw new Error("Situação inválida.");
    return { relationship: d.relationship };
  })
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const awin = await import("./awin.server");
    const at = new Date().toISOString();
    if (!awin.awinConfigured()) return { configured: false, ok: false, at, programmes: [] as AwinProgramme[], error: "Credenciais ainda não configuradas." };
    try {
      return { configured: true, ok: true, at, programmes: await awin.listAwinProgrammes(data.relationship), error: null as string | null };
    } catch (e) {
      return { configured: true, ok: false, at, programmes: [] as AwinProgramme[], error: e instanceof Error ? e.message.slice(0, 200) : "Falha na consulta." };
    }
  });

export const awinLinkFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { advertiserId: number; destination: string }) => {
    if (!Number.isSafeInteger(d?.advertiserId) || d.advertiserId <= 0 || typeof d.destination !== "string" || d.destination.length > 2000)
      throw new Error("Anunciante ou URL inválida.");
    return { advertiserId: d.advertiserId, destination: d.destination.trim() };
  })
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const awin = await import("./awin.server");
    try {
      return { url: await awin.generateAwinLink(data.advertiserId, data.destination), error: null as string | null };
    } catch (e) {
      return { url: null, error: e instanceof Error ? e.message.slice(0, 200) : "Falha ao gerar link." };
    }
  });

/** Consulta financeira exclusiva para administradores; não grava ou altera transações. */
export const awinFinanceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { days: number }) => {
    if (![7, 15, 30].includes(d?.days)) throw new Error("Período inválido.");
    return { days: d.days };
  })
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const awin = await import("./awin.server");
    const at = new Date().toISOString();
    if (!awin.awinConfigured()) return { report: null, at, error: "Configure AWIN_PUBLISHER_ID e AWIN_ACCESS_TOKEN nos Secrets do servidor." };
    try {
      return { report: await awin.awinFinancialReport(data.days), at, error: null as string | null };
    } catch (e) {
      // Não encaminhar erros de rede brutos, URLs ou credenciais ao navegador.
      const message = e instanceof Error && (e.message.startsWith("Awin ") || e.message.startsWith("Resposta inesperada")) ? e.message : "Não foi possível consultar as transações Awin.";
      return { report: null, at, error: message.slice(0, 200) };
    }
  });
