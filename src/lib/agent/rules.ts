/** Regras puras do agente comercial (testáveis). */
export const APPROVAL_TTL_MIN = 15;
export const MAX_IMPORT_BATCH = 20;
export const AGENT_MAX_STEPS = 6;
export const AGENT_MAX_OUTPUT_TOKENS = 3000;
export const AGENT_RUNS_PER_HOUR = 30;
export const MIN_COVERAGE = 0.45;

export interface Envelope<T> {
  resultado: T;
  fonte: string[];
  consultado_em: string;
  validade: string | null;
  indisponiveis: string[];
  limitacoes: string[];
}
export const envelope = <T>(resultado: T, e: Partial<Omit<Envelope<T>, "resultado">> = {}): Envelope<T> => ({
  resultado,
  fonte: e.fonte ?? [],
  consultado_em: e.consultado_em ?? new Date().toISOString(),
  validade: e.validade ?? null,
  indisponiveis: e.indisponiveis ?? [],
  limitacoes: e.limitacoes ?? [],
});

export async function sha256(s: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
export function newToken() {
  const a = new Uint8Array(24);
  crypto.getRandomValues(a);
  return [...a].map((x) => x.toString(16).padStart(2, "0")).join("");
}

/** A aprovação vale só para quem a criou, dentro do prazo, uma única vez. */
export function approvalProblem(a: { user_id: string; expires_at: string; used_at: string | null } | null, userId: string, now = new Date()) {
  if (!a) return "Aprovação não encontrada.";
  if (a.user_id !== userId) return "Esta aprovação é de outra pessoa.";
  if (a.used_at) return "Esta aprovação já foi usada.";
  if (new Date(a.expires_at) <= now) return "A aprovação venceu. Prepare a importação de novo.";
  return null;
}

/** Texto externo (nome de produto etc.) entra no modelo como dado, nunca como instrução. */
export function sanitizeExternal(s: string | null | undefined, max = 200) {
  return String(s ?? "")
    .replace(/[\u0000-\u001f\u007f<>`]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/** UTM fixo do agente; só para o site próprio. */
export function utmUrl(siteUrl: string, slug: string, channel: string, campaign: string) {
  const u = new URL(`/p/${encodeURIComponent(slug)}`, siteUrl);
  u.searchParams.set("utm_source", channel);
  u.searchParams.set("utm_medium", "social");
  u.searchParams.set("utm_campaign", campaign.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "garimou");
  return u.toString();
}
