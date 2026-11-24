import { describe, expect, it } from "vitest";
import { parseFacts } from "./offers";
import { keepApiRows, toRadarRow } from "./radar-feed";

const base = {
  url: "https://s.shopee.com.br/A",
  name: "Air fryer",
  marketplaceSlug: "shopee",
  externalId: "1:2",
  imageUrl: null,
  category: "Casa",
  fromPage: false,
};

describe("toRadarRow", () => {
  it("marca a fonte como mensagem, com validade de 24h, e separa comissão de desconto", () => {
    const now = new Date("2026-11-24T12:00:00Z");
    const r = toRadarRow(
      { ...base, ...parseFacts("R$ 1.299,00\nComissão 10%\nMais vendido") },
      now,
    );
    expect(r.source).toBe("mensagem");
    expect(r.price_cents).toBe(129900);
    expect(r.commission_rate).toBe(10);
    expect(r.discount_pct).toBeNull();
    expect(r.signals).toEqual(["mais_vendido"]);
    expect(r.valid_until).toBe("2026-11-25T12:00:00.000Z");
  });
  it("não substitui dado confirmado pela API", () => {
    const r = toRadarRow({ ...base, ...parseFacts("") });
    expect(
      keepApiRows([r], [{ marketplace_slug: "shopee", external_id: "1:2", source: "shopee_api" }]),
    ).toEqual([]);
    expect(
      keepApiRows([r], [{ marketplace_slug: "shopee", external_id: "1:2", source: "mensagem" }]),
    ).toHaveLength(1);
  });
});
