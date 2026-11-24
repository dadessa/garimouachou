import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { OfferBlock } from "./offers";

const MAX_CHUNK = 5;

export interface IdentifiedOffer extends OfferBlock {
  finalUrl: string;
  marketplaceId: string | null;
  marketplaceName: string | null;
  pageTitle: string | null;
  imageUrl: string | null;
  pageDescription: string | null;
  availability: string | null;
  externalId: string | null;
  categoryId: string | null;
  nameSource: "página da loja" | "mensagem" | "IA (pela mensagem)" | null;
  duplicateId: string | null;
  missing: string[];
  notes: string[];
}

async function isAdmin(context: { supabase: any; userId: string }) {
  const { data } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  return !!data;
}

/** Identifica até 5 ofertas por chamada (o painel envia em partes para mostrar o progresso). */
export const identifyOffers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { blocks: OfferBlock[]; useAi: boolean }) => {
    if (!Array.isArray(d.blocks) || d.blocks.length > MAX_CHUNK) throw new Error("Lote inválido.");
    const s = (v: unknown, n: number) => String(v ?? "").slice(0, n);
    const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : null);
    return {
      useAi: !!d.useAi,
      blocks: d.blocks.map((b) => ({
        url: s(b.url, 1000),
        context: s(b.context, 2000),
        name: s(b.name, 200),
        priceCents: num(b.priceCents),
        previousPriceCents: num(b.previousPriceCents),
        discountPct: num(b.discountPct),
        coupon: b.coupon ? s(b.coupon, 20) : null,
      })),
    };
  })
  .handler(async ({ data, context }) => {
    if (!(await isAdmin(context))) return { error: "Sem permissão para esta ação.", items: [] as IdentifiedOffer[] };
    const { matchAffiliateDomain } = await import("@/lib/marketplaces/types");
    const { readPage, interpretOffers } = await import("./offers.server");
    const [{ data: mks }, { data: cats }] = await Promise.all([
      context.supabase.from("marketplaces").select("id,name,allowed_domains,is_active"),
      context.supabase.from("categories").select("id,name").eq("is_active", true),
    ]);
    const stores = mks ?? [];
    const hosts = stores.flatMap((m: { allowed_domains: string[] }) => m.allowed_domains);

    const pages = await Promise.all(
      data.blocks.map(async (b) => {
        const mk = stores.find((m: { allowed_domains: string[] }) => matchAffiliateDomain(b.url, m.allowed_domains)) ?? null;
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
        aiNotes.push(st === 429 ? "IA ocupada: tente de novo em instantes." : st === 402 ? "Créditos de IA acabaram." : "IA indisponível nesta parte.");
      }
    }

    // Duplicados já no catálogo (link igual ou mesmo produto na loja).
    const urls = data.blocks.map((b) => b.url);
    const ext = pages.map((p) => p.page?.externalId).filter((x): x is string => !!x);
    const [{ data: byUrl }, { data: byExt }] = await Promise.all([
      context.supabase.from("products").select("id,affiliate_url").in("affiliate_url", urls),
      ext.length
        ? context.supabase.from("products").select("id,external_id,marketplace_id").in("external_id", ext)
        : Promise.resolve({ data: [] as { id: string; external_id: string; marketplace_id: string }[] }),
    ]);

    const items: IdentifiedOffer[] = data.blocks.map((b, i) => {
      const { mk, page } = pages[i]!;
      const a = ai.find((x) => x.index === i);
      const notes = [...aiNotes];
      if (!mk) notes.push("Link de loja não cadastrada: não será importado.");
      if (page?.note) notes.push(page.note);
      const name = page?.title || b.name || a?.name?.trim() || "";
      const nameSource = page?.title ? "página da loja" : b.name ? "mensagem" : a?.name?.trim() ? "IA (pela mensagem)" : null;
      const cat = (cats ?? []).find((c: { name: string }) => c.name === a?.category) ?? null;
      const externalId = page?.externalId ?? null;
      const dup =
        (byUrl ?? []).find((p: { affiliate_url: string }) => p.affiliate_url === b.url) ??
        (byExt ?? []).find((p: { external_id: string | null; marketplace_id: string | null }) => p.external_id === externalId && p.marketplace_id === mk?.id);
      const missing: string[] = [];
      if (!name) missing.push("nome");
      if (!page?.image) missing.push("foto");
      if (!cat) missing.push("categoria");
      return {
        ...b,
        finalUrl: page?.finalUrl ?? b.url,
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
