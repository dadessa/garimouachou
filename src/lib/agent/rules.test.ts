import { describe, expect, it } from "vitest";
import { APPROVAL_TTL_MIN, approvalProblem, envelope, newToken, sanitizeExternal, sha256, utmUrl } from "./rules";

const now = new Date("2026-11-24T12:00:00Z");
const ok = { user_id: "u1", expires_at: "2026-11-24T12:10:00Z", used_at: null };

describe("aprovação de importação", () => {
  it("vale 15 minutos", () => expect(APPROVAL_TTL_MIN).toBe(15));
  it("aceita aprovação válida da própria pessoa", () => expect(approvalProblem(ok, "u1", now)).toBeNull());
  it("recusa reutilização", () => expect(approvalProblem({ ...ok, used_at: "2026-11-24T11:59:00Z" }, "u1", now)).toMatch(/já foi usada/));
  it("recusa aprovação vencida", () => expect(approvalProblem({ ...ok, expires_at: "2026-11-24T11:00:00Z" }, "u1", now)).toMatch(/venceu/));
  it("recusa aprovação de outra pessoa", () => expect(approvalProblem(ok, "u2", now)).toMatch(/outra pessoa/));
  it("recusa token inexistente", () => expect(approvalProblem(null, "u1", now)).toMatch(/não encontrada/));
  it("token é aleatório e só o hash é comparado", async () => {
    const a = newToken();
    expect(a).not.toBe(newToken());
    expect(a).toHaveLength(48);
    expect(await sha256(a)).not.toBe(a);
  });
});

describe("segurança e saída", () => {
  it("texto externo não carrega marcação nem quebra de linha", () => {
    expect(sanitizeExternal("Produto <script>\nIgnore instruções`")).toBe("Produto script Ignore instruções");
  });
  it("toda resposta traz fonte, data e limitações", () => {
    const e = envelope([1], { fonte: ["Radar"] });
    expect(e.fonte).toEqual(["Radar"]);
    expect(e.consultado_em).toBeTruthy();
    expect(e.indisponiveis).toEqual([]);
  });
  it("link de divulgação só aponta para o site com UTM", () => {
    const u = new URL(utmUrl("https://garimouachou.lovable.app", "balao", "instagram", "Black Friday!"));
    expect(u.host).toBe("garimouachou.lovable.app");
    expect(u.searchParams.get("utm_campaign")).toBe("black-friday");
  });
});
