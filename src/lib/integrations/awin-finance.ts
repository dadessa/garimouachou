/** Financeiro Awin: normaliza apenas campos necessários e não mistura moedas. */
export type CommissionState = "pending" | "approved" | "paid" | "declined" | "deleted" | "unknown";
export type Money = { amount: number; currency: string };
export interface AwinTransaction {
  id: number;
  advertiserId: number;
  date: string;
  type: string;
  state: CommissionState;
  sale: Money | null;
  commission: Money | null;
}

function record(v: unknown): Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}
function money(v: unknown): Money | null {
  const r = record(v);
  const amount = r["amount"],
    currency = r["currency"];
  if (
    typeof amount !== "number" ||
    !Number.isFinite(amount) ||
    Math.abs(amount) > 1e12 ||
    typeof currency !== "string" ||
    !/^[A-Z]{3}$/.test(currency)
  )
    return null;
  return { amount, currency };
}
function stateOf(raw: unknown, paid: unknown): CommissionState {
  if (raw === "approved") return paid === true ? "paid" : "approved";
  if (raw === "pending" || raw === "declined" || raw === "deleted") return raw;
  return "unknown";
}
export function transactionRange(days: number, now = new Date()) {
  if (![7, 15, 30].includes(days) || !Number.isFinite(now.getTime()))
    throw new Error("Período inválido.");
  const end = new Date(Math.floor(now.getTime() / 1000) * 1000);
  const start = new Date(end.getTime() - days * 86_400_000 + 1000);
  return { start: start.toISOString().slice(0, 19), end: end.toISOString().slice(0, 19), days };
}

export function normalizeTransactions(raw: unknown, publisherId: string) {
  if (!Array.isArray(raw)) throw new Error("Resposta inesperada da API de transações Awin.");
  const seen = new Set<number>();
  const rows: AwinTransaction[] = [];
  let ignored = 0,
    duplicates = 0;
  for (const v of raw) {
    const r = record(v),
      id = r["id"],
      advertiserId = r["advertiserId"];
    const date = r["transactionDate"];
    if (
      typeof id !== "number" ||
      !Number.isSafeInteger(id) ||
      id <= 0 ||
      typeof advertiserId !== "number" ||
      !Number.isSafeInteger(advertiserId) ||
      advertiserId <= 0 ||
      String(r["publisherId"]) !== publisherId ||
      typeof date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/.test(date) ||
      !Number.isFinite(Date.parse(/(?:Z|[+-]\d{2}:\d{2})$/.test(date) ? date : date + "Z"))
    ) {
      ignored++;
      continue;
    }
    if (seen.has(id)) {
      duplicates++;
      continue;
    }
    seen.add(id);
    rows.push({
      id,
      advertiserId,
      date,
      type: typeof r["type"] === "string" ? r["type"].slice(0, 100) : "Não informado",
      state: stateOf(r["commissionStatus"], r["paidToPublisher"]),
      sale: money(r["saleAmount"]),
      commission: money(r["commissionAmount"]),
    });
  }
  return { rows, ignored, duplicates };
}

export function summarizeTransactions(rows: AwinTransaction[]) {
  const counts: Record<CommissionState, number> = {
    pending: 0,
    approved: 0,
    paid: 0,
    declined: 0,
    deleted: 0,
    unknown: 0,
  };
  const amounts = new Map<
    string,
    {
      currency: string;
      pending: number;
      approved: number;
      paid: number;
      declined: number;
      deleted: number;
      unknown: number;
      confirmedSales: number;
    }
  >();
  const get = (currency: string) => {
    let r = amounts.get(currency);
    if (!r) {
      r = {
        currency,
        pending: 0,
        approved: 0,
        paid: 0,
        declined: 0,
        deleted: 0,
        unknown: 0,
        confirmedSales: 0,
      };
      amounts.set(currency, r);
    }
    return r;
  };
  let missingCommission = 0,
    missingSale = 0,
    confirmedSaleTransactions = 0;
  const seen = new Set<number>();
  for (const r of rows) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    counts[r.state]++;
    if (r.commission) get(r.commission.currency)[r.state] += r.commission.amount;
    else missingCommission++;
    if (
      (r.state === "approved" || r.state === "paid") &&
      ["sale", "mobile sale", "mobile app purchase"].includes(r.type.trim().toLowerCase())
    ) {
      confirmedSaleTransactions++;
      if (r.sale) get(r.sale.currency).confirmedSales += r.sale.amount;
      else missingSale++;
    }
  }
  return {
    counts,
    confirmedSaleTransactions,
    missingCommission,
    missingSale,
    currencies: [...amounts.values()].sort((a, b) => a.currency.localeCompare(b.currency)),
  };
}

export const COMMISSION_LABELS: Record<CommissionState, string> = {
  pending: "Pendente",
  approved: "Aprovada, não marcada como paga",
  paid: "Paga pela rede",
  declined: "Recusada",
  deleted: "Excluída",
  unknown: "Status não reconhecido",
};
