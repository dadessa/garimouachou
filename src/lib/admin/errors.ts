/** Mensagens amigáveis para erros do banco, sem detalhes técnicos. */
export function friendlyError(e: unknown): string {
  const err = e as { code?: string; message?: string } | null;
  const msg = err?.message ?? "";
  if (err?.code === "23505") return "Já existe um item com este endereço (slug). Escolha outro.";
  if (err?.code === "23514") {
    if (msg.includes("slug")) return "O slug só pode ter letras minúsculas, números e hífens.";
    return "Confira os preços: não podem ser negativos e o anterior precisa ser maior que o atual.";
  }
  if (err?.code === "42501") return "Sem permissão para esta ação.";
  if (msg.startsWith("Para publicar")) return msg;
  if (e instanceof Error && !("code" in e) && msg) return msg;
  return "Algo deu errado. Tente de novo.";
}
