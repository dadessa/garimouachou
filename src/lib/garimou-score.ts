import {
  offerEligibility,
  type ComparisonOffer,
  type ComparisonStore,
} from "./marketplace-comparison";
import { effectivePriceHours, validPriceCents } from "./price";
import { summarizePriceHistory, type PriceSample } from "./price-history";

export const GARIMOU_SCORE_VERSION = "1.0";
export const SCORE_WEIGHTS = {
  historico: 35,
  desconto: 20,
  avaliacao: 15,
  atualizacao: 10,
  comparacao: 20,
} as const;

export const SCORE_LABELS: Record<keyof typeof SCORE_WEIGHTS, string> = {
  historico: "Posição no histórico",
  desconto: "Redução frente à mediana histórica",
  avaliacao: "Avaliação do produto",
  atualizacao: "Atualização dos dados",
  comparacao: "Preço entre lojas equivalentes",
};

export function scoreLabel(score: number | null) {
  if (score === null) return "Oferta em avaliação";
  if (score >= 90) return "Oferta excelente";
  if (score >= 75) return "Ótima oferta";
  if (score >= 60) return "Boa oferta";
  return "Avalie antes de comprar";
}

const clamp = (v: number) => Math.max(0, Math.min(1, v));
type Criterion = keyof typeof SCORE_WEIGHTS;
type Result = {
  score: number | null;
  label: string;
  missing: string[];
  points: Partial<Record<Criterion, number>>;
  days: number;
  reduction: number | null;
};

/** Recebe apenas ofertas cuja equivalência foi conferida no comparador.
 * Não usa comissão, vendas, cliques, desconto anunciado ou preço riscado.
 */
export function garimouScore(
  offer: ComparisonOffer,
  confirmedOffers: ComparisonOffer[],
  stores: ComparisonStore[],
  samples: PriceSample[],
  now: Date,
): Result {
  const missing: string[] = [];
  const store = stores.find((s) => s.slug === offer.marketplace_slug);
  const valid = !offerEligibility(offer, store, now);
  const current = offer.price_cents;
  const history = summarizePriceHistory(samples, offer.source, 30, now).points.filter(
    (p) => p.day < offer.fetched_at.slice(0, 10) && Date.parse(p.at) < Date.parse(offer.fetched_at),
  );
  const values = history.map((p) => p.cents).sort((a, b) => a - b);
  const span = Date.parse(history.at(-1)?.day ?? "") - Date.parse(history[0]?.day ?? "");
  const enoughHistory = values.length >= 7 && span >= 14 * 86_400_000;
  const rating = offer.rating;
  const peers = confirmedOffers.filter(
    (p) =>
      !offerEligibility(
        p,
        stores.find((s) => s.slug === p.marketplace_slug),
        now,
      ) && validPriceCents(p.price_cents),
  );
  const confirmed = peers.some((p) => p.id === offer.id);
  const storeCount = new Set(peers.map((p) => p.marketplace_slug)).size;
  if (!valid || !validPriceCents(current)) missing.push("Preço atual válido");
  if (!enoughHistory) missing.push("7 dias de coleta distribuídos por pelo menos 14 dias");
  if (typeof rating !== "number" || !Number.isFinite(rating) || rating <= 0 || rating > 5) {
    missing.push("Avaliação do produto informada pela fonte");
  }
  if (!confirmed || storeCount < 2) missing.push("Ofertas equivalentes confirmadas de 2 lojas");
  if (missing.length || !validPriceCents(current) || !store || typeof rating !== "number") {
    return {
      score: null,
      label: scoreLabel(null),
      missing,
      points: {},
      days: values.length,
      reduction: null,
    };
  }
  const mid = Math.floor(values.length / 2);
  const median = (values[mid]! + values[Math.floor((values.length - 1) / 2)]!) / 2;
  const reduction = (median - current) / median;
  const cheaper = values.filter((p) => p > current).length;
  const ties = values.filter((p) => p === current).length;
  const best = Math.min(...peers.map((p) => p.price_cents!));
  const age = (now.getTime() - Date.parse(offer.fetched_at)) / 36e5;
  const ttl = effectivePriceHours(store.price_max_age_hours, "api");
  const points = {
    historico: SCORE_WEIGHTS.historico * ((cheaper + ties / 2) / values.length),
    desconto: SCORE_WEIGHTS.desconto * clamp(reduction / 0.3),
    avaliacao: SCORE_WEIGHTS.avaliacao * clamp((rating - 1) / 4),
    atualizacao: SCORE_WEIGHTS.atualizacao * clamp(1 - age / ttl),
    comparacao: SCORE_WEIGHTS.comparacao * clamp(1 - (current / best - 1) / 0.25),
  };
  const score = Math.round(Object.values(points).reduce((a, b) => a + b, 0));
  return {
    score,
    label: scoreLabel(score),
    missing: [],
    points,
    days: values.length,
    reduction: Math.round(reduction * 1000) / 10,
  };
}
