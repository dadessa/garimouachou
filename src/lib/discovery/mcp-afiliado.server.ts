import { convertedAffiliateLink, safeHttps, type AfItem } from "./mcp-afiliado";

const BASE = "https://mcpdoafiliado.com/api/v1";
export const afConfigured = () => !!process.env["MCP_AFILIADO_API_KEY"];

async function call<T>(path: string, body?: unknown): Promise<T> {
  const key = process.env["MCP_AFILIADO_API_KEY"];
  if (!key) throw new Error("MCP do Afiliado não configurado.");
  const res = await fetch(BASE + path, {
    method: body ? "POST" : "GET",
    headers: { "X-API-Key": key, "content-type": "application/json" },
    redirect: "manual",
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(20_000),
  });
  const j = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    message?: string;
    error?: string;
  } & T;
  if (!res.ok || j.success === false) throw new Error(j.message ?? j.error ?? `HTTP ${res.status}`);
  return j;
}

export interface BotInfo {
  search_sites: string[];
  public_catalogs: Record<string, { searchable: boolean; monetized: boolean }>;
  convertible_routes?: { by_provider: { provider: string }[] };
}
export const botInfo = () => call<BotInfo>("/bot");

/** Lojas pesquisáveis com indicação de monetização pela conta. */
export function searchableSites(b: BotInfo) {
  const out = (b.search_sites ?? []).map((s) => ({ site: s, monetized: true }));
  for (const [s, v] of Object.entries(b.public_catalogs ?? {}))
    if (v.searchable && !out.some((o) => o.site === s))
      out.push({ site: s, monetized: v.monetized });
  return out;
}

export const searchProducts = (a: {
  query: string;
  site: string;
  sort: string;
  limit: number;
  price_max?: number;
}) => call<{ items: AfItem[] }>("/search-products", a).then((r) => r.items ?? []);

/** Gera links de afiliada da conta (só onde o MCP do Afiliado tem rota autorizada). */
export async function convertLinks(urls: string[]) {
  const input = [...new Set(urls.filter(safeHttps))].slice(0, 150);
  if (!input.length) return new Map<string, string>();
  const r = await call<{
    items: {
      ok: boolean;
      url_original?: string;
      url?: string;
      affiliate_url?: string | null;
      final_url?: string | null;
    }[];
  }>("/convert-links", { urls: input });
  const m = new Map<string, string>();
  const items = r.items ?? [];
  const known = new Set(input);
  items.forEach((it, i) => {
    const explicit = it.url_original ?? it.url;
    const src = explicit && known.has(explicit) ? explicit :
      !explicit && items.length === input.length ? input[i] : undefined;
    if (it.ok !== true || !src) return;
    const link = convertedAffiliateLink(src, it.affiliate_url, it.final_url);
    if (link) m.set(src, link);
  });
  return m;
}
export const convertibleProviders = (b: BotInfo) =>
  (b.convertible_routes?.by_provider ?? []).map((p) => p.provider);
