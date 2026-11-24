import type { Database } from "@/integrations/supabase/types";
import { signalsOf, type OfferFacts } from "./offers";

type RadarInsert = Database["public"]["Tables"]["radar_opportunities"]["Insert"];
export const API_SOURCES = ["shopee_api", "mercadolivre_api"];
/** Dados de mensagem valem por pouco tempo: não são confirmados pela loja. */
export const MESSAGE_VALID_HOURS = 24;

export interface FeedInput extends OfferFacts {
  url: string;
  name: string;
  marketplaceSlug: string;
  externalId: string | null;
  imageUrl: string | null;
  category: string | null;
  fromPage: boolean;
}

/** Linha do Radar a partir de uma oferta colada; a fonte diz de onde veio cada número. */
export function toRadarRow(o: FeedInput, now = new Date()): RadarInsert {
  return {
    marketplace_slug: o.marketplaceSlug,
    external_id: o.externalId ?? o.url,
    name: o.name.slice(0, 200),
    affiliate_url: o.url,
    image_url: o.imageUrl,
    category: o.category,
    price_cents: o.priceCents,
    original_price_cents: o.previousPriceCents,
    discount_pct: o.discountPct,
    commission_rate: o.commissionPct,
    extra_commission_rate: o.extraCommissionPct,
    extra_earnings_cents: o.extraEarningsCents,
    coupon: o.coupon,
    sales: o.sales,
    rating: o.rating,
    signals: signalsOf(o),
    source: o.fromPage ? "pagina_publica" : "mensagem",
    fetched_at: now.toISOString(),
    valid_until: new Date(now.getTime() + MESSAGE_VALID_HOURS * 36e5).toISOString(),
  };
}

/** Não sobrescreve dado confirmado por API com dado de mensagem. */
export const keepApiRows = (
  rows: RadarInsert[],
  existing: { marketplace_slug: string; external_id: string; source: string }[],
) =>
  rows.filter(
    (r) =>
      !existing.some(
        (e) =>
          e.marketplace_slug === r.marketplace_slug &&
          e.external_id === r.external_id &&
          API_SOURCES.includes(e.source),
      ),
  );
