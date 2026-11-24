import { describe, expect, it } from "vitest";
import { importSlug } from "./rules";

describe("importSlug", () => {
  it("nunca gera hífen duplo quando o corte cai num espaço", () => {
    const s = importSlug("Parafusadeira e Furadeira de Impacto Inova Cases SCR-12948 12V com 2 Baterias e Maleta - R$ 108,99", "abcde");
    expect(s).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });
});
