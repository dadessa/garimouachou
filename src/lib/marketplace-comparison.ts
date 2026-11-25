import { effectivePriceHours, validPriceCents } from "./price";
import { isObservationCurrent, supportsPriceHistory } from "./price-history";
import { matchAffiliateDomain } from "./marketplaces/types";

export type ComparisonIdentity = {
  brand: string;
  model: string;
  variant: string;
  gtin: string;
};

export type ComparisonOffer = {
  id: string;
  marketplace_slug: string;
  external_id: string;
  name: string;
  affiliate_url: string | null;
  price_cents: number | null;
  fetched_at: string;
  valid_until: string | null;
  source: string;
  signals: string[];
  rating?: number | null;
};

export type ComparisonStore = {
  slug: string;
  name: string;
  is_active: boolean;
  allowed_domains: string[];
  price_max_age_hours: number;
};

/** GTIN-8, UPC-A, EAN-13 e GTIN-14 com dígito verificador GS1. */
export function normalizeGtin(raw: string): string | null {
  const v = raw.trim().replace(/[ -]/g, "");
  if (!/^\d+$/.test(v) || ![8, 12, 13, 14].includes(v.length) || /^0+$/.test(v)) return null;
  const body = v.slice(0, -1);
  const sum = [...body].reverse().reduce((a, n, i) => a + Number(n) * (i % 2 ? 1 : 3), 0);
  if ((10 - (sum % 10)) % 10 !== Number(v.at(-1))) return null;
  return v.padStart(14, "0");
}

/** Somente códigos explicitamente rotulados no anúncio, nunca números de modelo. */
export function declaredGtins(title: string) {
  const codes = new Set<string>();
  for (const m of title.matchAll(
    /\b(?:EAN|GTIN|UPC)(?:[- ](?:8|12|13|14|A))?\s*[:=]?\s*(\d{8,14})(?!\d)/gi,
  )) {
    const code = normalizeGtin(m[1] ?? "");
    if (code) codes.add(code);
  }
  return [...codes];
}

export function identityReady(i: ComparisonIdentity) {
  return !!(
    i.brand.trim() &&
    i.model.trim() &&
    i.variant.trim() &&
    (!i.gtin.trim() || normalizeGtin(i.gtin))
  );
}

export function offerFingerprint(o: ComparisonOffer) {
  return JSON.stringify([
    o.id,
    o.name,
    o.marketplace_slug,
    o.external_id,
    o.source,
    o.fetched_at,
    o.valid_until,
    o.price_cents,
    o.affiliate_url,
    o.rating ?? null,
  ]);
}

export type ConfirmedIdentity = { fingerprint: string; gtin: string };

export function identityMatches(
  reference: ComparisonIdentity,
  offer: ComparisonOffer,
  confirmed: ConfirmedIdentity | undefined,
) {
  if (!identityReady(reference) || confirmed?.fingerprint !== offerFingerprint(offer)) return false;
  const ref = normalizeGtin(reference.gtin);
  const entered = normalizeGtin(confirmed.gtin);
  const declared = declaredGtins(offer.name);
  if (confirmed.gtin.trim() && !entered) return false;
  if (declared.length > 1 || (declared[0] && entered && declared[0] !== entered)) return false;
  if (ref && (entered ?? declared[0]) !== ref) return false;
  return true;
}

export function offerEligibility(
  o: ComparisonOffer,
  store: ComparisonStore | undefined,
  now: Date,
) {
  if (!store?.is_active || !supportsPriceHistory(o.marketplace_slug, o.source)) {
    return "Fonte ou loja não elegível";
  }
  if (!validPriceCents(o.price_cents)) return "Preço não informado";
  if (!isObservationCurrent(o, effectivePriceHours(store.price_max_age_hours, "api"), now)) {
    return "Preço vencido ou validade não confirmada";
  }
  if (
    !o.affiliate_url ||
    o.signals.includes("sem_comissao_na_conta") ||
    !matchAffiliateDomain(o.affiliate_url, store.allowed_domains)
  ) {
    return "Link de afiliada pendente ou domínio inválido";
  }
  return null;
}

/** Ranking por preço, não por comissão. Uma oferta por loja; empates mantidos. */
export function compareOffers(
  offers: ComparisonOffer[],
  stores: ComparisonStore[],
  reference: ComparisonIdentity,
  confirmed: Record<string, ConfirmedIdentity>,
  now = new Date(),
) {
  const byStore = new Map<string, ComparisonOffer & { cents: number }>();
  for (const o of offers) {
    const store = stores.find((s) => s.slug === o.marketplace_slug);
    if (!identityMatches(reference, o, confirmed[o.id])) continue;
    if (offerEligibility(o, store, now) || !validPriceCents(o.price_cents)) continue;
    const old = byStore.get(o.marketplace_slug);
    if (!old || o.price_cents < old.cents) {
      byStore.set(o.marketplace_slug, { ...o, cents: o.price_cents });
    }
  }
  const sorted = [...byStore.values()].sort(
    (a, b) => a.cents - b.cents || a.marketplace_slug.localeCompare(b.marketplace_slug),
  );
  const min = sorted[0]?.cents ?? null;
  const max = sorted.at(-1)?.cents ?? null;
  return {
    offers: sorted,
    difference: sorted.length > 1 && min !== null && max !== null ? max - min : null,
  };
}
