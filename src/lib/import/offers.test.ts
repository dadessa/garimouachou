import { describe, expect, it } from "vitest";
import { cleanUrl, externalIdFromUrl, parseFacts, splitOffers } from "./offers";

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
  it("separa vários links misturados de lojas diferentes e ignora repetidos", () => {
    const t = `Garrafa térmica 1L\nR$ 49,90\nhttps://s.shopee.com.br/AAA\n\nKit potes vidro\nhttps://meli.la/BBB\nhttps://amzn.to/CCC https://s.shopee.com.br/AAA`;
    const r = splitOffers(t);
    expect(r.map((o) => o.url)).toEqual([
      "https://s.shopee.com.br/AAA",
      "https://meli.la/BBB",
      "https://amzn.to/CCC",
    ]);
    expect(r[0]?.name).toBe("Garrafa térmica 1L");
    expect(r[1]?.name).toBe("Kit potes vidro");
    expect(r[1]?.priceCents).toBeNull();
  });
  it("lista simples de links não inventa nome nem preço", () => {
    const r = splitOffers("https://a.com/1\nhttps://a.com/2");
    expect(r[1]?.name).toBe("");
    expect(r[1]?.priceCents).toBeNull();
    expect(r[1]?.commissionPct).toBeNull();
  });
});

describe("parseFacts", () => {
  it("comissão e ganhos extras não viram desconto; preço acima de R$ 1.000", () => {
    const f = parseFacts(`Smart TV 50" 4K
De R$ 2.799,00 por R$ 1.899,90
Comissão: 8%
Ganhos extras: +3% ou R$ 15,00 por venda
Mais vendido ⭐ 4,8 estrelas | +2,5 mil vendidos`);
    expect(f.priceCents).toBe(189990);
    expect(f.previousPriceCents).toBe(279900);
    expect(f.discountPct).toBeNull();
    expect(f.commissionPct).toBe(8);
    expect(f.extraCommissionPct).toBe(3);
    expect(f.extraEarningsCents).toBe(1500);
    expect(f.rating).toBe(4.8);
    expect(f.sales).toBe(2500);
    expect(f.bestSeller).toBe(true);
    expect(f.mostSearched).toBe(false);
  });
  it("lê desconto e selo de mais buscado sem confundir com comissão", () => {
    const f = parseFacts("Air fryer -30% R$ 1.249\nMais buscado da semana\n12% de comissão");
    expect(f.discountPct).toBe(30);
    expect(f.commissionPct).toBe(12);
    expect(f.priceCents).toBe(124900);
    expect(f.mostSearched).toBe(true);
  });
  it("não inventa nada quando a mensagem não informa", () => {
    const f = parseFacts("Olha que lindo esse vaso");
    expect([f.priceCents, f.discountPct, f.commissionPct, f.sales, f.rating, f.coupon]).toEqual([
      null,
      null,
      null,
      null,
      null,
      null,
    ]);
  });
});

describe("cleanUrl preserva o link de afiliada", () => {
  it("mantém parâmetros de comissão", () => {
    const u = "https://s.shopee.com.br/x?af_id=123&utm_source=an_1234&sub_id=garimou__a~b";
    expect(cleanUrl(u)).toBe(u);
  });
  it("mantém _ ~ - = no fim quando fazem parte do link", () => {
    expect(cleanUrl("https://x.com/p?tag=garimou-20")).toBe("https://x.com/p?tag=garimou-20");
    expect(cleanUrl("https://x.com/p?ref=a_")).toBe("https://x.com/p?ref=a_");
    expect(cleanUrl("https://x.com/p?k=")).toBe("https://x.com/p?k=");
    expect(cleanUrl("https://pt.wikipedia.org/wiki/Bola_(brinquedo)")).toBe(
      "https://pt.wikipedia.org/wiki/Bola_(brinquedo)",
    );
  });
  it("tira pontuação de frase, parêntese sem par e marcação do WhatsApp", () => {
    expect(cleanUrl("https://meli.la/1AbC.")).toBe("https://meli.la/1AbC");
    expect(cleanUrl("https://x.com/p?a=1),")).toBe("https://x.com/p?a=1");
    expect(cleanUrl("https://amzn.to/3xY*", "*")).toBe("https://amzn.to/3xY");
    expect(splitOffers("Veja (https://amzn.to/3xYz)")[0]?.url).toBe("https://amzn.to/3xYz");
  });
  it("links encurtados ficam como colados", () => {
    expect(splitOffers("https://s.shopee.com.br/9fMh4Js4IN")[0]?.url).toBe(
      "https://s.shopee.com.br/9fMh4Js4IN",
    );
  });
});

describe("externalIdFromUrl", () => {
  it("reconhece Mercado Livre, Shopee e endereço resolvido codificado", () => {
    expect(externalIdFromUrl("https://produto.mercadolivre.com.br/MLB-123456789-fone")).toBe(
      "MLB123456789",
    );
    expect(externalIdFromUrl("https://shopee.com.br/Garrafa-i.111.222")).toBe("111:222");
    expect(
      externalIdFromUrl(
        "https://x.com/gz?go=https%3A%2F%2Fwww.mercadolivre.com.br%2Fp%2FMLB19698455",
      ),
    ).toBe("MLB19698455");
    expect(externalIdFromUrl("https://exemplo.com")).toBeNull();
  });
});
