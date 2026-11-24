import { createFileRoute } from "@tanstack/react-router";
import {
  dedupKey,
  isBot,
  needsProduct,
  referrerHost,
  trackSchema,
} from "@/lib/analytics/event-rules";

const ok = () => new Response(null, { status: 204 });

/** Recebe eventos anônimos do site. Valida tudo no servidor; nunca guarda IP, nome ou e-mail. */
export const Route = createFileRoute("/api/public/track")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          if (isBot(request.headers.get("user-agent"))) return ok();
          const origin = request.headers.get("origin");
          const host = new URL(request.url).host;
          if (origin && new URL(origin).host !== host) return new Response(null, { status: 403 });
          const raw = await request.text();
          if (raw.length > 2000) return new Response(null, { status: 413 });
          const parsed = trackSchema.safeParse(JSON.parse(raw));
          if (!parsed.success) return new Response(null, { status: 400 });
          const e = parsed.data;
          if (needsProduct(e.type) && !e.slug) return new Response(null, { status: 400 });

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          let product: {
            id: string;
            marketplace_id: string | null;
            category_id: string | null;
          } | null = null;
          if (e.slug && needsProduct(e.type)) {
            const { data } = await supabaseAdmin
              .from("products")
              .select("id, marketplace_id, category_id")
              .eq("slug", e.slug)
              .eq("status", "published")
              .maybeSingle();
            if (!data) return ok();
            product = data;
          }
          let categoryId: string | null = null;
          if (e.slug && e.type === "category_click") {
            const { data } = await supabaseAdmin
              .from("categories")
              .select("id")
              .eq("slug", e.slug)
              .maybeSingle();
            if (!data) return ok();
            categoryId = data.id;
          }
          await supabaseAdmin.from("analytics_events").upsert(
            {
              event_type: e.type,
              session_id: e.sid,
              path: e.path,
              product_id: product?.id ?? null,
              marketplace_id: product?.marketplace_id ?? null,
              category_id: product?.category_id ?? categoryId,
              share_channel: e.type === "share_click" ? (e.channel ?? null) : null,
              referrer_host: e.type === "page_view" ? referrerHost(e.ref, host) : null,
              utm_source: e.utm?.source || null,
              utm_medium: e.utm?.medium || null,
              utm_campaign: e.utm?.campaign || null,
              utm_content: e.utm?.content || null,
              utm_term: e.utm?.term || null,
              dedup_key: dedupKey(e, Date.now()),
            },
            { onConflict: "dedup_key", ignoreDuplicates: true },
          );
          return ok();
        } catch {
          return new Response(null, { status: 400 });
        }
      },
    },
  },
});
