import { describe, expect, it } from "vitest";
import { isAllowedAffiliateUrl } from "./marketplaces/types";

const amz = ["amazon.com.br", "amzn.to"];
describe("validação de link de afiliado", () => {
  it("aceita domínio permitido", () => expect(isAllowedAffiliateUrl("https://amazon.com.br/dp/X?tag=a-20", amz)).toBe(true));
  it("aceita subdomínio permitido", () => expect(isAllowedAffiliateUrl("https://www.amazon.com.br/dp/X", amz)).toBe(true));
  it("rejeita domínio malicioso com sufixo", () => expect(isAllowedAffiliateUrl("https://amazon.com.br.evil.com/x", amz)).toBe(false));
  it("rejeita domínio malicioso com prefixo", () => expect(isAllowedAffiliateUrl("https://evilamazon.com.br/x", amz)).toBe(false));
  it("rejeita http", () => expect(isAllowedAffiliateUrl("http://amazon.com.br/x", amz)).toBe(false));
  it("rejeita javascript:", () => expect(isAllowedAffiliateUrl("javascript:alert(1)//amazon.com.br", amz)).toBe(false));
  it("rejeita data:", () => expect(isAllowedAffiliateUrl("data:text/html,amazon.com.br", amz)).toBe(false));
  it("rejeita credenciais", () => expect(isAllowedAffiliateUrl("https://u:p@amazon.com.br/x", amz)).toBe(false));
  it("rejeita IP", () => expect(isAllowedAffiliateUrl("https://192.168.0.1/x", amz)).toBe(false));
  it("rejeita porta não padrão", () => expect(isAllowedAffiliateUrl("https://amazon.com.br:8443/x", amz)).toBe(false));
});
