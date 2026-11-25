/** Regras puras do garimpo automático (testáveis). */
export interface GarimpoSettings {
  enabled: boolean;
  run_hour: number;
  frequency_hours: number;
  daily_limit: number;
  request_limit: number;
  marketplaces: string[];
  keywords: string[];
  min_price_cents: number | null;
  max_price_cents: number | null;
  min_commission_pct: number | null;
  min_discount_pct: number | null;
}
export interface Candidate {
  marketplace_slug: string;
  price_cents: number | null;
  discount_pct: number | null;
  commission_rate: number | null;
}
export type SearchSource = {
  site: string;
  monetized: boolean;
  provider?: "mcp_afiliado" | "shopee_api";
};
export type PlanStep = SearchSource & { keyword: string };

/** Prefere a API oficial quando configurada, sem depender do MCP ou duplicar consultas à Shopee. */
export function searchSources(sites: SearchSource[], directShopee: boolean): SearchSource[] {
  const result = new Map<string, SearchSource>();
  for (const source of sites) {
    const site = source.site.trim().toLowerCase();
    if (!site || result.has(site)) continue;
    result.set(site, { ...source, site });
  }
  if (directShopee)
    result.set("shopee", { site: "shopee", monetized: true, provider: "shopee_api" });
  return [...result.values()];
}

/** Execução interrompida há mais que isto é considerada falha (libera a trava). */
export const STALE_RUN_MIN = 30;
/** Pré-cadastros criados por chamada (mantém cada chamada curta). */
export const CREATE_PER_STEP = 5;

/** Hora de Brasília (UTC-3, sem horário de verão). */
export const brasiliaHour = (d: Date) => (d.getUTCHours() + 21) % 24;

/** Próxima execução prevista (UTC): próximo horário configurado após o intervalo da última. */
export function nextRun(
  s: Pick<GarimpoSettings, "run_hour" | "frequency_hours">,
  last: Date | null,
  now = new Date(),
) {
  const step = Math.min(s.frequency_hours, 24) * 36e5;
  const t0 = new Date(now);
  t0.setUTCHours((s.run_hour + 3) % 24, 0, 0, 0);
  let t = t0.getTime() - 86_400_000;
  const min = Math.max(
    now.getTime(),
    last ? last.getTime() + s.frequency_hours * 36e5 - 15 * 60_000 : 0,
  );
  while (t < min) t += step;
  return new Date(t);
}

/** Deve começar agora? Na hora configurada (ou a cada N horas a partir dela) e sem execução recente. */
export function isDue(s: GarimpoSettings, last: Date | null, now = new Date()) {
  if (!s.enabled) return false;
  const h = brasiliaHour(now);
  const step = Math.min(s.frequency_hours, 24);
  if ((h - s.run_hour + 24) % step !== 0) return false;
  if (!last) return true;
  return now.getTime() - last.getTime() >= s.frequency_hours * 36e5 - 15 * 60_000;
}

/** Motivo do descarte pelos filtros configurados, ou null quando passa. Sem dado = não aprova filtro mínimo. */
export function discardReason(c: Candidate, s: GarimpoSettings): string | null {
  if (s.marketplaces.length && !s.marketplaces.includes(c.marketplace_slug))
    return "loja fora da prioridade";
  if (s.min_price_cents != null && (c.price_cents == null || c.price_cents < s.min_price_cents))
    return "abaixo da faixa de preço";
  if (s.max_price_cents != null && (c.price_cents == null || c.price_cents > s.max_price_cents))
    return "acima da faixa de preço";
  if (
    s.min_discount_pct != null &&
    s.min_discount_pct > 0 &&
    (c.discount_pct ?? 0) < s.min_discount_pct
  )
    return "desconto abaixo do mínimo";
  if (
    s.min_commission_pct != null &&
    s.min_commission_pct > 0 &&
    (c.commission_rate ?? 0) < s.min_commission_pct
  )
    return "comissão abaixo do mínimo ou não informada";
  return null;
}

/** Plano de consultas: lojas × palavras-chave, rotacionado por dia e limitado por requisições. */
export function buildPlan(
  sites: SearchSource[],
  keywords: string[],
  s: Pick<GarimpoSettings, "marketplaces" | "request_limit">,
  now = new Date(),
  priorityKeywords: string[] = [],
): PlanStep[] {
  const pri = s.marketplaces.length
    ? sites.filter((x) => s.marketplaces.includes(x.site.toLowerCase()))
    : sites;
  const ordered = [...pri].sort((a, b) => Number(b.monetized) - Number(a.monetized));
  const priority = [...new Set(priorityKeywords.map((k) => k.trim()).filter(Boolean))];
  const kws = [...new Set(keywords.map((k) => k.trim()).filter(Boolean))].filter(
    (k) => !priority.includes(k),
  );
  if (!ordered.length || (!kws.length && !priority.length)) return [];
  const day = Math.floor(now.getTime() / 86_400_000);
  const rot = kws.map((_, i) => kws[(i + day) % kws.length]!);
  const plan: PlanStep[] = [];
  for (const keyword of [...priority, ...rot])
    for (const x of ordered) {
      if (plan.length >= s.request_limit) return plan;
      plan.push({ ...x, keyword });
    }
  return plan;
}

export const runStatusOf = (errors: number, created: number, found: number, successful = found) =>
  errors === 0 ? "ok" : created || successful ? "partial" : "failed";

/** Postgres não aceita atualizar a mesma chave duas vezes no mesmo UPSERT. */
export function deduplicateOffers<T extends { marketplace_slug: string; external_id: string }>(
  rows: T[],
): T[] {
  const unique = new Map<string, T>();
  for (const row of rows) {
    const key = JSON.stringify([row.marketplace_slug, row.external_id]);
    if (!unique.has(key)) unique.set(key, row);
  }
  return [...unique.values()];
}

/** Bloqueios explícitos do provedor: não insistir nem tentar contornar a proteção. */
export function blockedSearchMessage(site: string, message: string): string | null {
  if (
    !/anti[- ]?bot|captcha|KABUM_PROXY_BASE|\bHTTP\s+(?:401|403|429)\b|\[(?:401|403|429)\]/i.test(
      message,
    )
  ) {
    return null;
  }
  return `[${site.toLowerCase()}] Busca suspensa nesta execução: acesso bloqueado ou limitado pela fonte.`;
}

/** Compatível com erros históricos de execuções iniciadas antes desta correção. */
export function isSearchBlocked(site: string, errors: string[]) {
  const key = site.toLowerCase();
  return errors.some(
    (error) =>
      error.startsWith(`[${key}] Busca suspensa nesta execução:`) ||
      (error.toLowerCase().startsWith(key + "/") && !!blockedSearchMessage(key, error)),
  );
}
