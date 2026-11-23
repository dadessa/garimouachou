import { createFileRoute } from "@tanstack/react-router";

const BUCKETS = new Set(["product-images", "banner-images"]);

/** Serve as fotos do catálogo (pastas privadas) com leitura pública controlada pelo storage. */
export const Route = createFileRoute("/img/$")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const [bucket, ...rest] = (params._splat ?? "").split("/");
        const path = rest.join("/");
        if (!bucket || !BUCKETS.has(bucket) || !/^[\w.\-/]{1,200}$/.test(path) || path.includes("..")) {
          return new Response("Not found", { status: 404 });
        }
        const url = process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"];
        const key = process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
        if (!url || !key) return new Response("Unavailable", { status: 503 });
        const res = await fetch(`${url}/storage/v1/object/authenticated/${bucket}/${path}`, { headers: { apikey: key } });
        if (!res.ok || !res.body) return new Response("Not found", { status: 404 });
        const type = res.headers.get("content-type") ?? "";
        if (!/^image\/(jpeg|png|webp)$/.test(type)) return new Response("Not found", { status: 404 });
        return new Response(res.body, {
          headers: { "content-type": type, "cache-control": "public, max-age=86400", "x-content-type-options": "nosniff" },
        });
      },
    },
  },
});
