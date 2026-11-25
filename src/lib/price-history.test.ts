import { describe, expect, it } from "vitest";
import { isObservationCurrent, summarizePriceHistory, supportsPriceHistory } from "./price-history";
import { displayablePrice } from "./price";
import { shopee } from "./marketplaces/shopee";

const now = new Date("2026-11-25T14:00:00Z");
const sample = {
  day: "2026-11-25",
  price_cents: 10000,
  source: "mcp_afiliado",
  fetched_at: "2026-11-25T12:00:00Z",
};

describe("histórico de preços", () => {
  it("não mistura fontes nem inclui amostras inválidas, futuras ou antigas", () => {
    const history = summarizePriceHistory(
      [
        sample,
        { ...sample, source: "manual", price_cents: 1 },
        { ...sample, price_cents: 0 },
        { ...sample, fetched_at: "2026-11-26T12:00:00Z" },
        { ...sample, day: "2026-10-01", fetched_at: "2026-10-01T12:00:00Z" },
      ],
      "mcp_afiliado",
      30,
      now,
    );
    expect(history.points).toHaveLength(1);
    expect(history.min).toBe(10000);
    expect(history.average).toBe(10000);
  });

  it("mantém a observação mais recente de cada dia e não inventa dias sem coleta", () => {
    const history = summarizePriceHistory(
      [
        sample,
        { ...sample, price_cents: 8000, fetched_at: "2026-11-25T13:00:00Z" },
        { ...sample, day: "2026-11-20", fetched_at: "2026-11-20T12:00:00Z" },
      ],
      "mcp_afiliado",
      30,
      now,
    );
    expect(history.points).toHaveLength(2);
    expect(history.min).toBe(8000);
    expect(history.max).toBe(10000);
    expect(history.average).toBe(9000);
  });

  it("não apresenta estatísticas quando não há amostras", () => {
    expect(summarizePriceHistory([], "mcp_afiliado", 90, now).min).toBeNull();
  });

  it("não considera oferta vencida ou sem validade como preço atual", () => {
    const row = { ...sample, valid_until: "2026-11-25T15:00:00Z" };
    expect(isObservationCurrent(row, 24, now)).toBe(true);
    expect(isObservationCurrent({ ...row, valid_until: null }, 24, now)).toBe(false);
    expect(
      isObservationCurrent({ ...row, valid_until: "2026-11-25T13:00:00Z" }, 24, now),
    ).toBe(false);
  });

  it("exclui fontes manuais e Amazon do histórico desta versão", () => {
    expect(supportsPriceHistory("amazon", "mcp_afiliado")).toBe(false);
    expect(supportsPriceHistory("shopee", "manual")).toBe(false);
    expect(supportsPriceHistory("shopee", "shopee_api")).toBe(true);
  });

  it("não exibe preço inválido ou data inválida na vitrine", () => {
    expect(displayablePrice({ currentPrice: 100, priceCheckedAt: "inválida" }, shopee, now)).toBeNull();
    expect(displayablePrice({ currentPrice: 0, priceCheckedAt: sample.fetched_at }, shopee, now)).toBeNull();
  });
});
