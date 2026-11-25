import { describe, expect, it } from "vitest";
import { normalizeProgrammes, canGenerateAwinLink, verifiedAwinLink } from "./awin";

describe("Awin", () => {
  const p = normalizeProgrammes([{ id: 123, name: "Loja", status: "active", linkStatus: "online", validDomains: [{ domain: "loja.com.br" }] }])[0]!;
  it("valida o domínio autorizado, não apenas uma parte do endereço", () => {
    expect(canGenerateAwinLink(p, "https://www.loja.com.br/p")).toBe(true);
    expect(canGenerateAwinLink(p, "https://loja.com.br.example.org/p")).toBe(false);
    expect(canGenerateAwinLink({ ...p, linkStatus: "offline" }, "https://loja.com.br/p")).toBe(false);
    expect(canGenerateAwinLink({ ...p, status: "hidden" }, "https://loja.com.br/p")).toBe(false);
  });
  it("confere conta, anunciante e destino no link oficial", () => {
    const dest = "https://loja.com.br/p";
    const url = "https://www.awin1.com/cread.php?awinmid=123&awinaffid=456&ued=" + encodeURIComponent(dest);
    expect(verifiedAwinLink(url, "456", 123, dest)).toBe(url);
    expect(verifiedAwinLink(url, "999", 123, dest)).toBeNull();
    expect(verifiedAwinLink(url, "456", 456, dest)).toBeNull();
    expect(verifiedAwinLink(url, "456", 123, "https://loja.com.br/outro")).toBeNull();
    expect(verifiedAwinLink(url.replace("www.awin1.com", "evil.example"), "456", 123, dest)).toBeNull();
  });
  it("não interpreta uma resposta inesperada como lista vazia", () => {
    expect(() => normalizeProgrammes({ error: "invalid" })).toThrow();
  });
});
