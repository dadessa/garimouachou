export const MIN_PASSWORD_LENGTH = 12;
export const PASSWORD_REQUIREMENTS =
  "Use pelo menos 12 caracteres, com letra maiúscula, minúscula, número e símbolo.";

export function strongPasswordValidation(password: string) {
  if (password.length < MIN_PASSWORD_LENGTH)
    return "A nova senha precisa ter pelo menos 12 caracteres.";
  if (!/[A-Z]/.test(password)) return "Inclua pelo menos uma letra maiúscula.";
  if (!/[a-z]/.test(password)) return "Inclua pelo menos uma letra minúscula.";
  if (!/[0-9]/.test(password)) return "Inclua pelo menos um número.";
  if (!/[^\p{L}\p{N}\s]/u.test(password)) return "Inclua pelo menos um símbolo.";
  return null;
}

export function passwordValidation(current: string, password: string, confirmation: string) {
  if (!current) return "Informe a senha atual.";
  const invalid = strongPasswordValidation(password);
  if (invalid) return invalid;
  if (password !== confirmation) return "As senhas não são iguais.";
  if (password === current) return "A nova senha deve ser diferente da senha atual.";
  return null;
}

export function passwordDestination(required: boolean, next: string) {
  return required ? "/admin/trocar-senha" : next;
}
