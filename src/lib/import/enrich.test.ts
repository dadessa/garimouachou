import { describe, expect, it } from "vitest";
import { emptyFieldPatch, needsExplicitDraft } from "./enrich";

const cur = {
  name: "",
  main_image_url: null,
  category_id: null,
  short_description: "",
  tags: [],
  external_id: null,
};
const found = {
  name: "Balão 16",
  imageUrl: "/img/product-images/a.jpg",
  categoryId: "c1",
  description: "Desc",
  tags: ["festa"],
  externalId: "MLB1",
};

describe("enriquecimento", () => {
  it("sem nome ou sem foto exige rascunho explícito", () => {
    expect(needsExplicitDraft(["foto"])).toBe(true);
    expect(needsExplicitDraft(["nome", "categoria"])).toBe(true);
    expect(needsExplicitDraft(["categoria"])).toBe(false);
  });
  it("preenche só campos vazios e gera slug pelo nome real", () => {
    const p = emptyFieldPatch(cur, found, (n) => n.toLowerCase().replace(/\s+/g, "-"));
    expect(p["name"]).toBe("Balão 16");
    expect(p["slug"]).toBe("balão-16");
    expect(p["main_image_url"]).toBe("/img/product-images/a.jpg");
    expect(p["affiliate_url"]).toBeUndefined();
  });
  it("não sobrescreve dados já preenchidos", () => {
    const p = emptyFieldPatch({ ...cur, name: "Meu nome", category_id: "c9" }, found, (n) => n);
    expect(p["name"]).toBeUndefined();
    expect(p["slug"]).toBeUndefined();
    expect(p["category_id"]).toBeUndefined();
  });
});
