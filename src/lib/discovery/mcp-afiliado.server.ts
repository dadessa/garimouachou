import type { AfItem } from "./mcp-afiliado";

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
