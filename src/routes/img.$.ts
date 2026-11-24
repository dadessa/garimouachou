import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

const BUCKETS = new Set(["product-images", "banner-images"]);

/** Serve fotos do catálogo só quando pertencem a produto publicado ou banner ativo (checado com acesso de visitante). */
export const Route = createFileRoute("/img/$")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const [bucket, ...rest] = (params._splat ?? "").split("/");
        const path = rest.join("/");
        if (
          !bucket ||
          !BUCKETS.has(bucket) ||
          !/^[\w.\-/]{1,200}$/.test(path) ||
          path.includes("..")
        ) {
          return new Response("Not found", { status: 404 });
        }
        const url = process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"];
        const key =
          process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
        if (!url || !key) return new Response("Unavailable", { status: 503 });
        const pub = createClient(url, key, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const ref = `/img/${bucket}/${path}`;
        let visible = false;
        if (bucket === "product-images") {
          const [a, b] = await Promise.all([
            pub.from("products").select("id").eq("main_image_url", ref).limit(1),
            pub.from("product_images").select("id").eq("url", ref).limit(1),
          ]);
          visible = !!a.data?.length || !!b.data?.length;
        } else {
          const { data } = await pub
            .from("banners")
            .select("id")
            .or(`image_url.eq."${ref}",image_mobile_url.eq."${ref}"`)
            .limit(1);
          visible = !!data?.length;
        }
        if (!visible) return new Response("Not found", { status: 404 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: blob, error } = await supabaseAdmin.storage.from(bucket).download(path);
        if (error || !blob) return new Response("Not found", { status: 404 });
        const type = blob.type;
        if (!/^image\/(jpeg|png|webp)$/.test(type))
          return new Response("Not found", { status: 404 });
        return new Response(blob.stream(), {
          headers: {
            "content-type": type,
            "cache-control": "public, max-age=86400",
            "x-content-type-options": "nosniff",
          },
        });
      },
    },
  },
});
