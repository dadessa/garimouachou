/** Regras puras da coleta do Radar (testáveis, sem rede). */
import type { ShopeeOffer } from "@/lib/marketplaces/shopee.server";

export const PAGE_SIZE = 50;
export const MAX_REQUESTS_PER_RUN = 20;
export const REQUEST_GAP_MS = 400;
export const VALID_HOURS = 24;
export const STALE_RUN_MIN = 15;

/** Quantas páginas buscar por ordenação, respeitando o limite de itens e de requisições. */
export function pagePlan(maxItems: number, sorts: number) {
  const perSort = Math.ceil(Math.max(10, maxItems) / sorts / PAGE_SIZE);
  return Math.max(1, Math.min(perSort, Math.floor(MAX_REQUESTS_PER_RUN / sorts)));
}

const pct = (v: string | null | undefined) =>
  v == null || v === "" || isNaN(Number(v)) ? null : Math.round(Number(v) * 10000) / 100;
const cents = (v: string | null | undefined) =>
  v == null || v === "" || isNaN(Number(v)) ? null : Math.round(Number(v) * 100);

/** Converte uma oferta da Shopee em linha do Radar, só com campos que a API devolveu. */
export function shopeeToRow(n: ShopeeOffer, now: Date) {
  const price = cents(n.priceMin ?? n.price);
  const disc = n.priceDiscountRate != null && n.priceDiscountRate > 0 ? n.priceDiscountRate : null;
  const base = pct(n.shopeeCommissionRate) ?? pct(n.commissionRate);
  const extra = pct(n.sellerCommissionRate);
  const end = n.periodEndTime ? new Date(n.periodEndTime * 1000) : null;
  const ttl = new Date(now.getTime() + VALID_HOURS * 3600_000);
  return {
    marketplace_slug: "shopee",
    external_id: `${n.shopId}:${n.itemId}`,
    name: n.productName.slice(0, 200),
    image_url: n.imageUrl,
    affiliate_url: n.offerLink,
    price_cents: price,
    original_price_cents: price != null && disc ? Math.round(price / (1 - disc / 100)) : null,
    discount_pct: disc,
    commission_rate: base,
    extra_commission_rate: extra && extra > 0 ? extra : null,
    sales: n.sales ?? null,
    rating: n.ratingStar != null && n.ratingStar !== "" ? Number(n.ratingStar) : null,
    source: "shopee_api",
    fetched_at: now.toISOString(),
    valid_until: (end && end < ttl ? end : ttl).toISOString(),
  };
}

export type RunStatus = "ok" | "partial" | "failed" | "skipped";
export function runStatus(items: number, errors: number, sourcesTried: number): RunStatus {
  if (sourcesTried === 0) return "skipped";
  if (errors === 0) return "ok";
  return items > 0 ? "partial" : "failed";
}
