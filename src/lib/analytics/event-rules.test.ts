import { describe, expect, it } from "vitest";
import { dedupKey, isBot, referrerHost, trackSchema } from "./event-rules";

const base = {
  type: "offer_click" as const,
  sid: "abcdef12-3456",
  path: "/p/balao",
  slug: "balao",
};

describe("regras de eventos", () => {
  it("dois cliques na mesma oferta em menos de 10 s contam uma vez", () => {
    expect(dedupKey(base, 0)).toBe(dedupKey(base, 5_000));
  });
  it("cliques com mais de 10 s de diferença contam separados", () => {
    expect(dedupKey(base, 0)).not.toBe(dedupKey(base, 10_000));
  });
  it("a mesma visita na mesma página dentro de 30 min conta uma vez", () => {
    const pv = { ...base, type: "page_view" as const, slug: undefined };
    expect(dedupKey(pv, 0)).toBe(dedupKey(pv, 29 * 60_000));
  });
  it("recusa tipo de evento desconhecido", () => {
    expect(trackSchema.safeParse({ ...base, type: "purchase" }).success).toBe(false);
  });
  it("recusa caminho que não é do site", () => {
    expect(trackSchema.safeParse({ ...base, path: "https://x.com" }).success).toBe(false);
  });
  it("robôs não contam", () => {
    expect(isBot("Googlebot/2.1")).toBe(true);
    expect(isBot(null)).toBe(true);
    expect(isBot("Mozilla/5.0 (iPhone) Safari/604.1")).toBe(false);
  });
  it("guarda só o domínio de origem e ignora o próprio site", () => {
    expect(referrerHost("https://www.instagram.com/p/abc?x=1", "garimouachou.lovable.app")).toBe(
      "instagram.com",
    );
    expect(
      referrerHost("https://garimouachou.lovable.app/busca", "garimouachou.lovable.app"),
    ).toBeNull();
  });
});
