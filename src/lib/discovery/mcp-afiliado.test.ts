import { describe, expect, it } from "vitest";
import { afToRow, convertedAffiliateLink, mapConvertedLinks, PRESET_MODE } from "./mcp-afiliado";

const item = {
  title: "Fone JBL",
  price_number: 254,
  url: "https://www.kabum.com.br/produto/1",
  affiliate_url: "https://www.kabum.com.br/produto/1",
  image_url: "https://img/x.jpg",
  discount_percent: 10,
  rating: 4.6,
  site: "kabum",
};
describe("afToRow", () => {
  it("catálogo sem comissão não recebe link de afiliada", () => {
    expect(afToRow(item, false)!.affiliate_url).toBeNull();
  });
  it("loja monetizada guarda o link convertido", () => {
    expect(
      afToRow({ ...item, affiliate_url: "https://s.shopee.com.br/abc" }, true)!.affiliate_url,
    ).toBe("https://s.shopee.com.br/abc");
  });
  it("converte preço e comissão fracionária", () => {
    const r = afToRow({ ...item, commission_rate: 0.08 }, true)!;
    expect(r.price_cents).toBe(25400);
    expect(r.commission_rate).toBe(8);
  });
  it("sem nome não vira oferta", () => {
    expect(afToRow({ ...item, title: "" }, true)).toBeNull();
  });
  it("rejeita URL insegura, desconto impossível e preço não finito", () => {
    expect(afToRow({ ...item, url: "javascript:alert(1)" }, true)).toBeNull();
    const r = afToRow({ ...item, discount_percent: 100, price_number: Infinity }, true)!;
    expect(r.price_cents).toBeNull();
    expect(r.discount_pct).toBeNull();
    expect(r.original_price_cents).toBeNull();
  });
  it("não inventa preço anterior nem comissão de loja não monetizada", () => {
    const r = afToRow({ ...item, commission_rate: 0.08 }, false)!;
    expect(r.original_price_cents).toBeNull();
    expect(r.commission_rate).toBeNull();
  });
  it("prefere o link de afiliada explícito e rejeita link cru", () => {
    expect(
      convertedAffiliateLink(
        item.url,
        "https://www.awin1.com/cread.php?awinmid=1",
        "https://short.example/abc",
      ),
    ).toBe("https://www.awin1.com/cread.php?awinmid=1");
    expect(convertedAffiliateLink(item.url, item.url, "http://example.com")).toBeNull();
  });
  it("atalho de tendência pesquisa por mais vendidos", () => {
    expect(PRESET_MODE["Encontrar produtos em tendência"]).toBe("tendencia");
  });
});

describe("conversão de links sem ambiguidade", () => {
  const a = "https://shopee.com.br/a";
  const b = "https://shopee.com.br/b";
  const x = "https://s.shopee.com.br/x";
  const y = "https://s.shopee.com.br/y";

  it("associa pela URL original mesmo quando a ordem é invertida", () => {
    const result = mapConvertedLinks(
      [a, b],
      [
        { ok: true, url_original: b, affiliate_url: y },
        { ok: true, url_original: a, affiliate_url: x },
      ],
    );
    expect(result.get(a)).toBe(x);
    expect(result.get(b)).toBe(y);
  });

  it("não adivinha a associação quando a resposta não identifica o original", () => {
    expect(mapConvertedLinks([a], [{ ok: true, affiliate_url: x }]).size).toBe(0);
  });

  it("rejeita URLs desconhecidas e resultados conflitantes", () => {
    const result = mapConvertedLinks(
      [a],
      [
        { ok: true, url_original: b, affiliate_url: y },
        { ok: true, url_original: a, affiliate_url: x },
        { ok: true, url_original: a, affiliate_url: y },
      ],
    );
    expect(result.size).toBe(0);
  });
});
