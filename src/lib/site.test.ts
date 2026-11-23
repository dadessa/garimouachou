import { describe, expect, it } from "vitest";
import { absoluteUrl, INSTAGRAM_HANDLE, INSTAGRAM_URL, SITE_URL } from "./site";
import { isAllowedAffiliateUrl } from "./marketplaces/types";
import { shopee } from "./marketplaces/shopee";

describe("Instagram oficial", () => {
  it("aponta para @garimouachouoficial", () => {
    expect(INSTAGRAM_URL).toBe("https://www.instagram.com/garimouachouoficial");
    expect(INSTAGRAM_HANDLE).toBe("@garimouachouoficial");
  });
});

describe("prévia de compartilhamento", () => {
  it("foto do painel vira endereço completo", () =>
    expect(absoluteUrl("/img/product-images/a.png")).toBe(`${SITE_URL}/img/product-images/a.png`));
  it("sem foto não gera imagem", () => expect(absoluteUrl(null)).toBeNull());
});
describe("link de afiliado", () => {
  it("link com parâmetros de afiliado é aceito sem alteração", () => {
    const u = "https://s.shopee.com.br/9fMh4Js4IN?af_id=123&utm_source=x";
    expect(isAllowedAffiliateUrl(u, shopee.allowedDomains)).toBe(true);
  });
});
