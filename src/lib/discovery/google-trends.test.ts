import { describe, expect, it } from "vitest";
import { commercialKeywords, parseTrendsRss } from "./google-trends";
import { buildPlan } from "../garimpo/rules";

const now = new Date("2026-11-25T14:00:00Z");
const item = (title: string, date = "Wed, 25 Nov 2026 12:00:00 GMT") =>
  `<item><title>${title}</title><ht:approx_traffic>10,000+</ht:approx_traffic><pubDate>${date}</pubDate></item>`;
const rss = (...items: string[]) => `<rss><channel>${items.join("")}</channel></rss>`;

describe("Google Trends Brasil", () => {
  it("extrai pesquisas recentes e preserva tráfego aproximado como texto", () => {
    const trends = parseTrendsRss(rss(item("Air fryer &amp; promoção")), now);
    expect(trends).toEqual([
      {
        title: "Air fryer & promoção",
        traffic: "10,000+",
        publishedAt: "2026-11-25T12:00:00.000Z",
      },
    ]);
  });

  it("ignora duplicatas, dados antigos e títulos com marcação", () => {
    const trends = parseTrendsRss(
      rss(
        item("Air fryer"),
        item("air fryer"),
        item("Notebook", "Sun, 22 Nov 2026 12:00:00 GMT"),
        item("&lt;script&gt;"),
      ),
      now,
    );
    expect(trends.map((t) => t.title)).toEqual(["Air fryer"]);
  });

  it("rejeita XML com declaração de entidade", () => {
    expect(() => parseTrendsRss("<!DOCTYPE rss><rss></rss>", now)).toThrow();
  });

  it("seleciona somente produtos reconhecidos e exclui notícias negativas", () => {
    const trends = parseTrendsRss(
      rss(item("Flamengo"), item("Recall iPhone"), item("iPhone 17"), item("Air fryer")),
      now,
    );
    expect(commercialKeywords(trends)).toEqual(["smartphone", "air fryer"]);
  });

  it("prioriza tendências no plano sem ultrapassar o limite de pesquisas", () => {
    const plan = buildPlan(
      [{ site: "shopee", monetized: true }],
      ["fone bluetooth", "notebook"],
      { marketplaces: [], request_limit: 2 },
      now,
      ["air fryer"],
    );
    expect(plan).toHaveLength(2);
    expect(plan[0]?.keyword).toBe("air fryer");
  });

  it("mantém o plano normal quando não existem tendências", () => {
    const plan = buildPlan(
      [{ site: "shopee", monetized: true }],
      ["notebook"],
      { marketplaces: [], request_limit: 2 },
      now,
      [],
    );
    expect(plan.map((p) => p.keyword)).toEqual(["notebook"]);
  });
});
