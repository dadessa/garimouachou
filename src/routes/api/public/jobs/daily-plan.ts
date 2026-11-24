import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

export const Route = createFileRoute("/api/public/jobs/daily-plan")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authFailure = await authenticateCronRequest(request);
        if (authFailure) return authFailure;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: p } = await supabaseAdmin.from("commercial_preferences").select("daily_plan_enabled").eq("id", 1).maybeSingle();
        if (!p?.daily_plan_enabled) return Response.json({ skipped: "desligado" });
        const { runDailyPlan } = await import("@/lib/agent/services.server");
        const r = await runDailyPlan(supabaseAdmin, "agendada", null);
        return Response.json({ ok: r.ok });
      },
    },
  },
});
