import { describe, expect, it } from "vitest";
import {
  passwordDestination,
  passwordValidation,
  strongPasswordValidation,
} from "./password-rules";

describe("troca de senha administrativa", () => {
  it("exige a senha atual", () => {
    expect(passwordValidation("", "NovaSenha123!", "NovaSenha123!")).toBe("Informe a senha atual.");
  });
  it("não aceita a senha atual como nova", () => {
    expect(passwordValidation("SenhaAtual123!", "SenhaAtual123!", "SenhaAtual123!")).toBe(
      "A nova senha deve ser diferente da senha atual.",
    );
  });
  it("confere a confirmação da nova senha", () => {
    expect(passwordValidation("Atual1234", "NovaSenha123!", "OutraSenha123!")).toBe(
      "As senhas não são iguais.",
    );
  });
  it("aceita uma senha diferente confirmada", () => {
    expect(passwordValidation("Atual1234", "NovaSenha123!", "NovaSenha123!")).toBeNull();
  });
  it("exige nova senha antes de abrir qualquer destino administrativo", () => {
    expect(passwordDestination(true, "/admin/produtos")).toBe("/admin/trocar-senha");
  });
  it("preserva o destino quando não há exigência", () => {
    expect(passwordDestination(false, "/admin/produtos")).toBe("/admin/produtos");
  });
});

describe("força da nova senha", () => {
  it("exige pelo menos 12 caracteres", () => {
    expect(strongPasswordValidation("NovaSenha1!")).not.toBeNull();
    expect(strongPasswordValidation("NovaSenha12!")).toBeNull();
  });
  it("exige letra maiúscula", () => {
    expect(strongPasswordValidation("novasenha123!")).not.toBeNull();
  });
  it("exige letra minúscula", () => {
    expect(strongPasswordValidation("NOVASENHA123!")).not.toBeNull();
  });
  it("exige número", () => {
    expect(strongPasswordValidation("NovaSenhaABC!")).not.toBeNull();
  });
  it("exige símbolo, não apenas espaço ou letras acentuadas", () => {
    expect(strongPasswordValidation("NovaSenha1234")).not.toBeNull();
    expect(strongPasswordValidation("NovaSenha123 ")).not.toBeNull();
    expect(strongPasswordValidation("NovaSenha123é")).not.toBeNull();
  });
});
