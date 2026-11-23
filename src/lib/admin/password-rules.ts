export function passwordValidation(current: string, password: string, confirmation: string) {
  if (!current) return "Informe a senha atual.";
  if (password.length < 8) return "A nova senha precisa ter pelo menos 8 caracteres.";
  if (password !== confirmation) return "As senhas não são iguais.";
  if (password === current) return "A nova senha deve ser diferente da senha atual.";
  return null;
}

export function passwordDestination(required: boolean, next: string) {
  return required ? "/admin/trocar-senha" : next;
}
