import { describe, expect, it } from "vitest";
import { nativeShareData, productPageUrl, shareText, whatsappShareUrl } from "./share";
import { SITE_URL } from "./site";
import { shopee } from "./marketplaces/shopee";
import type { Product } from "@/lib/catalog/types";

const product: Product = {
  slug: "balao-pic-pic",
  name: "Balão PIC PIC – Pacote com 12 Unidades",
  shortDescription: "Balão de látex 16 polegadas.",
  categorySlug: "presentes",
  categoryName: "Presentes",
  marketplace: shopee,
  affiliateUrl: "https://s.shopee.com.br/abc",
  imageUrl: null,
  imageAlt: "Balões",
  isFeatured: false,
  isWeeklyPick: false,
  publishedAt: null,
  tags: ["balão"],
  currentPrice: 2990,
  previousPrice: null,
  priceCheckedAt: new Date().toISOString(),
  priceSource: "api",
};

describe("compartilhar produto", () => {
  it("endereço da página do produto", () =>
    expect(productPageUrl("balao-pic-pic")).toBe(`${SITE_URL}/p/balao-pic-pic`));

  it("texto traz o nome e o endereço da página", () => {
    const t = shareText(product);
    expect(t).toContain("Balão PIC PIC – Pacote com 12 Unidades");
    expect(t).toContain(`${SITE_URL}/p/balao-pic-pic`);
  });

  it("texto nunca leva preço", () => {
    const t = shareText(product);
    expect(t).not.toContain("R$");
    expect(t).not.toContain("29,90");
    expect(t).not.toContain("2990");
  });

  it("endereço do WhatsApp preenche a mensagem", () => {
    expect(whatsappShareUrl("Olá")).toBe("https://wa.me/?text=Ol%C3%A1");
    const url = whatsappShareUrl(shareText(product));
    expect(url.startsWith("https://wa.me/?text=")).toBe(true);
    expect(url).toContain("Bal%C3%A3o%20PIC%20PIC");
    expect(url).not.toContain("R$");
  });

  it("menu nativo recebe título, frase e endereço", () => {
    const d = nativeShareData(product);
    expect(d.title).toBe("Balão PIC PIC – Pacote com 12 Unidades");
    expect(d.url).toBe(`${SITE_URL}/p/balao-pic-pic`);
    expect(d.text).toBe("Olha este achadinho: Balão PIC PIC – Pacote com 12 Unidades");
  });
});
