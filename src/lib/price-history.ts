import { validPriceCents } from "./price";

/** Somente amostras de fontes identificadas, sem reconstruir preços de descontos. */
export interface PriceSample {
  day: string;
  price_cents: number | null;
  source: string;
  fetched_at: string;
}

export const HISTORY_SOURCES = ["shopee_api", "mcp_afiliado"] as const;

export function supportsPriceHistory(marketplace: string, source: string) {
  // Amazon e fontes sem política confirmada não entram nesta primeira versão.
  return (
    ["shopee", "magalu", "mercadolivre", "kabum"].includes(marketplace) &&
    (source === "mcp_afiliado" || (source === "shopee_api" && marketplace === "shopee"))
  );
}

export function summarizePriceHistory(
  samples: PriceSample[],
  source: string,
  days: number,
  now = new Date(),
) {
  const byDay = new Map<string, { day: string; cents: number; at: string }>();
  const until = now.getTime();
  const since = until - days * 86_400_000;
  for (const s of samples) {
    const at = Date.parse(s.fetched_at);
    if (s.source !== source || !validPriceCents(s.price_cents)) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s.day) || !(at >= since && at <= until)) continue;
    const old = byDay.get(s.day);
    if (!old || Date.parse(old.at) < at) {
      byDay.set(s.day, { day: s.day, cents: s.price_cents, at: s.fetched_at });
    }
  }
  const points = [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day));
  const values = points.map((p) => p.cents);
  return {
    points,
    min: values.length ? Math.min(...values) : null,
    max: values.length ? Math.max(...values) : null,
    average: values.length
      ? Math.round(values.reduce((a, b) => a + b, 0) / values.length)
      : null,
    latest: points.at(-1) ?? null,
  };
}

export function isObservationCurrent(
  observation: { price_cents: number | null; fetched_at: string; valid_until: string | null },
  maxAgeHours: number,
  now = new Date(),
) {
  if (!validPriceCents(observation.price_cents) || !observation.valid_until) return false;
  const age = (now.getTime() - Date.parse(observation.fetched_at)) / 36e5;
  return (
    age >= 0 &&
    age <= maxAgeHours &&
    Date.parse(observation.valid_until) > now.getTime()
  );
}
