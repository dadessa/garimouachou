import { describe, expect, it } from "vitest";
import { IMAGE_HOSTS, isSafeUrl, readMeta } from "./safe-fetch";

describe("isSafeUrl (SSRF)", () => {
  const hosts = ["shopee.com.br", ...IMAGE_HOSTS];
  it("aceita só https em domínios permitidos", () => {
    expect(isSafeUrl("https://s.shopee.com.br/x", hosts)).toBe(true);
    expect(isSafeUrl("https://http2.mlstatic.com/a.jpg", hosts)).toBe(true);
    expect(isSafeUrl("http://shopee.com.br/x", hosts)).toBe(false);
    expect(isSafeUrl("https://169.254.169.254/latest", hosts)).toBe(false);
    expect(isSafeUrl("https://localhost/x", hosts)).toBe(false);
    expect(isSafeUrl("https://shopee.com.br.evil.com/x", hosts)).toBe(false);
    expect(isSafeUrl("https://user:p@shopee.com.br/x", hosts)).toBe(false);
    expect(isSafeUrl("https://shopee.com.br:8080/x", hosts)).toBe(false);
  });
});

describe("readMeta", () => {
  it("lê título e imagem Open Graph", () => {
    const m = readMeta(
      `<meta property="og:title" content="Fone &amp; Cabo"><meta content="https://http2.mlstatic.com/a.jpg" property="og:image">`,
    );
    expect(m.title).toBe("Fone & Cabo");
    expect(m.image).toBe("https://http2.mlstatic.com/a.jpg");
  });
});
