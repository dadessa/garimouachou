import { describe, expect, it } from "vitest";
import {
  compareOffers,
  declaredGtins,
  identityMatches,
  normalizeGtin,
  offerFingerprint,
  type ComparisonOffer,
} from "./marketplace-comparison";

const now = new Date("2026-11-25T14:00:00Z");
const reference = { brand: "Marca", model: "X1", variant: "220 V", gtin: "4006381333931" };
const base: ComparisonOffer = {
  id: "a",
  marketplace_slug: "shopee",
  external_id: "12:34",
  name: "Marca X1 220 V EAN: 4006381333931",
  affiliate_url: "https://s.shopee.com.br/a",
  price_cents: 10000,
  fetched_at: "2026-11-25T13:00:00Z",
  valid_until: "2026-11-25T19:00:00Z",
  source: "shopee_api",
  signals: [],
};
const other: ComparisonOffer = {
  ...base,
  id: "b",
  marketplace_slug: "magalu",
  source: "mcp_afiliado",
  affiliate_url: "https://magazinevoce.com.br/b",
  price_cents: 12000,
};
const stores = [
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
const confirm = (o: ComparisonOffer) => ({
  fingerprint: offerFingerprint(o),
  gtin: reference.gtin,
});
const confirmed = { a: confirm(base), b: confirm(other) };

describe("comparador de marketplaces", () => {
  it("valida dígito verificador e normaliza GTIN", () => {
    expect(normalizeGtin("4006381333931")).toBe("04006381333931");
    expect(normalizeGtin("4006381333932")).toBeNull();
    expect(normalizeGtin("00000000")).toBeNull();
  });

  it("não confunde número de modelo com EAN declarado", () => {
    expect(declaredGtins("Modelo 4006381333931")).toEqual([]);
    expect(declaredGtins(base.name)).toEqual(["04006381333931"]);
  });

  it("exige confirmação e rejeita conflito de código", () => {
    expect(identityMatches(reference, base, undefined)).toBe(false);
    const conflict = { ...base, name: "EAN: 5901234123457" };
    expect(identityMatches(reference, conflict, confirm(conflict))).toBe(false);
    expect(identityMatches(reference, base, confirm(base))).toBe(true);
  });

  it("ordena preços válidos de lojas diferentes e calcula a diferença", () => {
    const result = compareOffers([other, base], stores, reference, confirmed, now);
    expect(result.offers.map((o) => o.id)).toEqual(["a", "b"]);
    expect(result.difference).toBe(2000);
  });

  it("não mantém confirmação depois que o preço ou anúncio muda", () => {
    const changed = { ...base, price_cents: 9000 };
    expect(compareOffers([changed], stores, reference, confirmed, now).offers).toEqual([]);
  });

  it("exclui oferta vencida, domínio inválido e link sem comissão", () => {
    const invalid = [
      { ...base, valid_until: "2026-11-25T13:30:00Z" },
      { ...base, affiliate_url: "https://evil.example/a" },
      { ...base, signals: ["sem_comissao_na_conta"] },
    ];
    for (const o of invalid) {
      expect(compareOffers([o], stores, reference, { a: confirm(o) }, now).offers).toEqual([]);
    }
  });

  it("não compara duas ofertas da mesma loja como lojas distintas", () => {
    const second = { ...base, id: "c", price_cents: 8000 };
    const result = compareOffers(
      [base, second],
      stores,
      reference,
      { a: confirm(base), c: confirm(second) },
      now,
    );
    expect(result.offers.map((o) => o.id)).toEqual(["c"]);
    expect(result.difference).toBeNull();
  });
});
