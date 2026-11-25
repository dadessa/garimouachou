import { canGenerateAwinLink, normalizeProgrammes, verifiedAwinLink, type AwinRelationship } from "./awin";
import { normalizeTransactions, transactionRange, summarizeTransactions } from "./awin-finance";

function credentials() {
  const id = process.env["AWIN_PUBLISHER_ID"]?.trim() ?? "";
  const token = process.env["AWIN_ACCESS_TOKEN"]?.trim() ?? "";
  return /^\d{1,15}$/.test(id) && token ? { id, token } : null;
}
export const awinConfigured = () => !!credentials();

async function call(path: string, query?: URLSearchParams, body?: object): Promise<unknown> {
  const c = credentials();
  if (!c) throw new Error("Configure AWIN_PUBLISHER_ID e AWIN_ACCESS_TOKEN nos Secrets.");
  const url = new URL("https://api.awin.com/publishers/" + c.id + "/" + path);
  if (query) url.search = query.toString();
  const r = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: { Authorization: "Bearer " + c.token, Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  if (!r.ok) {
    if (r.status === 401 || r.status === 403) throw new Error("Awin recusou a autenticação ou a permissão da conta.");
    if (r.status === 429) throw new Error("Limite de consultas Awin atingido. Tente novamente mais tarde.");
    throw new Error("Awin retornou HTTP " + r.status + ".");
  }
  return r.json();
}

export async function listAwinProgrammes(relationship: AwinRelationship) {
  return normalizeProgrammes(await call("programmes", new URLSearchParams({ countryCode: "BR", relationship })));
}

export async function generateAwinLink(advertiserId: number, destination: string) {
  const c = credentials();
  if (!c) throw new Error("Credenciais Awin não configuradas.");
  // Revalidar a parceria no servidor antes de cada conversão.
  const programmes = await listAwinProgrammes("joined");
  const programme = programmes.find((p) => p.id === advertiserId);
  if (!programme || !canGenerateAwinLink(programme, destination))
    throw new Error("Parceria não ativa, links indisponíveis ou URL fora dos domínios autorizados.");
  const r = await call("linkbuilder/generate", undefined, { advertiserId, destinationUrl: destination, shorten: false });
  const value = r && typeof r === "object" ? (r as Record<string, unknown>)["url"] : null;
  const url = verifiedAwinLink(value, c.id, advertiserId, destination);
  if (!url) throw new Error("A Awin não devolveu um link verificável para esta conta e destino.");
  return url;
}

/** Consulta somente leitura, por data da transação, não por data de pagamento. */
export async function awinFinancialReport(days: number) {
  const c = credentials();
  if (!c) throw new Error("Credenciais Awin não configuradas.");
  const range = transactionRange(days);
  const raw = await call("transactions/", new URLSearchParams({
    startDate: range.start, endDate: range.end, timezone: "UTC", dateType: "transaction",
  }));
  const normalized = normalizeTransactions(raw, c.id);
  let names = new Map<number, string>();
  let namesUnavailable = false;
  try {
    names = new Map((await listAwinProgrammes("joined")).map((p) => [p.id, p.name]));
  } catch { namesUnavailable = true; }
  const transactions = normalized.rows.map((r) => ({ ...r, advertiserName: names.get(r.advertiserId) ?? "Anunciante " + r.advertiserId }));
  return {
    range, transactions, totals: summarizeTransactions(transactions),
    ignored: normalized.ignored, duplicates: normalized.duplicates, namesUnavailable,
  };
}
