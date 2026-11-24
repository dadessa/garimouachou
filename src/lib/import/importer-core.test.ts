import { describe, expect, it } from "vitest";
import { importPrice } from "./importer-core";
import { emptyDraft } from "./rules";

const now = new Date("2026-11-24T12:00:00Z");
const api = (checked: string | null) => ({
  ...emptyDraft("https://x"),
  priceCents: 1990,
  fromApi: true,
  priceCheckedAt: checked,
});

describe("importPrice", () => {
  it("mantém a data original da consulta, não a do cadastro", () => {
    expect(importPrice(api("2026-11-24T10:00:00Z"), "shopee", now).checkedAt).toBe(
      "2026-11-24T10:00:00Z",
    );
  });
  it("preço de API sem data de consulta não é gravado", () => {
    expect(importPrice(api(null), "shopee", now)).toMatchObject({ cents: null, stale: true });
  });
  it("preço de consulta vencida não é gravado e bloqueia publicação", () => {
    expect(importPrice(api("2026-11-01T10:00:00Z"), "shopee", now)).toMatchObject({
      cents: null,
      stale: true,
    });
  });
});
