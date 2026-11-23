import { defineTool } from "@lovable.dev/mcp-js";
import { supabaseAnon, SITE_URL } from "../supabase";

export default defineTool({
  name: "list_categories",
  title: "Listar categorias",
  description: "Lista as categorias ativas do Garimou Achou!.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async () => {
    const { data, error } = await supabaseAnon()
      .from("categories")
      .select("slug,name")
      .eq("is_active", true)
      .order("sort_order");
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const categories = (data ?? []).map((c) => ({
      slug: c.slug,
      name: c.name,
      url: `${SITE_URL}/categoria/${c.slug}`,
    }));
    return {
      content: [{ type: "text", text: JSON.stringify(categories) }],
      structuredContent: { categories },
    };
  },
});
