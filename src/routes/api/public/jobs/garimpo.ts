import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/** Chamada periódica: inicia o garimpo na hora configurada e avança um passo curto por chamada. */
export const Route = createFileRoute("/api/public/jobs/garimpo")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authFailure = await authenticateCronRequest(request);
        if (authFailure) return authFailure;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const g = await import("@/lib/garimpo/run.server");
        const { isDue } = await import("@/lib/garimpo/rules");
        try {
          let run = await g.activeRun(supabaseAdmin);
          if (!run) {
            const s = await g.loadSettings(supabaseAdmin);
            const { data: last } = await supabaseAdmin
              .from("garimpo_runs")
              .select("started_at")
              .eq("trigger", "agendada")
              .order("started_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            if (!isDue(s, last ? new Date(last.started_at) : null))
              return Response.json({ skipped: true });
            run = (await g.startGarimpo(supabaseAdmin, "agendada")).run;
          }
          if (!run) return Response.json({ skipped: true });
          const r = await g.stepGarimpo(supabaseAdmin, run.id, 2_500);
          return Response.json({ status: r.status, phase: r.phase });
        } catch (e) {
          console.error("Garimpo agendado:", (e as Error).message);
          return Response.json({ error: "falhou" }, { status: 500 });
        }
      },
    },
  },
});
