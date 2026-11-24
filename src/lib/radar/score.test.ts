import { describe, expect, it } from "vitest";
import { DEFAULT_WEIGHTS, commissionCents, revenueScenarios, scoreAll, seasonality, type RadarInput } from "./score";

const base: RadarInput = { id: "a", marketplace: "shopee", category: "casa", priceCents: 10000, commissionRate: 10, sales: 100, searchVolume: null, growthPct: 10, rating: 5, seasonalDates: [], internalClicks: null };

describe("radar score", () => {
  it("pesos padrão do briefing somam 100", () => {
    expect(Object.values(DEFAULT_WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
    expect(DEFAULT_WEIGHTS.demand).toBe(30);
    expect(DEFAULT_WEIGHTS.commission).toBe(25);
  });
  it("comissão por venda = preço × percentual", () => {
    expect(commissionCents(10000, 7.5)).toBe(750);
    expect(commissionCents(null, 7.5)).toBeNull();
  });
  it("indicador ausente baixa a confiança e é sinalizado", () => {
    const r = scoreAll([{ ...base, rating: null, growthPct: null, commissionRate: null }], DEFAULT_WEIGHTS).get("a")!;
    expect(r.missing).toContain("rating");
    expect(r.missing).toContain("commission");
    expect(r.confidence).toBe("baixa");
  });
  it("mais vendas no mesmo grupo dá score maior", () => {
    const m = scoreAll([base, { ...base, id: "b", sales: 10 }], DEFAULT_WEIGHTS);
    expect(m.get("a")!.score).toBeGreaterThan(m.get("b")!.score);
  });
  it("procura não é contada como venda", () => {
    const r = scoreAll([{ ...base, sales: null, searchVolume: 500 }], DEFAULT_WEIGHTS).get("a")!;
    expect(r.demandFromSearch).toBe(true);
  });
  it("sazonalidade só vale até 45 dias antes da data", () => {
    const d = new Date("2026-11-20T00:00:00Z");
    expect(seasonality(["11-27"], d)).toBeGreaterThan(0.8);
    expect(seasonality(["05-10"], d)).toBe(0);
    expect(seasonality([], d)).toBeNull();
  });
  it("cenários por 100 cliques usam a comissão", () => {
    expect(revenueScenarios(1000, [0.02])).toEqual([{ conversion: 0.02, cents: 2000 }]);
  });
});
