import { describe, expect, it } from "vitest";
import { passwordDestination, passwordValidation } from "./password-rules";

describe("troca de senha administrativa", () => {
  it("exige a senha atual", () => {
    expect(passwordValidation("", "NovaSenha123", "NovaSenha123")).not.toBeNull();
  });
  it("não aceita a senha atual como nova", () => {
    expect(passwordValidation("SenhaAtual123", "SenhaAtual123", "SenhaAtual123")).not.toBeNull();
  });
  it("confere a confirmação da nova senha", () => {
    expect(passwordValidation("Atual1234", "NovaSenha123", "OutraSenha123")).not.toBeNull();
  });
  it("aceita uma senha diferente confirmada", () => {
    expect(passwordValidation("Atual1234", "NovaSenha123", "NovaSenha123")).toBeNull();
  });
  it("exige nova senha antes de abrir qualquer destino administrativo", () => {
    expect(passwordDestination(true, "/admin/produtos")).toBe("/admin/trocar-senha");
  });
  it("preserva o destino quando não há exigência", () => {
    expect(passwordDestination(false, "/admin/produtos")).toBe("/admin/produtos");
  });
});
