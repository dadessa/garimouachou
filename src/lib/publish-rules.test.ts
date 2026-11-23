import { describe, expect, it } from "vitest";
import { matchAffiliateDomain } from "./marketplaces/types";
import { displayablePrice } from "./price";
import { parseReais, publishMissing } from "./publish-rules";
import { amazon } from "./marketplaces/amazon";
import { shopee } from "./marketplaces/shopee";

const base = {
  name: "Garrafa", mainImageUrl: "/img/product-images/a.png", mainImageAlt: "Garrafa azul",
  category: { isActive: true }, marketplace: { isActive: true, name: "Shopee", allowedDomains: shopee.allowedDomains },
  affiliateUrl: "https://s.shopee.com.br/abc",
};
describe("lista do que falta para publicar", () => {
  it("produto completo pode publicar", () => expect(publishMissing(base)).toEqual([]));
  it("sem imagem não publica", () => expect(publishMissing({ ...base, mainImageUrl: null })).toContain("Imagem principal"));
  it("sem texto alternativo não publica", () => expect(publishMissing({ ...base, mainImageAlt: " " })).toContain("Texto alternativo da imagem"));
  it("categoria desativada não publica", () => expect(publishMissing({ ...base, category: { isActive: false } }).length).toBe(1));
  it("link de outro domínio não publica", () => expect(publishMissing({ ...base, affiliateUrl: "https://evilshopee.com.br/x" }).length).toBe(1));
});
describe("domínio reconhecido", () => {
  it("mostra o domínio do subdomínio", () => expect(matchAffiliateDomain("https://s.shopee.com.br/x", shopee.allowedDomains)).toBe("s.shopee.com.br"));
  it("amzn.to reconhecido", () => expect(matchAffiliateDomain("https://amzn.to/3abc", amazon.allowedDomains)).toBe("amzn.to"));
  it("javascript: rejeitado", () => expect(matchAffiliateDomain("javascript:alert(1)", amazon.allowedDomains)).toBeNull());
  it("data: rejeitado", () => expect(matchAffiliateDomain("data:text/html,x", amazon.allowedDomains)).toBeNull());
  it("domínio parecido rejeitado", () => expect(matchAffiliateDomain("https://amazon.com.br.evil.com/x", amazon.allowedDomains)).toBeNull());
});
describe("preço", () => {
  it("129,90 vira 12990 centavos", () => expect(parseReais("129,90")).toBe(12990));
  it("1.234,56 vira 123456", () => expect(parseReais("R$ 1.234,56")).toBe(123456));
  it("vazio é sem preço", () => expect(parseReais("")).toBeNull());
  it("texto inválido é erro", () => expect(parseReais("abc")).toBeNaN());
  it("anterior menor que o atual não mostra preço riscado", () => {
    const now = new Date("2026-11-23T12:00:00Z");
    expect(displayablePrice({ currentPrice: 1000, previousPrice: 900, priceCheckedAt: "2026-11-23T11:00:00Z", priceSource: "manual" }, shopee, now)?.previous).toBeNull();
  });
  it("preço de API da Amazon dentro do prazo aparece", () => {
    const now = new Date("2026-11-23T12:00:00Z");
    expect(displayablePrice({ currentPrice: 1000, priceCheckedAt: "2026-11-23T11:00:00Z", priceSource: "api" }, amazon, now)?.current).toBe(1000);
  });
});
