import { describe, expect, it } from "vitest";
import { IMAGE_HOSTS, isPrivateIp, isSafeUrl, readMeta, sniffImage } from "./safe-fetch";

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

describe("isPrivateIp", () => {
  it("bloqueia redes internas e metadados", () => {
    for (const ip of [
      "127.0.0.1",
      "10.1.2.3",
      "172.20.0.1",
      "192.168.0.1",
      "169.254.169.254",
      "100.64.0.1",
      "0.0.0.0",
      "::1",
      "fd00::1",
      "::ffff:127.0.0.1",
    ])
      expect(isPrivateIp(ip)).toBe(true);
    expect(isPrivateIp("8.8.8.8")).toBe(false);
    expect(isPrivateIp("2606:4700::1111")).toBe(false);
  });
});

describe("sniffImage", () => {
  it("só reconhece JPG/PNG/WebP de verdade", () => {
    expect(sniffImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe("image/png");
    expect(sniffImage(new TextEncoder().encode("<svg onload=x>"))).toBeNull();
  });
});
