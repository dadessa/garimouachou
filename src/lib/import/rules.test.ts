import { describe, expect, it } from "vitest";
import { csvRowToDraft, detectMarketplace, importSlug, parseCsv, parseLinkList } from "./rules";

const mks = [
  { slug: "shopee", allowed_domains: ["shopee.com.br", "s.shopee.com.br"] },
  { slug: "mercadolivre", allowed_domains: ["mercadolivre.com.br", "meli.la"] },
];

describe("importação", () => {
  it("lista de links ignora vazios e repetidos e preserva o link original", () => {
    expect(
      parseLinkList(
        " https://s.shopee.com.br/9fMh4Js4IN \n\nhttps://s.shopee.com.br/9fMh4Js4IN\nhttps://meli.la/11PSSL4",
      ),
    ).toEqual(["https://s.shopee.com.br/9fMh4Js4IN", "https://meli.la/11PSSL4"]);
  });
  it("descobre a loja pelo domínio, incluindo meli.la", () => {
    expect(detectMarketplace("https://meli.la/11PSSL4", mks)?.slug).toBe("mercadolivre");
    expect(detectMarketplace("https://s.shopee.com.br/x", mks)?.slug).toBe("shopee");
    expect(detectMarketplace("https://exemplo.com/x", mks)).toBeNull();
  });
  it("lê CSV com ponto e vírgula e aspas", () => {
    const rows = parseCsv(
      'Link;Nome;Descrição\nhttps://s.shopee.com.br/a;"Balão; 12 un";"Diz ""oi"""\n',
    );
    expect(rows).toEqual([
      { link: "https://s.shopee.com.br/a", nome: "Balão; 12 un", descricao: 'Diz "oi"' },
    ]);
  });
  it("categoria da planilha é achada por nome sem acento", () => {
    const d = csvRowToDraft({ link: "https://s.shopee.com.br/a", categoria: "Presentes" }, [
      { id: "c1", name: "Presentes", slug: "presentes" },
    ]);
    expect(d.categoryId).toBe("c1");
    expect(d.priceCents).toBeNull();
  });
  it("slug de importado sem nome", () => {
    expect(importSlug("", "abcde")).toBe("importado-abcde");
    expect(importSlug("Balão PIC", "x1")).toBe("balao-pic-x1");
  });
});
