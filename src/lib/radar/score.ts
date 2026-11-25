/** Motor determinístico do Radar: normaliza por loja+categoria, pondera e mede a confiança. */
export const INDICATORS = [
  "demand",
  "commission",
  "growth",
  "price",
  "rating",
  "seasonality",
  "internal",
] as const;
export type Indicator = (typeof INDICATORS)[number];
export type Weights = Record<Indicator, number>;
export const DEFAULT_WEIGHTS: Weights = {
  demand: 30,
  commission: 25,
  growth: 15,
  price: 10,
  rating: 10,
  seasonality: 5,
  internal: 5,
};
export const INDICATOR_LABEL: Record<Indicator, string> = {
  demand: "Demanda (vendas)",
  commission: "Comissão por venda",
  growth: "Crescimento da procura",
  price: "Atratividade do preço",
  rating: "Reputação e avaliações",
  seasonality: "Sazonalidade",
  internal: "Desempenho no site",
};

/** Calendário comercial brasileiro (MM-DD). */
export const BR_CALENDAR = [
  { key: "01-15", name: "Volta às aulas" },
  { key: "03-15", name: "Dia do Consumidor" },
  { key: "05-10", name: "Dia das Mães" },
  { key: "06-12", name: "Dia dos Namorados" },
  { key: "08-10", name: "Dia dos Pais" },
  { key: "10-12", name: "Dia das Crianças" },
  { key: "11-11", name: "11.11" },
  { key: "11-27", name: "Black Friday" },
  { key: "12-12", name: "12.12" },
  { key: "12-25", name: "Natal" },
] as const;
export const SEASON_WINDOW_DAYS = 45;

export interface RadarInput {
  id: string;
  marketplace: string;
  category: string | null;
  priceCents: number | null;
  commissionRate: number | null; // percentual, ex.: 7.5
  sales: number | null;
  searchVolume: number | null;
  growthPct: number | null;
  rating: number | null; // 0 a 5
  seasonalDates: string[];
  internalClicks: number | null;
  extraCommissionRate?: number | null; // comissão extra de campanha, em %
  discountPct?: number | null;
  expired?: boolean;
}

export interface RadarScore {
  score: number;
  confidence: "alta" | "média" | "baixa";
  coverage: number;
  values: Partial<Record<Indicator, number>>;
  missing: Indicator[];
  commissionCents: number | null;
  demandFromSearch: boolean;
  /** Score antes da penalidade por poucos dados. */
  rawScore: number;
  expired: boolean;
}

/** Percentual total de comissão (base + extra de campanha). */
export const totalRate = (rate: number | null, extra?: number | null) =>
  rate == null && extra == null ? null : (rate ?? 0) + (extra ?? 0);

/** Poucos indicadores não podem dar prioridade: o score é puxado para baixo pela cobertura. */
export const coveragePenalty = (raw: number, coverage: number) =>
  Math.round(raw * (0.4 + 0.6 * Math.min(1, Math.max(0, coverage))));

/** Crescimento (%) entre um valor antigo do histórico e o atual. */
export function growthFromHistory(past: number | null | undefined, current: number | null) {
  if (past == null || current == null || past <= 0) return null;
  return Math.round(((current - past) / past) * 1000) / 10;
}

export const commissionCents = (priceCents: number | null, rate: number | null) =>
  priceCents != null && rate != null ? Math.round((priceCents * rate) / 100) : null;

/** Dias até a próxima data do calendário (0..365). */
export function daysUntil(mmdd: string, today: Date) {
  const [m, d] = mmdd.split("-").map(Number);
  const t = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  let next = Date.UTC(today.getUTCFullYear(), (m ?? 1) - 1, d ?? 1);
  if (next < t) next = Date.UTC(today.getUTCFullYear() + 1, (m ?? 1) - 1, d ?? 1);
  return Math.round((next - t) / 86_400_000);
}

export function seasonality(dates: string[], today: Date): number | null {
  if (!dates.length) return null;
  const near = Math.min(...dates.map((k) => daysUntil(k, today)));
  return near > SEASON_WINDOW_DAYS ? 0 : 1 - near / SEASON_WINDOW_DAYS;
}

function minMax(vals: (number | null)[]) {
  const nums = vals.filter((v): v is number => v != null);
  const lo = Math.min(...nums);
  const hi = Math.max(...nums);
  return (v: number | null) => (v == null ? null : hi === lo ? 0.5 : (v - lo) / (hi - lo));
}

export function scoreAll(items: RadarInput[], weights: Weights, today = new Date()) {
  const groups = new Map<string, RadarInput[]>();
  for (const it of items) {
    const k = `${it.marketplace}|${it.category ?? ""}`;
    groups.set(k, [...(groups.get(k) ?? []), it]);
  }
  const internalN = minMax(items.map((i) => i.internalClicks));
  const totalW = INDICATORS.reduce((s, k) => s + Math.max(0, weights[k]), 0) || 1;
  const out = new Map<string, RadarScore>();
  for (const g of groups.values()) {
    const salesN = minMax(g.map((i) => i.sales));
    const searchN = minMax(g.map((i) => i.searchVolume));
    const comm = g.map((i) =>
      commissionCents(i.priceCents, totalRate(i.commissionRate, i.extraCommissionRate)),
    );
    const commN = minMax(comm);
    const growthN = minMax(g.map((i) => i.growthPct));
    const priceN = minMax(g.map((i) => i.priceCents));
    g.forEach((it, idx) => {
      const demandFromSearch = it.sales == null && it.searchVolume != null;
      const p = priceN(it.priceCents);
      const v: Partial<Record<Indicator, number | null>> = {
        demand: it.sales != null ? salesN(it.sales) : searchN(it.searchVolume),
        commission: commN(comm[idx] ?? null),
        growth: growthN(it.growthPct),
        price:
          p == null && it.discountPct == null
            ? null
            : Math.max(p == null ? 0 : 1 - p, Math.min(1, (it.discountPct ?? 0) / 50)),
        rating: it.rating == null ? null : Math.min(1, Math.max(0, (it.rating - 1) / 4)),
        seasonality: seasonality(it.seasonalDates, today),
        internal: internalN(it.internalClicks),
      };
      const values: Partial<Record<Indicator, number>> = {};
      const missing: Indicator[] = [];
      let sum = 0;
      let wPresent = 0;
      for (const k of INDICATORS) {
        const val = v[k];
        const w = Math.max(0, weights[k]);
        if (val == null) {
          missing.push(k);
          continue;
        }
        values[k] = val;
        sum += w * val;
        wPresent += w;
      }
      const coverage = wPresent / totalW;
      const raw = wPresent ? Math.round((sum / wPresent) * 100) : 0;
      out.set(it.id, {
        rawScore: raw,
        score: coveragePenalty(raw, coverage),
        expired: !!it.expired,
        confidence: coverage >= 0.75 ? "alta" : coverage >= 0.45 ? "média" : "baixa",
        coverage,
        values,
        missing,
        commissionCents: comm[idx] ?? null,
        demandFromSearch,
      });
    });
  }
  return out;
}

/** Cenários de receita por 100 cliques — sempre estimativa, nunca venda confirmada. */
export function revenueScenarios(commission: number | null, rates = [0.01, 0.03, 0.05]) {
  if (commission == null) return null;
  return rates.map((r) => ({ conversion: r, cents: Math.round(commission * 100 * r) }));
}

export function justify(s: RadarScore) {
  const top = (Object.entries(s.values) as [Indicator, number][])
    .filter(([, v]) => v >= 0.6)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k]) => INDICATOR_LABEL[k].toLowerCase());
  const base = top.length ? `Destaque em ${top.join(", ")}.` : "Nenhum indicador se destaca.";
  const miss = s.missing.length
    ? ` Sem dados de: ${s.missing.map((k) => INDICATOR_LABEL[k].toLowerCase()).join(", ")}.`
    : "";
  const exp = s.expired ? " Dados vencidos: atualize antes de divulgar." : "";
  const low = s.score < s.rawScore ? ` Score reduzido de ${s.rawScore} por falta de dados.` : "";
  const dem = s.demandFromSearch ? " Demanda medida por procura, não por vendas." : "";
  return base + dem + miss + low + exp;
}
