import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { garimparAgora } from "@/lib/garimpo/garimpo.functions";
import { nextRun, type PlanStep } from "@/lib/garimpo/rules";

export const Route = createFileRoute("/admin/_painel/garimpo")({
  head: () => ({
    meta: [
      { title: "Garimpo automático — Painel Garimou Achou!" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: Garimpo,
});

const PHASE: Record<string, string> = {
  search: "Pesquisando nas lojas",
  convert: "Gerando links de afiliada",
  create: "Criando pré-cadastros",
  done: "Concluído",
};
const STATUS: Record<string, string> = {
  running: "Em andamento",
  ok: "Concluído",
  partial: "Concluído com pendências",
  failed: "Falhou",
};
const dt = (s: string | null) =>
  s
    ? new Date(s).toLocaleString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        dateStyle: "short",
        timeStyle: "short",
      })
    : "—";
const dur = (a: string, b: string | null) => {
  if (!b) return "—";
  const s = Math.round((new Date(b).getTime() - new Date(a).getTime()) / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}min ${s % 60}s`;
};
const card = "rounded-2xl border border-border bg-card p-4";
const lbl = "text-xs font-bold text-muted-foreground";

function Garimpo() {
  const qc = useQueryClient();
  const run = useServerFn(garimparAgora);
  const settings = useQuery({
    queryKey: ["admin", "garimpo", "settings"],
    queryFn: async () =>
      (await supabase.from("garimpo_settings").select("*").eq("id", 1).single()).data,
  });
  const runs = useQuery({
    queryKey: ["admin", "garimpo", "runs"],
    queryFn: async () =>
      (
        await supabase
          .from("garimpo_runs")
          .select("*")
          .order("started_at", { ascending: false })
          .limit(15)
      ).data ?? [],
    refetchInterval: (q) => (q.state.data?.some((r) => r.status === "running") ? 3000 : false),
  });
  const pending = useQuery({
    queryKey: ["admin", "garimpo", "pending"],
    queryFn: async () =>
      (
        await supabase
          .from("products")
          .select("id", { count: "exact", head: true })
          .eq("review_status", "pending")
          .eq("status", "draft")
      ).count ?? 0,
  });
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const st = settings.data;
  useEffect(() => {
    if (!st) return;
    setForm({
      run_hour: String(st.run_hour),
      frequency_hours: String(st.frequency_hours),
      daily_limit: String(st.daily_limit),
      request_limit: String(st.request_limit),
      marketplaces: st.marketplaces.join(", "),
      keywords: st.keywords.join(", "),
      min_price: st.min_price_cents != null ? String(st.min_price_cents / 100) : "",
      max_price: st.max_price_cents != null ? String(st.max_price_cents / 100) : "",
      min_commission: st.min_commission_pct != null ? String(st.min_commission_pct) : "",
      min_discount: st.min_discount_pct != null ? String(st.min_discount_pct) : "",
    });
  }, [st]);

  const list = runs.data ?? [];
  const last = list[0];
  const active = list.find((r) => r.status === "running");
  const lastSched = list.find((r) => r.trigger === "agendada");

  async function go() {
    setBusy(true);
    try {
      let id: string | undefined = active?.id;
      for (let i = 0; i < 20; i++) {
        const r = await run({ data: id ? { runId: id } : {} });
        id = r.id;
        await qc.invalidateQueries({ queryKey: ["admin", "garimpo"] });
        if (r.busy) {
          toast.info("Outra chamada está processando este garimpo. Acompanhe o progresso.");
          break;
        }
        if (r.status !== "running") {
          if (r.status === "failed")
            toast.error("Garimpo terminou com falha. Confira o histórico.");
          else if (r.status === "partial") toast.warning("Garimpo concluído com pendências.");
          else toast.success("Garimpo concluído.");
          break;
        }
      }
      await qc.invalidateQueries({ queryKey: ["admin"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function save(enabled?: boolean) {
    const n = (v: string | undefined) =>
      v && v.trim() !== "" ? Number(v.replace(",", ".")) : null;
    const cents = (v: string | undefined) => (n(v) != null ? Math.round(n(v)! * 100) : null);
    const arr = (v: string | undefined) =>
      (v ?? "")
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean)
        .slice(0, 20);
    const { error } = await supabase
      .from("garimpo_settings")
      .update({
        ...(enabled != null ? { enabled } : {}),
        run_hour: n(form["run_hour"]) ?? 6,
        frequency_hours: n(form["frequency_hours"]) ?? 24,
        daily_limit: n(form["daily_limit"]) ?? 20,
        request_limit: n(form["request_limit"]) ?? 12,
        marketplaces: arr(form["marketplaces"]).map((x) => x.toLowerCase()),
        keywords: arr(form["keywords"]),
        min_price_cents: cents(form["min_price"]),
        max_price_cents: cents(form["max_price"]),
        min_commission_pct: n(form["min_commission"]),
        min_discount_pct: n(form["min_discount"]),
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);
    if (error)
      toast.error("Não foi possível salvar. Confira os valores (quantidade 1–50, consultas 1–40).");
    else {
      toast.success("Configuração salva.");
      qc.invalidateQueries({ queryKey: ["admin", "garimpo", "settings"] });
    }
  }

  const field = (k: string, label: string, ph = "", type = "text") => (
    <label className="grid gap-1">
      <span className={lbl}>{label}</span>
      <Input
        type={type}
        value={form[k] ?? ""}
        placeholder={ph}
        onChange={(e) => setForm({ ...form, [k]: e.target.value })}
        className="h-10 bg-background"
      />
    </label>
  );

  const plan = (active?.plan ?? []) as PlanStep[];
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-navy">Garimpo automático</h1>
          <p className="text-sm text-muted-foreground">
            Pesquisa produtos reais nas lojas conectadas e cria pré-cadastros. Nada é publicado sem
            a sua aprovação.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Sem palavras-chave manuais, prioriza termos comerciais do Google Trends Brasil (RSS).
            Interesse de pesquisa não representa vendas.
          </p>
        </div>
        <Button
          onClick={go}
          disabled={busy}
          className="h-11 bg-yellow px-6 font-extrabold text-navy hover:bg-yellow/90"
        >
          {busy ? "Garimpando…" : active ? "Continuar garimpo" : "Garimpar agora"}
        </Button>
      </div>

      {active && (
        <div className={`${card} mb-4`} role="status" aria-live="polite">
          <p className="font-bold text-navy">{PHASE[active.phase]}</p>
          {active.phase === "search" && (
            <>
              <p className="text-sm text-muted-foreground">
                Consulta {Math.min(active.cursor + 1, plan.length)} de {plan.length}
                {plan[active.cursor]
                  ? ` · ${plan[active.cursor]!.site}: “${plan[active.cursor]!.keyword}”`
                  : ""}
              </p>
              <progress className="mt-2 w-full" max={plan.length || 1} value={active.cursor} />
            </>
          )}
          <p className="mt-1 text-sm">
            {active.found} encontrados · {active.discarded} descartados · {active.queued}{" "}
            pré-cadastrados
          </p>
        </div>
      )}

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Última execução"
          value={last ? dt(last.started_at) : "Nenhuma"}
          sub={last ? (STATUS[last.status] ?? last.status) : ""}
        />
        <Stat
          label="Próxima execução"
          value={
            st?.enabled
              ? dt(nextRun(st, lastSched ? new Date(lastSched.started_at) : null).toISOString())
              : "Desligada"
          }
          sub={st?.enabled ? "Horário de Brasília" : "Ligue abaixo"}
        />
        <Stat
          label="Aguardando aprovação"
          value={String(pending.data ?? 0)}
          sub="Pré-cadastros do garimpo"
        />
        <Stat
          label="Último garimpo"
          value={last ? `${last.found} / ${last.queued}` : "—"}
          sub="encontrados / pré-cadastrados"
        />
      </div>

      {last && (
        <section className={`${card} mb-4`}>
          <h2 className="mb-2 text-lg font-extrabold text-navy">Resultado do último garimpo</h2>
          <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <Item k="Encontrados" v={last.found} />
            <Item k="Descartados pelos filtros" v={last.discarded} />
            <Item k="Aguardando aprovação" v={last.queued} />
            <Item k="Sem link monetizado" v={last.unmonetized} />
            <Item k="Já no catálogo" v={last.duplicates} />
            <Item k="Consultas feitas" v={last.requests} />
            <Item k="Tempo de execução" v={dur(last.started_at, last.finished_at)} />
            <Item k="Origem" v={last.trigger === "manual" ? "Manual" : "Agendada"} />
          </dl>
          {Object.keys(last.discard_reasons as object).length > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              Descartes:{" "}
              {Object.entries(last.discard_reasons as Record<string, number>)
                .map(([k, v]) => `${k} (${v})`)
                .join(" · ")}
            </p>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            Fontes:{" "}
            {(last.sources as { fonte: string; status: string }[])
              .map((s) => `${s.fonte} — ${s.status}`)
              .join(" · ") || "nenhuma"}
          </p>
          {last.errors.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-xs text-destructive">
              {last.errors.slice(0, 8).map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
          {last.unmonetized > 0 && (
            <p className="mt-2 text-xs">
              Produtos sem link monetizado ficam no{" "}
              <Link to="/admin/radar" className="font-bold underline">
                Radar
              </Link>{" "}
              como oportunidades com pendência.
            </p>
          )}
          {last.queued > 0 && (
            <Link
              to="/admin/produtos"
              search={{ aba: "aprovacao" }}
              className="mt-3 inline-block rounded-full bg-primary px-4 py-2 text-sm font-extrabold text-primary-foreground"
            >
              Revisar pré-cadastros
            </Link>
          )}
        </section>
      )}

      <section className={`${card} mb-4`}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-extrabold text-navy">Configuração</h2>
          <label className="flex items-center gap-2 text-sm font-bold">
            <input
              type="checkbox"
              className="size-5"
              checked={!!st?.enabled}
              onChange={(e) => save(e.target.checked)}
            />
            Garimpo automático ligado
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {field("run_hour", "Horário (hora, Brasília)", "6", "number")}
          <label className="grid gap-1">
            <span className={lbl}>Frequência</span>
            <select
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={form["frequency_hours"] ?? "24"}
              onChange={(e) => setForm({ ...form, frequency_hours: e.target.value })}
            >
              <option value="6">A cada 6 horas</option>
              <option value="12">A cada 12 horas</option>
              <option value="24">Diária</option>
              <option value="48">A cada 2 dias</option>
              <option value="168">Semanal</option>
            </select>
          </label>
          {field("daily_limit", "Produtos por garimpo (até 50)", "20", "number")}
          {field("request_limit", "Limite de consultas (até 40)", "12", "number")}
          {field("marketplaces", "Lojas prioritárias", "kabum, magalu (vazio = todas)")}
          {field("keywords", "Categorias / palavras-chave", "vazio = Google Trends + categorias")}
          {field("min_price", "Preço mínimo (R$)", "")}
          {field("max_price", "Preço máximo (R$)", "")}
          {field("min_commission", "Comissão mínima (%)", "")}
          {field("min_discount", "Desconto mínimo (%)", "")}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Comissão mínima descarta produtos cuja loja não informa comissão. Descrições não são
          geradas automaticamente: use “Gerar com IA” ao revisar.
        </p>
        <Button className="mt-3" onClick={() => save()}>
          Salvar configuração
        </Button>
      </section>

      <section className={card}>
        <h2 className="mb-2 text-lg font-extrabold text-navy">Histórico</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead className="text-muted-foreground">
              <tr>
                <th className="py-1 pr-3">Início</th>
                <th className="pr-3">Origem</th>
                <th className="pr-3">Situação</th>
                <th className="pr-3">Encontrados</th>
                <th className="pr-3">Descartados</th>
                <th className="pr-3">Pré-cadastros</th>
                <th className="pr-3">Sem link</th>
                <th>Tempo</th>
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="py-1.5 pr-3">{dt(r.started_at)}</td>
                  <td className="pr-3">{r.trigger === "manual" ? "Manual" : "Agendada"}</td>
                  <td className="pr-3">{STATUS[r.status]}</td>
                  <td className="pr-3">{r.found}</td>
                  <td className="pr-3">{r.discarded}</td>
                  <td className="pr-3">{r.queued}</td>
                  <td className="pr-3">{r.unmonetized}</td>
                  <td>{dur(r.started_at, r.finished_at)}</td>
                </tr>
              ))}
              {!list.length && (
                <tr>
                  <td colSpan={8} className="py-3 text-muted-foreground">
                    Nenhum garimpo ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className={card}>
      <p className={lbl}>{label}</p>
      <p className="text-lg font-extrabold text-navy">{value}</p>
      <p className="text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}
function Item({ k, v }: { k: string; v: string | number }) {
  return (
    <div>
      <dt className={lbl}>{k}</dt>
      <dd className="font-extrabold text-navy">{v}</dd>
    </div>
  );
}
