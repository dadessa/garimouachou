import { describe, expect, it } from "vitest";
import { campaignUrl, clickRate, toCsv } from "./campaign";
import { SITE_URL } from "@/lib/site";

describe("links de divulgação", () => {
  it("leva para a página do produto no site com UTM", () => {
    expect(
      campaignUrl("balao", { source: "instagram", medium: "social", campaign: "Dia das Crianças" }),
    ).toBe(
      `${SITE_URL}/p/balao?utm_source=instagram&utm_medium=social&utm_campaign=dia-das-criancas`,
    );
  });
  it("sem nome de campanha usa o produto", () => {
    expect(campaignUrl("balao", { source: "tiktok", medium: "social", campaign: "" })).toContain(
      "utm_campaign=balao",
    );
  });
});

describe("indicadores", () => {
  it("taxa de cliques por visita", () => {
    expect(clickRate(3, 40)).toBe(7.5);
    expect(clickRate(5, 0)).toBe(0);
  });
  it("CSV protege fórmulas e aspas", () => {
    expect(toCsv([["=SOMA(1)", 'a"b']])).toBe('\ufeff\'=SOMA(1);"a""b"');
  });
});
