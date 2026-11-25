import { describe, expect, it } from "vitest";
import { normalizeTransactions, summarizeTransactions, transactionRange } from "./awin-finance";

const base = { id: 1, publisherId: 123, advertiserId: 77, transactionDate: "2026-11-25T09:00:00", type: "Sale", commissionStatus: "approved", paidToPublisher: false, commissionAmount: { amount: 5.5, currency: "BRL" }, saleAmount: { amount: 100, currency: "BRL" } };
describe("financeiro Awin", () => {
  it("separa aprovadas e pagas sem duplicar valores", () => {
    const r = normalizeTransactions([base, { ...base, id: 2, paidToPublisher: true }, base], "123");
    const s = summarizeTransactions(r.rows);
    expect(r.duplicates).toBe(1);
    expect(s.counts.approved).toBe(1);
    expect(s.counts.paid).toBe(1);
    expect(s.currencies[0]).toMatchObject({ currency: "BRL", approved: 5.5, paid: 5.5, confirmedSales: 200 });
  });
  it("não soma moedas ou vendas pendentes e não inventa valor ausente", () => {
    const r = normalizeTransactions([base, { ...base, id: 2, commissionStatus: "pending", commissionAmount: { amount: 3, currency: "USD" } }, { ...base, id: 3, commissionAmount: null }, { ...base, id: 4, publisherId: 999 }], "123");
    const s = summarizeTransactions(r.rows);
    expect(r.ignored).toBe(1);
    expect(s.missingCommission).toBe(1);
    expect(s.currencies).toEqual([expect.objectContaining({ currency: "BRL", approved: 5.5, confirmedSales: 200 }), expect.objectContaining({ currency: "USD", pending: 3, confirmedSales: 0 })]);
  });
  it("não transforma resposta inválida em relatório zerado", () => {
    expect(() => normalizeTransactions({ error: "403" }, "123")).toThrow();
  });
  it("limita consulta a 30 dias e usa UTC", () => {
    expect(transactionRange(30, new Date("2026-11-25T13:00:00Z"))).toEqual({ days: 30, start: "2026-10-26T13:00:01", end: "2026-11-25T13:00:00" });
    expect(() => transactionRange(90)).toThrow();
  });
});
