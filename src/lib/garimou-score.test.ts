import { describe, expect, it } from "vitest";
import { garimouScore, scoreLabel } from "./garimou-score";
import type { ComparisonOffer, ComparisonStore } from "./marketplace-comparison";

const now = new Date("2026-11-25T14:00:00Z");
const offer: ComparisonOffer = {
  id: "a",
  marketplace_slug: "shopee",
  external_id: "a",
  name: "Produto X",
  affiliate_url: "https://shopee.com.br/a",
  price_cents: 7000,
  fetched_at: "2026-11-25T14:00:00Z",
  valid_until: "2026-11-25T20:00:00Z",
  source: "shopee_api",
  signals: [],
  rating: 5,
};
const other: ComparisonOffer = {
  ...offer,
  id: "b",
  marketplace_slug: "magalu",
  affiliate_url: "https://magazinevoce.com.br/b",
  source: "mcp_afiliado",
  price_cents: 10000,
};
const stores: ComparisonStore[] = [
  {
    slug: "shopee",
    name: "Shopee",
    is_active: true,
    allowed_domains: ["shopee.com.br"],
    price_max_age_hours: 24,
  },
  {
    slug: "magalu",
    name: "Magalu",
    is_active: true,
    allowed_domains: ["magazinevoce.com.br"],
    price_max_age_hours: 24,
  },
];
const samples = [1, 3, 5, 7, 9, 11, 15].map((d) => {
  const day = "2026-11-" + String(d).padStart(2, "0");
  return {
    day,
    fetched_at: day + "T12:00:00Z",
    price_cents: 10000,
    source: "shopee_api",
  };
});
const score = (o = offer, history = samples, peers = [o, other]) =>
  garimouScore(o, peers, stores, history, now);

describe("Garimou Score do consumidor", () => {
  it("respeita as faixas de classificação", () => {
    expect([null, 0, 59, 60, 74, 75, 89, 90, 100].map(scoreLabel)).toEqual([
      "Oferta em avaliação",
      "Avalie antes de comprar",
      "Avalie antes de comprar",
      "Boa oferta",
      "Boa oferta",
      "Ótima oferta",
      "Ótima oferta",
      "Oferta excelente",
      "Oferta excelente",
    ]);
  });
  it("atinge 100 com todos os critérios atendidos", () => {
    expect(score().score).toBe(100);
    expect(score().reduction).toBe(30);
  });
  it("não calcula nota sem histórico suficiente", () => {
    expect(score(offer, samples.slice(0, 6)).score).toBeNull();
  });
  it("não usa avaliações ausentes nem inventa reputação", () => {
    expect(score({ ...offer, rating: null }).score).toBeNull();
  });
  it("não usa ofertas vencidas nem uma única loja", () => {
    expect(score({ ...offer, valid_until: "2026-11-25T13:00:00Z" }).score).toBeNull();
    expect(score(offer, samples, [offer]).score).toBeNull();
  });
  it("preço igual ao histórico não é desconto comprovado", () => {
    const result = score({ ...offer, price_cents: 10000 });
    expect(result.points.desconto).toBe(0);
    expect(result.points.historico).toBe(17.5);
  });
  it("ignora comissão e desconto anunciado", () => {
    const a = { ...offer, commission_rate: 99, discount_pct: 95 };
    const b = { ...offer, commission_rate: 0, discount_pct: 0 };
    expect(score(a)).toEqual(score(b));
  });
  it("não usa amostras de outra fonte", () => {
    expect(score(offer, samples.map((s) => ({ ...s, source: "manual" }))).score).toBeNull();
  });
});
