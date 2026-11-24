import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { guessName, parseFacts, type OfferBlock } from "./offers";

const MAX_CHUNK = 5;

export interface IdentifiedOffer extends OfferBlock {
  finalUrl: string;
  marketplaceId: string | null;
  marketplaceName: string | null;
  pageTitle: string | null;
  imageUrl: string | null;
  /** Fotos adicionais públicas da loja (CDN oficial). */
  extraImages: string[];
  marketplaceSlug: string | null;
  /** Ordem de consulta: API oficial → página pública → mensagem → manual. */
  sources: { api: string; page: string; message: boolean };
  pageDescription: string | null;
  availability: string | null;
  externalId: string | null;
  categoryId: string | null;
  nameSource: "página da loja" | "mensagem" | "IA (pela mensagem)" | null;
  duplicateId: string | null;
  missing: string[];
  notes: string[];
}

async function isAdmin(context: {
  supabase: {
    rpc: (f: "has_role", a: { _user_id: string; _role: "admin" }) => PromiseLike<{ data: unknown }>;
  };
  userId: string;
}) {
  const { data } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  return !!data;
}

/** Identifica até 5 ofertas por chamada (o painel envia em partes para mostrar o progresso). */
export const identifyOffers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { blocks: { url: string; context: string }[]; useAi: boolean }) => {
    if (!Array.isArray(d.blocks) || d.blocks.length > MAX_CHUNK) throw new Error("Lote inválido.");
    const s = (v: unknown, n: number) => String(v ?? "").slice(0, n);
    // Os fatos são relidos aqui no servidor a partir do texto; nada vem pronto do navegador.
    return {
      useAi: !!d.useAi,
      blocks: d.blocks.map((b): OfferBlock => {
        const context = s(b.context, 2000);
        return { url: s(b.url, 1000), context, name: guessName(context), ...parseFacts(context) };
      }),
    };
  })
  .handler(async ({ data, context }) => {
    if (!(await isAdmin(context)))
      return { error: "Sem permissão para esta ação.", items: [] as IdentifiedOffer[] };
    const { matchAffiliateDomain } = await import("@/lib/marketplaces/types");
    const { readPage, interpretOffers } = await import("./offers.server");
    const [{ data: mks }, { data: cats }] = await Promise.all([
      context.supabase
        .from("marketplaces")
        .select("id,name,slug,allowed_domains,is_active,integration_status"),
      context.supabase.from("categories").select("id,name").eq("is_active", true),
    ]);
    const stores = mks ?? [];
    const hosts = stores.flatMap((m: { allowed_domains: string[] }) => m.allowed_domains);

    const pages = await Promise.all(
      data.blocks.map(async (b) => {
        const mk =
          stores.find((m: { allowed_domains: string[] }) =>
            matchAffiliateDomain(b.url, m.allowed_domains),
          ) ?? null;
        return { mk, page: mk ? await readPage(b.url, hosts) : null };
      }),
    );

    let ai: { index: number; name: string; category: string; missing: string[] }[] = [];
    const aiNotes: string[] = [];
    if (data.useAi) {
      try {
        ai = await interpretOffers(
          data.blocks.map((b, i) => ({ ...b, pageTitle: pages[i]?.page?.title ?? null })),
          (cats ?? []).map((c: { name: string }) => c.name),
        );
      } catch (e) {
        const st = (e as { statusCode?: number })?.statusCode;
        aiNotes.push(
          st === 429
            ? "IA ocupada: tente de novo em instantes."
            : st === 402
              ? "Créditos de IA acabaram."
              : "IA indisponível nesta parte.",
        );
      }
    }

    // Duplicados já no catálogo (link igual ou mesmo produto na loja).
    const urls = data.blocks.map((b) => b.url);
    const ext = pages.map((p) => p.page?.externalId).filter((x): x is string => !!x);
    const [{ data: byUrl }, { data: byExt }] = await Promise.all([
      context.supabase.from("products").select("id,affiliate_url").in("affiliate_url", urls),
      ext.length
        ? context.supabase
            .from("products")
            .select("id,external_id,marketplace_id")
            .in("external_id", ext)
        : Promise.resolve({
            data: [] as { id: string; external_id: string; marketplace_id: string }[],
          }),
    ]);

    const items: IdentifiedOffer[] = data.blocks.map((b, i) => {
      const { mk, page } = pages[i]!;
      const a = ai.find((x) => x.index === i);
      const notes = [...aiNotes];
      if (!mk) notes.push("Link de loja não cadastrada: não será importado.");
      if (page?.note) notes.push(page.note);
      if (/mercadoli[bv]re\.com\.br\/social\//.test(page?.finalUrl ?? ""))
        notes.push("Este link abre uma vitrine/perfil, não um produto: use o link de um anúncio.");
      if (mk && mk.integration_status !== "active")
        notes.push(
          `API oficial ${mk.name}: não conectada (sem preço, comissão ou disponibilidade confirmados).`,
        );
      const name = page?.title || b.name || a?.name?.trim() || "";
      const nameSource = page?.title
        ? "página da loja"
        : b.name
          ? "mensagem"
          : a?.name?.trim()
            ? "IA (pela mensagem)"
            : null;
      const cat = (cats ?? []).find((c: { name: string }) => c.name === a?.category) ?? null;
      const externalId = page?.externalId ?? null;
      const dup =
        (byUrl ?? []).find((p: { affiliate_url: string }) => p.affiliate_url === b.url) ??
        (byExt ?? []).find(
          (p: { external_id: string | null; marketplace_id: string | null }) =>
            p.external_id === externalId && p.marketplace_id === mk?.id,
        );
      const missing: string[] = [];
      if (!name) missing.push("nome");
      if (!page?.image) missing.push("foto");
      if (!cat) missing.push("categoria");
      return {
        ...b,
        finalUrl: page?.finalUrl ?? b.url,
        marketplaceSlug: mk?.slug ?? null,
        extraImages: (page?.images ?? []).filter((u) => u !== page?.image).slice(0, 4),
        sources: {
          api:
            mk?.integration_status === "active"
              ? "conectada (consulta por produto ainda não disponível nesta tela)"
              : "não conectada",
          page: !mk
            ? "não consultada"
            : page?.title || page?.image
              ? "dados públicos lidos"
              : (page?.note ?? "sem dados"),
          message: !!b.context,
        },
        marketplaceId: mk?.id ?? null,
        marketplaceName: mk?.name ?? null,
        pageTitle: page?.title ?? null,
        imageUrl: page?.image ?? null,
        pageDescription: page?.description ?? null,
        availability: page?.availability ?? null,
        externalId,
        categoryId: cat?.id ?? null,
        name,
        nameSource,
        duplicateId: dup?.id ?? null,
        missing,
        notes,
      };
    });
    return { error: null as string | null, items };
  });

/** Copia a foto oficial da loja para o armazenamento do site (CDNs permitidas, JPG/PNG/WebP até 5 MB). */
export const importOfferImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { url: string }) => ({ url: String(d.url ?? "").slice(0, 1000) }))
  .handler(async ({ data, context }) => {
    if (!(await isAdmin(context))) return { error: "Sem permissão para esta ação.", path: null };
    const { downloadImage } = await import("./offers.server");
    try {
      const img = await downloadImage(data.url);
      const path = `${crypto.randomUUID()}.${img.ext}`;
      const { error } = await context.supabase.storage
        .from("product-images")
        .upload(path, img.bytes, { contentType: img.type, upsert: false });
      if (error) return { error: "Não foi possível guardar a foto.", path: null };
      return { error: null as string | null, path: `/img/product-images/${path}` };
    } catch (e) {
      return { error: (e as Error).message || "Imagem indisponível.", path: null };
    }
  });
