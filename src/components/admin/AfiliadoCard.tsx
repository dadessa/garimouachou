import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { testAfiliado } from "@/lib/integrations/integrations.functions";

type R = Awaited<ReturnType<typeof testAfiliado>>;
export function AfiliadoCard() {
  const test = useServerFn(testAfiliado);
  const [r, setR] = useState<R | null>(null);
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true);
    try {
      setR(await test());
    } catch {
      setR({
        ok: false,
        at: new Date().toISOString(),
        error: "Sem resposta do servidor. Tente de novo.",
        conta: null,
        conectados: [],
        pesquisaveis: [],
        amostra: null,
      });
    } finally {
      setBusy(false);
    }
  }
  const st = !r ? "Não testado" : r.ok ? "Conectado" : "Erro";
  return (
    <section
      aria-label="MCP do Afiliado"
      className="mb-5 space-y-3 rounded-2xl border border-border bg-card p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-extrabold text-navy">MCP do Afiliado</h2>
        <span
          className={`rounded-full px-3 py-0.5 text-xs font-bold ${r?.ok ? "bg-yellow text-navy" : r ? "bg-destructive text-destructive-foreground" : "bg-muted"}`}
        >
          {st}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        Pesquisa de produtos e conversão de links. A chave fica só no servidor.
      </p>
      <Button size="sm" disabled={busy} onClick={run}>
        {busy ? "Testando…" : "Testar conexão"}
      </Button>
      {r && (
        <div className="space-y-2 text-sm">
          <p className="text-xs text-muted-foreground">
            Testado em {new Date(r.at).toLocaleString("pt-BR")}
            {r.conta ? ` · conta ${r.conta}` : ""}
          </p>
          {r.error && <p className="font-semibold text-destructive">{r.error}</p>}
          {r.ok && (
            <>
              <p>
                <b>Marketplaces conectados (conversão de links):</b>{" "}
                {r.conectados.length ? r.conectados.join(", ") : "nenhum"}
              </p>
              <p>
                <b>Disponíveis para pesquisa:</b>{" "}
                {r.pesquisaveis.length
                  ? r.pesquisaveis
                      .map((s) => `${s.site}${s.monetized ? "" : " (sem comissão)"}`)
                      .join(", ")
                  : "nenhum"}
              </p>
              {r.amostra && (
                <div className="rounded-xl bg-muted p-2 text-xs">
                  <p className="font-bold">
                    Consulta real: “{r.amostra.consulta}” em {r.amostra.site}
                  </p>
                  {r.amostra.erro ? (
                    <p className="text-destructive">{r.amostra.erro}</p>
                  ) : r.amostra.itens.length ? (
                    <ul className="list-disc pl-4">
                      {r.amostra.itens.map((i) => (
                        <li key={i.url}>
                          {i.nome}
                          {i.preco != null
                            ? ` — ${i.preco.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`
                            : ""}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>Sem resultados.</p>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
