import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

export const Route = createFileRoute("/api/public/jobs/radar")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authFailure = await authenticateCronRequest(request);
        if (authFailure) return authFailure;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: st } = await supabaseAdmin
          .from("radar_settings")
          .select("daily_enabled")
          .eq("id", 1)
          .maybeSingle();
        if (!st?.daily_enabled) return Response.json({ skipped: "desligada" });
        const { runRadarRefresh } = await import("@/lib/radar/refresh.server");
        try {
          const r = await runRadarRefresh(supabaseAdmin, "agendada");
          return Response.json({ status: r.status, busy: r.busy });
        } catch (e) {
          console.error("Radar agendado:", (e as Error).message);
          return Response.json({ error: "falhou" }, { status: 500 });
        }
      },
    },
  },
});
