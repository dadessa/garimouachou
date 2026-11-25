import { validPriceCents } from "./price";

export type HistoryPoint = { day: string; cents: number; at: string };
const DAY_MS = 86_400_000;

function dayTime(day: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return NaN;
  const t = Date.parse(day + "T00:00:00Z");
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === day ? t : NaN;
}

/** Expõe lacunas explicitamente: dias sem observação não têm preço zero nem interpolado. */
export function buildHistoryChart(points: HistoryPoint[]) {
  const byDay = new Map<number, HistoryPoint>();
  for (const p of points) {
    const t = dayTime(p.day);
    const at = Date.parse(p.at);
    if (!Number.isFinite(t) || !Number.isFinite(at) || !validPriceCents(p.cents)) continue;
    const prior = byDay.get(t);
    if (!prior || Date.parse(prior.at) < at) byDay.set(t, p);
  }
  const dates = [...byDay.keys()].sort((a, b) => a - b);
  const end = dates.at(-1);
  if (end === undefined) return [];
  const start = Math.max(dates[0]!, end - 179 * DAY_MS);
  const series: { day: string; cents: number | null }[] = [];
  for (let t = start; t <= end; t += DAY_MS) {
    series.push({
      day: new Date(t).toISOString().slice(0, 10),
      cents: byDay.get(t)?.cents ?? null,
    });
  }
  return series;
}
