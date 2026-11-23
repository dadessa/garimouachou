import { defineTool } from "@lovable.dev/mcp-js";
import { supabaseAnon } from "../supabase";

export default defineTool({
  name: "list_stores",
  title: "Listar lojas",
  description: "Lista as lojas parceiras ativas do Garimou Achou!.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async () => {
    const { data, error } = await supabaseAnon()
      .from("marketplaces")
      .select("slug,name")
      .eq("is_active", true)
      .order("name");
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const stores = (data ?? []).map((m) => ({ slug: m.slug, name: m.name }));
    return {
      content: [{ type: "text", text: JSON.stringify(stores) }],
      structuredContent: { stores },
    };
  },
});
