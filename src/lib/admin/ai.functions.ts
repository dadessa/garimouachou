import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const generateCopy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: { name: string; category: string; affiliateUrl: string; details: string }) => {
      const s = (v: unknown, max: number) => String(v ?? "").slice(0, max);
      return {
        name: s(d.name, 200),
        category: s(d.category, 100),
        affiliateUrl: s(d.affiliateUrl, 500),
        details: s(d.details, 2000),
      };
    },
  )
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin)
      return {
        error: "Sem permissão para esta ação." as string,
        description: "",
        tags: [] as string[],
      };
    if (!data.name.trim())
      return { error: "Informe o nome do produto.", description: "", tags: [] };
    const { generateProductCopy } = await import("./ai.server");
    try {
      return { error: null, ...(await generateProductCopy(data)) };
    } catch (e) {
      const status = (e as { statusCode?: number })?.statusCode;
      console.error("IA:", e);
      return {
        error:
          status === 429
            ? "Muitos pedidos seguidos. Espere um pouco e tente de novo."
            : status === 402
              ? "Os créditos de IA acabaram. Adicione créditos em Configurações → Planos e créditos."
              : "Não foi possível gerar agora. Tente de novo.",
        description: "",
        tags: [],
      };
    }
  });
