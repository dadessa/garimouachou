import { describe, expect, it } from "vitest";
import { afToRow, PRESET_MODE } from "./mcp-afiliado";

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
  it("atalho de tendência pesquisa por mais vendidos", () => {
    expect(PRESET_MODE["Encontrar produtos em tendência"]).toBe("tendencia");
  });
});
