import { describe, expect, it } from "vitest";
import { buildPlan, discardReason, isDue, type GarimpoSettings } from "./rules";

const s: GarimpoSettings = {
  enabled: true,
  run_hour: 6,
  frequency_hours: 24,
  daily_limit: 20,
  request_limit: 12,
  marketplaces: [],
  keywords: [],
  min_price_cents: null,
  max_price_cents: null,
  min_commission_pct: null,
  min_discount_pct: null,
};

describe("garimpo", () => {
  it("roda às 06h de Brasília (09h UTC)", () => {
    expect(isDue(s, null, new Date("2026-11-25T09:05:00Z"))).toBe(true);
    expect(isDue(s, null, new Date("2026-11-25T08:55:00Z"))).toBe(false);
  });
  it("não roda duas vezes no mesmo dia", () => {
    expect(isDue(s, new Date("2026-11-25T09:00:00Z"), new Date("2026-11-25T09:40:00Z"))).toBe(
      false,
    );
  });
  it("desligado nunca roda", () => {
    expect(isDue({ ...s, enabled: false }, null, new Date("2026-11-25T09:05:00Z"))).toBe(false);
  });
  it("comissão mínima descarta quando a loja não informa comissão", () => {
    const c = {
      marketplace_slug: "kabum",
      price_cents: 10000,
      discount_pct: 30,
      commission_rate: null,
    };
    expect(discardReason(c, { ...s, min_commission_pct: 5 })).toMatch(/comissão/);
    expect(discardReason(c, s)).toBeNull();
  });
  it("faixa de preço exige preço", () => {
    const c = {
      marketplace_slug: "kabum",
      price_cents: null,
      discount_pct: null,
      commission_rate: null,
    };
    expect(discardReason(c, { ...s, max_price_cents: 5000 })).toMatch(/preço/);
  });
  it("plano respeita o limite de requisições e prioriza loja com comissão", () => {
    const p = buildPlan(
      [
        { site: "kabum", monetized: false },
        { site: "shopee", monetized: true },
      ],
      ["a", "b", "c"],
      { marketplaces: [], request_limit: 4 },
    );
    expect(p).toHaveLength(4);
    expect(p[0]!.site).toBe("shopee");
  });
});
