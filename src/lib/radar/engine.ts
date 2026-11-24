/** Regra única do Radar: usada pela tela e pelo assistente de IA. */
import { growthFromHistory, scoreAll, type RadarScore, type Weights } from "./score";

export interface Opp {
  id: string;
  marketplace_slug: string;
  external_id: string;
  name: string;
  image_url: string | null;
  affiliate_url: string | null;
  category: string | null;
  price_cents: number | null;
  original_price_cents: number | null;
  commission_rate: number | null;
  extra_commission_rate: number | null;
  discount_pct: number | null;
  sales: number | null;
  search_volume: number | null;
  growth_pct: number | null;
  rating: number | null;
  seasonal_dates: string[];
  source: string;
  fetched_at: string;
  valid_until: string | null;
}
export interface Snap { opportunity_id: string; day: string; sales: number | null; search_volume: number | null }
export interface CatalogRef { id: string; external_id: string | null; affiliate_url: string }

export const norm = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Classifica pela categoria informada; senão, pela palavra do nome da categoria no nome do produto. */
export function classifyCategory<C extends { id: string; name: string; slug?: string }>(
  name: string,
  given: string | null,
  cats: C[],
): C | null {
  if (given) {
    const g = norm(given);
    const exact = cats.find((c) => norm(c.name) === g || (c.slug && norm(c.slug) === g));
    if (exact) return exact;
  }
  const text = ` ${norm(`${name} ${given ?? ""}`).replace(/[^a-z0-9]+/g, " ")} `;
  const hits = cats.filter((c) =>
    norm(c.name)
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 4)
      .some((w) => text.includes(` ${w} `) || text.includes(` ${w.replace(/s$/, "")} `)),
  );
  return hits.length === 1 ? hits[0]! : null;
}

export const isExpired = (o: Pick<Opp, "valid_until">, now = new Date()) =>
  !!o.valid_until && new Date(o.valid_until) < now;

export interface RadarRow {
  o: Opp;
  s: RadarScore;
  catalogId: string | null;
  expired: boolean;
  growth: number | null;
  growthFromHistory: boolean;
}

export function buildRadar(
  ops: Opp[],
  weights: Weights,
  opts: { catalog: CatalogRef[]; clicks: Map<string, number>; snaps: Snap[]; now?: Date },
): RadarRow[] {
  const now = opts.now ?? new Date();
  const oldest = new Map<string, Snap>();
  const cutoff = new Date(now.getTime() - 3 * 86_400_000).toISOString().slice(0, 10);
  for (const sn of opts.snaps) {
    if (sn.day > cutoff) continue; // compara com pelo menos 3 dias atrás
    const prev = oldest.get(sn.opportunity_id);
    if (!prev || sn.day < prev.day) oldest.set(sn.opportunity_id, sn);
  }
  const prep = ops.map((o) => {
    const p = opts.catalog.find(
      (c) => (c.external_id && c.external_id === o.external_id) || (!!o.affiliate_url && c.affiliate_url === o.affiliate_url),
    );
    const past = oldest.get(o.id);
    const hist = growthFromHistory(past?.sales ?? past?.search_volume, past?.sales != null ? o.sales : o.search_volume);
    const growth = o.growth_pct ?? hist;
    return { o, catalogId: p?.id ?? null, growth, fromHist: o.growth_pct == null && hist != null, expired: isExpired(o, now) };
  });
  const scores = scoreAll(
    prep.map(({ o, catalogId, growth, expired }) => ({
      id: o.id,
      marketplace: o.marketplace_slug,
      category: o.category,
      priceCents: o.price_cents,
      commissionRate: o.commission_rate,
      extraCommissionRate: o.extra_commission_rate,
      discountPct: o.discount_pct,
      sales: o.sales,
      searchVolume: o.search_volume,
      growthPct: growth,
      rating: o.rating,
      seasonalDates: o.seasonal_dates,
      internalClicks: catalogId ? (opts.clicks.get(catalogId) ?? 0) : null,
      expired,
    })),
    weights,
    now,
  );
  return prep.map((x) => ({
    o: x.o,
    s: scores.get(x.o.id)!,
    catalogId: x.catalogId,
    expired: x.expired,
    growth: x.growth,
    growthFromHistory: x.fromHist,
  }));
}

export const VIEWS = {
  melhores: "Melhores do dia",
  crescimento: "Procura crescente",
  vendidos: "Mais vendidos",
  procurados: "Mais procurados",
  comissao: "Maior comissão",
  extra: "Comissão extra",
  sazonais: "Sazonais",
  financeiro: "Potencial financeiro",
  novos: "Recomendados fora do catálogo",
} as const;
export type View = keyof typeof VIEWS;

/** Valor financeiro esperado: comissão por venda × demanda normalizada × confiança. */
export const financialPotential = (r: RadarRow) =>
  r.s.commissionCents != null && r.s.values.demand != null
    ? Math.round(r.s.commissionCents * r.s.values.demand * r.s.coverage)
    : null;

/** Ordena uma visão. Ofertas vencidas nunca entram como oportunidade atual (exceto filtro explícito). */
export function applyView(rows: RadarRow[], view: View): RadarRow[] {
  const live = rows.filter((r) => !r.expired);
  const by = (list: RadarRow[], g: (x: RadarRow) => number | null) =>
    list.filter((x) => g(x) != null).sort((a, b) => (g(b) ?? 0) - (g(a) ?? 0));
  switch (view) {
    case "vendidos": return by(live, (x) => x.o.sales);
    case "procurados": return by(live, (x) => x.o.search_volume);
    case "crescimento": return by(live, (x) => x.growth).filter((x) => (x.growth ?? 0) > 0);
    case "comissao": return by(live, (x) => x.s.commissionCents);
    case "extra": return by(live, (x) => x.o.extra_commission_rate).filter((x) => (x.o.extra_commission_rate ?? 0) > 0);
    case "sazonais": return by(live, (x) => x.s.values.seasonality ?? null).filter((x) => (x.s.values.seasonality ?? 0) > 0);
    case "financeiro": return by(live, financialPotential);
    case "novos": return by(live, (x) => x.s.score).filter((x) => !x.catalogId && x.s.confidence !== "baixa");
    default: return by(live, (x) => x.s.score);
  }
}
