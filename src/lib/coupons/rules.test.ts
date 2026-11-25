import { describe, expect, it } from "vitest";
import { activeCoupons, type Coupon } from "./rules";
import { normalizeAwinCoupons } from "./awin-coupons";

const now = new Date("2026-11-25T14:00:00Z");
const coupon: Coupon = {
  id: "test-1",
  source: "manual",
  merchant: "Shopee",
  marketplace: "shopee",
  productSlug: "",
  title: "Teste",
  code: "TESTE",
  terms: "Somente produtos elegíveis.",
  kind: "percent",
  amount: 10,
  minimumCents: null,
  startsAt: "2026-11-25T12:00:00Z",
  endsAt: "2026-11-25T20:00:00Z",
  destination: "https://shopee.com.br/teste",
  affiliateUrl: "https://s.shopee.com.br/teste",
  advertiserId: null,
  publisherId: null,
  approved: true,
};

describe("cupons", () => {
  it("exibe somente registros aprovados e vigentes", () => {
    expect(activeCoupons([coupon, { ...coupon, approved: false }], now)).toHaveLength(1);
    expect(activeCoupons([coupon], new Date(coupon.endsAt))).toEqual([]);
  });

  it("rejeita URL externa e benefício inválido", () => {
    expect(activeCoupons([{ ...coupon, affiliateUrl: "https://evil.example/" }], now)).toEqual([]);
    expect(activeCoupons([{ ...coupon, amount: 101 }], now)).toEqual([]);
  });

  it("não presume desconto numérico nem publica ao importar da Awin", () => {
    const destination = "https://loja.example/produto";
    const urlTracking =
      "https://www.awin1.com/cread.php?awinaffid=12&awinmid=34&ued=" +
      encodeURIComponent(destination);
    const row = {
      promotionId: 1,
      type: "voucher",
      advertiser: { id: 34, name: "Loja", joined: true },
      title: "Desconto de 10%",
      terms: "Consulte condições.",
      startDate: "2026-11-25T12:00:00.000",
      endDate: "2026-11-25T20:00:00.000",
      url: destination,
      urlTracking,
      regions: { all: true },
      voucher: { code: "TESTE", exclusive: false },
    };
    const result = normalizeAwinCoupons({ promotions: [row] }, "12", now);
    expect(result.coupons).toHaveLength(1);
    expect(result.coupons[0]?.amount).toBeNull();
    expect(result.coupons[0]?.approved).toBe(false);
    expect(activeCoupons(result.coupons, now)).toEqual([]);
    expect(normalizeAwinCoupons([{ ...row, voucher: { code: "X", exclusive: true } }], "12", now).coupons).toEqual([]);
  });
});
