import { effectivePriceHours, validPriceCents } from "./price";
import { isObservationCurrent } from "./price-history";

export const MONITOR_BATCH = 4;

export type PriceObservation = {
  marketplace_slug: string;
  external_id: string;
  price_cents: number | null;
  fetched_at: string;
  valid_until: string | null;
  source: "shopee_api" | "mcp_afiliado";
};

/** Rodízio determinístico por execução; não privilegia repetidamente o mesmo produto vencido. */
export function monitorOffset(total: number, runNumber: number) {
  const pages = Math.max(1, Math.ceil(total / MONITOR_BATCH));
  return ((Math.max(1, runNumber) - 1) % pages) * MONITOR_BATCH;
}

/** Não usar semelhança de título ou escolher arbitrariamente entre preços divergentes. */
export function exactObservation(
  rows: PriceObservation[],
  marketplace: string,
  externalId: string,
) {
  const matches = rows.filter(
    (r) => r.marketplace_slug === marketplace && r.external_id === externalId,
  );
  const first = matches[0];
  if (!first || !validPriceCents(first.price_cents)) return null;
  if (matches.some((r) => r.price_cents !== first.price_cents)) return null;
  return first;
}

/** Só gravar se o prazo público inteiro estiver coberto pela validade da observação. */
export function catalogPricePatch(
  observation: PriceObservation,
  maxAgeHours: number,
  previousCheckedAt: string | null,
  now = new Date(),
) {
  const ttl = effectivePriceHours(maxAgeHours, "api");
  const checked = Date.parse(observation.fetched_at);
  const previous = previousCheckedAt ? Date.parse(previousCheckedAt) : NaN;
  if (!isObservationCurrent(observation, ttl, now)) return null;
  if (Number.isFinite(previous) && checked <= previous) return null;
  if (Date.parse(observation.valid_until ?? "") < checked + ttl * 36e5) return null;
  return {
    current_price_cents: observation.price_cents,
    previous_price_cents: null,
    price_checked_at: observation.fetched_at,
    price_source: "api" as const,
  };
}
