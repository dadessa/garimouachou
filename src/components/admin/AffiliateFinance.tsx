import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { awinFinanceFn } from "@/lib/integrations/awin.functions";
import { COMMISSION_LABELS, summarizeTransactions, type CommissionState, type Money } from "@/lib/integrations/awin-finance";
import { toCsv } from "@/lib/analytics/campaign";

const format = (amount: number, currency: string) => new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(amount);
const showMoney = (v: Money | null) => v ? format(v.amount, v.currency) : "Não informado";
const box = "rounded-2xl border border-border bg-card p-4";
const states = Object.keys(COMMISSION_LABELS) as CommissionState[];

export function AffiliateFinance() {
  const loadReport = useServerFn(awinFinanceFn);
  const [days, setDays] = useState(30);
  const [result, setResult] = useState<Awaited<ReturnType<typeof awinFinanceFn>> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [query, setQuery] = useState("");
  const report = result?.report;
  const rows = useMemo(() => (report?.transactions ?? []).filter((r) =>
    (!status || r.state === status) &&
    (!query.trim() || (r.advertiserName + " " + r.id).toLowerCase().includes(query.trim().toLowerCase()))
  ).sort((a,b) => b.date.localeCompare(a.date)), [report, status, query]);
  const totals = useMemo(() => summarizeTransactions(rows), [rows]);

  async function load() {
    setBusy(true); setError(""); setResult(null); setStatus(""); setQuery("");
    try { setResult(await loadReport({ data: { days } })); }
    catch { setError("Falha na comunicação com o servidor."); }
    finally { setBusy(false); }
  }
  function exportCsv() {
    if (!report) return;
    const cell = (v: Money | null) => v ? String(v.amount).replace(".", ",") : "";
    const csv = toCsv([
      ["Fonte", "Awin"], ["Período UTC", report.range.start, report.range.end],
      ["ID transação", "Anunciante", "ID anunciante", "Data UTC", "Tipo", "Status", "Venda", "Moeda venda", "Comissão", "Moeda comissão"],
      ...rows.map((r) => [r.id, r.advertiserName, r.advertiserId, r.date, r.type, COMMISSION_LABELS[r.state], cell(r.sale), r.sale?.currency ?? "", cell(r.commission), r.commission?.currency ?? ""]),
    ]);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = "awin-transacoes-" + report.range.end.slice(0, 10) + ".csv"; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <div className="space-y-4">
    <div>
      <h1 className="text-2xl font-extrabold text-navy">Central financeira de afiliados</h1>
      <p className="text-sm text-muted-foreground">Transações reais da conta Awin. Os cliques do site não são vendas confirmadas.</p>
    </div>
    <section className={box}>
      <div className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-sm font-semibold">Período da transação (UTC)
          <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={days} disabled={busy} onChange={(e) => { setDays(Number(e.target.value)); setResult(null); setError(""); }}>
            {[7,15,30].map((n) => <option key={n} value={n}>Últimos {n} dias</option>)}
          </select>
        </label>
        <Button onClick={load} disabled={busy}>{busy ? "Consultando Awin…" : "Consultar transações"}</Button>
        <Button variant="outline" onClick={exportCsv} disabled={!report || busy}>Exportar CSV</Button>
        <Link to="/admin/integracoes" className="px-2 py-2 text-sm font-bold underline">Configurar Awin</Link>
      </div>
      {(error || result?.error) && <p role="alert" className="mt-2 text-sm text-destructive">{error || result?.error}</p>}
      {report && <p className="mt-2 text-xs text-muted-foreground">Fonte: API Awin · Consulta em {new Date(result!.at).toLocaleString("pt-BR")} · {report.range.start.replace("T"," ")} até {report.range.end.replace("T"," ")} UTC.</p>}
      {!report && !busy && !result?.error && !error && <p className="mt-3 text-sm text-muted-foreground">Consulte a rede para carregar os valores. Nenhuma receita foi estimada.</p>}
    </section>
    {report && <>
      <div className={box}>
        <p className="text-sm text-muted-foreground">O relatório abrange a conta Awin inteira, inclusive outras origens de tráfego. “Paga pela rede” indica o status das transações do período, não a data de crédito bancário. Valores em moedas distintas não são somados.</p>
        {(report.ignored > 0 || report.duplicates > 0 || report.namesUnavailable || totals.missingCommission > 0 || totals.missingSale > 0) && <p role="status" className="mt-2 text-xs text-muted-foreground">
          Registros inválidos/fora da conta: {report.ignored}; duplicados removidos: {report.duplicates}; comissão ausente nos resultados filtrados: {totals.missingCommission}; valor de venda ausente: {totals.missingSale}. {report.namesUnavailable ? "Nomes dos anunciantes indisponíveis; exibindo identificadores." : ""}
        </p>}
        <div className="mt-3 flex flex-wrap gap-2">
          <Input className="max-w-xs" aria-label="Buscar anunciante ou transação" placeholder="Buscar anunciante ou ID" value={query} onChange={(e) => setQuery(e.target.value)} />
          <select aria-label="Status da comissão" className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Todos os status</option>{states.map((s) => <option key={s} value={s}>{COMMISSION_LABELS[s]}</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Transações filtradas" value={String(rows.length)} />
        <Kpi label="Vendas aprovadas ou pagas" value={String(totals.confirmedSaleTransactions)} />
        <Kpi label="Comissões pendentes (registros)" value={String(totals.counts.pending)} />
        <Kpi label="Recusadas ou excluídas (registros)" value={String(totals.counts.declined + totals.counts.deleted)} />
      </div>
      {totals.currencies.map((c) => <section className={box} key={c.currency}>
        <h2 className="mb-3 font-extrabold text-navy">Valores informados · {c.currency}</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <Kpi label="Comissões pendentes" value={format(c.pending,c.currency)} />
          <Kpi label="Aprovadas, não marcadas pagas" value={format(c.approved,c.currency)} />
          <Kpi label="Pagas pela rede" value={format(c.paid,c.currency)} />
          <Kpi label="Recusadas / excluídas (não receber)" value={format(c.declined+c.deleted,c.currency)} />
          <Kpi label="Status desconhecido" value={format(c.unknown,c.currency)} />
          <Kpi label="Valor de vendas aprovadas/pagas" value={format(c.confirmedSales,c.currency)} />
        </div>
      </section>)}
      <section className={box}>
        <h2 className="mb-3 font-extrabold text-navy">Transações</h2>
        {rows.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma transação retornada para os filtros selecionados.</p> :
          <div className="max-h-[32rem] overflow-auto">
            <table className="w-full text-left text-sm">
              <thead><tr className="text-xs text-muted-foreground">{["Data UTC","Anunciante","Tipo","Status","Venda","Comissão"].map((h) => <th key={h} className="p-2">{h}</th>)}</tr></thead>
              <tbody>{rows.map((r) => <tr key={r.id} className="border-t border-border">
                <td className="p-2 whitespace-nowrap">{r.date.slice(0,10)}</td><td className="p-2">{r.advertiserName}<span className="block text-xs text-muted-foreground">#{r.id}</span></td>
                <td className="p-2">{r.type}</td><td className="p-2">{COMMISSION_LABELS[r.state]}</td>
                <td className="p-2 whitespace-nowrap">{showMoney(r.sale)}</td><td className="p-2 whitespace-nowrap">{showMoney(r.commission)}</td>
              </tr>)}</tbody>
            </table>
          </div>}
      </section>
    </>}
    <section className={box}>
      <h2 className="font-extrabold text-navy">Outras redes</h2>
      <p className="mt-1 text-sm text-muted-foreground">Amazon, Shopee, Mercado Livre, Magalu e demais redes: dados financeiros não conectados. Não serão contabilizados até haver uma fonte autorizada.</p>
      <p className="mt-2 text-xs text-muted-foreground">Nesta versão a consulta é sob demanda; não há armazenamento histórico, conciliação bancária nem atribuição por produto/canal.</p>
    </section>
  </div>;
}

function Kpi({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-border bg-background p-3"><p className="text-xs font-semibold text-muted-foreground">{label}</p><p className="mt-1 break-words text-lg font-extrabold text-navy tabular-nums">{value}</p></div>;
}
