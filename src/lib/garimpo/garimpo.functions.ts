import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

async function assertAdmin(ctx: { supabase: SupabaseClient<Database>; userId: string }) {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (!data) throw new Error("Sem permissão para esta ação.");
}

/** Garimpar agora: inicia (ou retoma) e avança ~20s; a tela chama de novo até terminar. */
export const garimparAgora = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { runId?: string }) => ({ runId: typeof d?.runId === "string" ? d.runId : undefined }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const g = await import("./run.server");
    let id = data.runId;
    if (!id) {
      const r = await g.startGarimpo(context.supabase, "manual");
      if (!r.run) throw new Error("Não foi possível iniciar o garimpo.");
      id = r.run.id;
    }
    const run = await g.stepGarimpo(context.supabase, id, 20_000);
    return { id: run.id, status: run.status, phase: run.phase };
  });
