import { describe, expect, it } from "vitest";
import { catalogPricePatch, exactObservation, monitorOffset } from "./price-monitor";
import { displayablePrice } from "./price";
import { shopee } from "./marketplaces/shopee";

const now = new Date("2026-11-25T14:00:00Z");
const row = {
  marketplace_slug: "shopee",
  external_id: "12:34",
  price_cents: 14990,
  fetched_at: "2026-11-25T13:00:00Z",
  valid_until: "2026-11-25T19:00:00Z",
  source: "shopee_api" as const,
};

describe("monitoramento de produtos publicados", () => {
  it("percorre lotes sem repetir sempre os primeiros produtos", () => {
    expect([1, 2, 3, 4].map((n) => monitorOffset(10, n))).toEqual([0, 4, 8, 0]);
  });

  it("exige correspondência exata de loja e produto", () => {
    expect(exactObservation([row], "shopee", "12:34")).toEqual(row);
    expect(exactObservation([row], "shopee", "12:35")).toBeNull();
    expect(exactObservation([row], "magalu", "12:34")).toBeNull();
  });

  it("rejeita resultados conflitantes ou sem preço", () => {
    expect(exactObservation([row, { ...row, price_cents: 1 }], "shopee", "12:34")).toBeNull();
    expect(exactObservation([{ ...row, price_cents: null }], "shopee", "12:34")).toBeNull();
  });

  it("grava o horário real sem inventar desconto", () => {
    expect(catalogPricePatch(row, 24, null, now)).toEqual({
      current_price_cents: 14990,
      previous_price_cents: null,
      price_checked_at: row.fetched_at,
      price_source: "api",
    });
  });

  it("não renova preço vencido ou com validade insuficiente", () => {
    expect(
      catalogPricePatch({ ...row, valid_until: "2026-11-25T13:59:00Z" }, 24, null, now),
    ).toBeNull();
    expect(
      catalogPricePatch({ ...row, valid_until: "2026-11-25T15:00:00Z" }, 24, null, now),
    ).toBeNull();
  });

  it("não sobrescreve observações mais recentes", () => {
    expect(catalogPricePatch(row, 24, "2026-11-25T13:30:00Z", now)).toBeNull();
  });

  it("preço de API expira em seis horas sem alterar a regra manual", () => {
    const p = { currentPrice: 100, priceCheckedAt: "2026-11-25T08:00:00Z" };
    expect(displayablePrice({ ...p, priceSource: "api" }, shopee, now)).toBeNull();
    expect(displayablePrice({ ...p, priceSource: "manual" }, shopee, now)?.current).toBe(100);
  });
});
