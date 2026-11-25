import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { CategoryRow, MarketplaceRow } from "@/lib/admin/api";
import { publishMissing } from "@/lib/publish-rules";
import { getMarketplace } from "@/lib/marketplaces";
import { effectivePriceHours } from "@/lib/price";
import { detectMarketplace, importSlug, type ImportDraft, type ImportStatus } from "./rules";

export interface ImportResult {
  status: ImportStatus;
  productId?: string;
  message: string;
}

type GenCopy = (a: {
  data: { name: string; category: string; affiliateUrl: string; details: string };
}) => Promise<{ error: string | null; description: string; tags: string[] }>;

/** Processa um item: loja, duplicidade, IA, regras de publicação e cadastro (RLS de admin). */
/** Núcleo da importação, com o cliente de quem pede (navegador ou servidor, RLS de admin). */
export async function importOneWith(
  supabase: SupabaseClient<Database>,
  d: ImportDraft,
  opts: {
    publish: boolean;
    defaultCategoryId: string | null;
    useAi: boolean;
    /** Só quando a administradora pediu explicitamente salvar sem nome. */
    allowIncomplete?: boolean;
    /** Garimpo: revisão gravada atomicamente com o rascunho. */
    garimpoRunId?: string;
    reviewPending?: boolean;
  },
  deps: { mks: MarketplaceRow[]; cats: CategoryRow[]; genCopy: GenCopy },
): Promise<ImportResult> {
  if (!d.name.trim() && !opts.allowIncomplete)
    return {
      status: "error",
      message:
        "Nome do produto não identificado: nada foi salvo. Informe o nome ou use “Links e ofertas” para tentar de novo.",
    };

  const mk = detectMarketplace(d.affiliateUrl, deps.mks);
  if (!mk) return { status: "error", message: "O link não é de nenhuma loja cadastrada (https)." };

  const dupQ = supabase.from("products").select("id").limit(1);
  const { data: dup, error: dupErr } = d.externalId
    ? await dupQ.eq("marketplace_id", mk.id).eq("external_id", d.externalId)
    : await dupQ.eq("affiliate_url", d.affiliateUrl);
  if (dupErr) return { status: "error", message: "Não foi possível conferir duplicidade." };
  if (dup?.length)
    return {
      status: "duplicate",
      productId: dup[0]!.id,
      message: "Este produto já está no catálogo.",
    };

  const cat = deps.cats.find((c) => c.id === (d.categoryId ?? opts.defaultCategoryId)) ?? null;
  let { description, tags } = d;
  const notes: string[] = [];
  if (opts.useAi && d.name.trim() && !description.trim()) {
    const r = await deps
      .genCopy({
        data: {
          name: d.name,
          category: cat?.name ?? "",
          affiliateUrl: d.affiliateUrl,
          details: description,
        },
      })
      .catch(() => ({ error: "IA indisponível.", description: "", tags: [] as string[] }));
    if (r.error) notes.push(`IA: ${r.error}`);
    else {
      description = r.description;
      if (!tags.length) tags = r.tags;
    }
  }

  const imageAlt = d.imageAlt || d.name;
  const missing = publishMissing({
    name: d.name,
    mainImageUrl: d.imageUrl,
    mainImageAlt: imageAlt,
    category: cat ? { isActive: cat.is_active } : null,
    marketplace: { isActive: mk.is_active, name: mk.name, allowedDomains: mk.allowed_domains },
    affiliateUrl: d.affiliateUrl,
  });
  const price = importPrice(d, mk.slug);
  if (price.stale)
    notes.push("Preço da consulta vencido: salvo sem preço, revalide antes de publicar.");
  const needsReview = opts.reviewPending || !!opts.garimpoRunId;
  const publish = !needsReview && opts.publish && missing.length === 0 && !price.stale;
  const { data: row, error } = await supabase
    .from("products")
    .insert({
      slug: importSlug(d.name),
      name: d.name,
      short_description: description,
      tags,
      category_id: cat?.id ?? null,
      marketplace_id: mk.id,
      affiliate_url: d.affiliateUrl,
      external_id: d.externalId,
      main_image_url: d.imageUrl,
      main_image_alt: d.imageUrl ? imageAlt : null,
      current_price_cents: price.cents,
      previous_price_cents: price.cents != null ? d.previousPriceCents : null,
      price_checked_at: price.checkedAt,
      price_source: d.fromApi ? "api" : "manual",
      source: d.fromApi ? "api" : "manual",
      status: publish ? "published" : "draft",
      ...(needsReview ? { review_status: "pending" } : {}),
      ...(opts.garimpoRunId ? { origin: "garimpo", garimpo_run_id: opts.garimpoRunId } : {}),
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505")
      return { status: "duplicate", message: "Este produto já está no catálogo." };
    return { status: "error", message: "O cadastro foi recusado. Tente de novo." };
  }
  const pend = missing.length ? `Falta: ${missing.join(", ")}.` : "";
  return {
    status: publish ? "published" : "created",
    productId: row.id,
    message: [publish ? "Publicado na vitrine." : pend || "Salvo como rascunho.", ...notes].join(
      " ",
    ),
  };
}

/**
 * Preço a gravar: preço de API/Radar mantém a data original da consulta; sem data ou vencido
 * não é gravado (stale). Preço digitado agora pela administradora vale a partir de agora.
 */
export function importPrice(d: ImportDraft, mkSlug: string, now = new Date()) {
  if (d.priceCents == null) return { cents: null, checkedAt: null, stale: false };
  if (!d.fromApi) {
    const at = d.priceCheckedAt ?? now.toISOString();
    return { cents: d.priceCents, checkedAt: at, stale: false };
  }
  if (!d.priceCheckedAt) return { cents: null, checkedAt: null, stale: true };
  const maxH = effectivePriceHours(getMarketplace(mkSlug)?.priceMaxAgeHours ?? 24, "api");
  const ageH = (now.getTime() - new Date(d.priceCheckedAt).getTime()) / 36e5;
  if (!(ageH >= 0 && ageH < maxH)) return { cents: null, checkedAt: null, stale: true };
  return { cents: d.priceCents, checkedAt: d.priceCheckedAt, stale: false };
}
