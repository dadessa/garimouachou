import { describe, expect, it } from "vitest";
import { amazon } from "./marketplaces/amazon";
import { shopee } from "./marketplaces/shopee";
import { isAllowedAffiliateUrl } from "./marketplaces/types";
import { displayablePrice } from "./price";

const now = new Date("2026-11-23T12:00:00Z");
describe("regras de preço", () => {
  it("Amazon com preço manual não exibe preço", () => {
    expect(displayablePrice({ currentPrice: 1000, priceCheckedAt: "2026-11-23T10:00:00Z", priceSource: "manual" }, amazon, now)).toBeNull();
  });
  it("preço verificado há mais de 24 h fica oculto", () => {
    expect(displayablePrice({ currentPrice: 1000, priceCheckedAt: "2026-11-22T11:00:00Z", priceSource: "manual" }, shopee, now)).toBeNull();
  });
  it("preço dentro do prazo é exibido", () => {
    expect(displayablePrice({ currentPrice: 1000, priceCheckedAt: "2026-11-23T10:00:00Z", priceSource: "manual" }, shopee, now)?.current).toBe(1000);
  });
});
describe("validação de URL de afiliado", () => {
  it("aceita subdomínio permitido", () => expect(isAllowedAffiliateUrl("https://s.shopee.com.br/x", shopee.allowedDomains)).toBe(true));
  it("rejeita domínio que só contém o texto", () => expect(isAllowedAffiliateUrl("https://shopee.com.br.evil.com/x", shopee.allowedDomains)).toBe(false));
  it("rejeita http", () => expect(isAllowedAffiliateUrl("http://shopee.com.br/x", shopee.allowedDomains)).toBe(false));
  it("rejeita credenciais na URL", () => expect(isAllowedAffiliateUrl("https://a@shopee.com.br/x", shopee.allowedDomains)).toBe(false));
});
