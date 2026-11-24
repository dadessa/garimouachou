import { describe, expect, it } from "vitest";
import { cleanUrl, externalIdFromUrl, splitOffers } from "./offers";

describe("splitOffers", () => {
  it("lê mensagem do WhatsApp com de/por, desconto e cupom", () => {
    const t = `[24/11 10:30] Vanessa: 🔥 *Fone Bluetooth XPTO Preto*
De R$ 199,90 por R$ 89,90 (55% OFF)
Cupom: GARIMOU10
👉 https://meli.la/11PSSL4?ref=abc.`;
    const [o] = splitOffers(t);
    expect(o?.url).toBe("https://meli.la/11PSSL4?ref=abc");
    expect(o?.name).toBe("Fone Bluetooth XPTO Preto");
    expect(o?.priceCents).toBe(8990);
    expect(o?.previousPriceCents).toBe(19990);
    expect(o?.discountPct).toBe(55);
    expect(o?.coupon).toBe("GARIMOU10");
  });
  it("separa várias mensagens e ignora links repetidos", () => {
    const t = `Garrafa térmica 1L\nR$ 49,90\nhttps://s.shopee.com.br/AAA\n\nKit potes vidro\nhttps://s.shopee.com.br/BBB\nhttps://s.shopee.com.br/AAA`;
    const r = splitOffers(t);
    expect(r.map((o) => o.url)).toEqual(["https://s.shopee.com.br/AAA", "https://s.shopee.com.br/BBB"]);
    expect(r[0]?.name).toBe("Garrafa térmica 1L");
    expect(r[0]?.priceCents).toBe(4990);
    expect(r[1]?.name).toBe("Kit potes vidro");
    expect(r[1]?.priceCents).toBeNull();
  });
  it("lista simples de links não inventa nome nem preço", () => {
    const r = splitOffers("https://a.com/1\nhttps://a.com/2");
    expect(r).toHaveLength(2);
    expect(r[1]?.name).toBe("");
    expect(r[1]?.priceCents).toBeNull();
  });
  it("preserva todos os parâmetros de afiliado", () => {
    expect(cleanUrl("https://x.com/p?a=1&b=2&utm=z),")).toBe("https://x.com/p?a=1&b=2&utm=z");
  });
});

describe("externalIdFromUrl", () => {
  it("reconhece Mercado Livre e Shopee", () => {
    expect(externalIdFromUrl("https://produto.mercadolivre.com.br/MLB-123456789-fone")).toBe("MLB123456789");
    expect(externalIdFromUrl("https://shopee.com.br/Garrafa-i.111.222")).toBe("111:222");
    expect(externalIdFromUrl("https://exemplo.com")).toBeNull();
  });
});
