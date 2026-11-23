import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseAnon, SITE_URL } from "../supabase";

export default defineTool({
  name: "search_products",
  title: "Buscar achados",
  description:
    "Busca produtos publicados no Garimou Achou! por nome, com filtro opcional de categoria ou loja (slug).",
  inputSchema: {
    query: z.string().max(100).optional().describe("Texto para buscar no nome do produto."),
    category: z.string().max(60).optional().describe("Slug da categoria."),
    marketplace: z
      .string()
      .max(60)
      .optional()
      .describe("Slug da loja (amazon, shopee, mercadolivre, magalu)."),
    limit: z.number().int().min(1).max(30).optional().describe("Máximo de resultados (padrão 10)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ query, category, marketplace, limit }) => {
    const sb = supabaseAnon();
    let q = sb
      .from("products")
      .select(
        "slug,name,short_description,main_image_url,categories!inner(slug,name),marketplaces!inner(slug,name)",
      )
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .limit(limit ?? 10);
    if (query) q = q.ilike("name", `%${query.replace(/[%_,]/g, " ")}%`);
    if (category) q = q.eq("categories.slug", category);
    if (marketplace) q = q.eq("marketplaces.slug", marketplace);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const products = (data ?? []).map((p) => {
      const c = p.categories as unknown as { slug: string; name: string } | null;
      const m = p.marketplaces as unknown as { slug: string; name: string } | null;
      return {
        name: p.name,
        description: p.short_description ?? "",
        image: p.main_image_url ?? "",
        category: c?.name ?? "",
        store: m?.name ?? "",
        url: `${SITE_URL}/p/${p.slug}`,
      };
    });
    return {
      content: [
        {
          type: "text",
          text: products.length ? JSON.stringify(products) : "Nenhum achado encontrado.",
        },
      ],
      structuredContent: { products },
    };
  },
});
