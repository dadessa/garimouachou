import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AfiliadoCard } from "@/components/admin/AfiliadoCard";
import { AwinCard } from "@/components/admin/AwinCard";
import { listIntegrations, testIntegration } from "@/lib/integrations/integrations.functions";

export const Route = createFileRoute("/admin/_painel/integracoes")({
  head: () => ({
    meta: [
      { title: "Integrações — Painel Garimou Achou!" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: Integrations,
});

const NAMES: Record<string, string> = {
  mercadolivre: "Mercado Livre",
  shopee: "Shopee",
  amazon: "Amazon",
  magalu: "Magalu",
};
const STATUS: Record<string, { label: string; cls: string }> = {
  not_configured: { label: "Não configurada", cls: "bg-muted text-foreground" },
  awaiting_authorization: {
    label: "Aguardando autorização",
    cls: "bg-primary text-primary-foreground",
  },
  connected: { label: "Conectada", cls: "bg-navy text-background" },
  error: { label: "Erro de conexão", cls: "bg-destructive text-destructive-foreground" },
};
const HOW: Record<string, string> = {
  shopee:
    "Precisa do App ID e do App Secret da Shopee Affiliate Open API. Com eles: busca de ofertas reais e link de afiliada da sua conta.",
  mercadolivre:
    "Precisa do ID e da chave secreta do aplicativo no portal de desenvolvedores. O link de afiliada continua sendo o que você cola (não há API oficial para gerá-lo).",
  amazon:
    "Sem API conectada. Importe por link ou planilha; preço fica oculto até haver API oficial.",
  magalu: "Sem API conectada. Importe por link ou planilha.",
};
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR") : "—");

function Integrations() {
  const listFn = useServerFn(listIntegrations);
  const testFn = useServerFn(testIntegration);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin", "integrations"], queryFn: () => listFn() });
  const [busy, setBusy] = useState("");

  async function test(slug: string) {
    setBusy(slug);
    try {
      const r = await testFn({ data: { slug } });
      if (r.status === "connected") toast.success("Conexão confirmada com a API oficial.");
      else if (r.status === "not_configured") toast.error("Credenciais ainda não configuradas.");
      else toast.error("A loja recusou a conexão. Confira as credenciais.");
      await qc.invalidateQueries({ queryKey: ["admin", "integrations"] });
    } finally {
      setBusy("");
    }
  }

  return (
    <>
      <h1 className="mb-1 text-2xl font-extrabold text-navy">Integrações</h1>
      <p className="mb-5 text-sm text-muted-foreground">
        Uma loja só aparece como "Conectada" depois de um teste real com a API oficial. As
        credenciais ficam guardadas só no servidor.
      </p>
      <AfiliadoCard />
      <AwinCard />
      {q.isLoading && <p>Carregando…</p>}
      {q.error && <p className="text-destructive">Não foi possível carregar as integrações.</p>}
      <div className="grid gap-4 md:grid-cols-2">
        {(q.data ?? []).map((i) => {
          const st = STATUS[i.status]!;
          return (
            <section
              key={i.slug}
              className="space-y-3 rounded-2xl border border-border bg-card p-4"
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-lg font-extrabold text-navy">{NAMES[i.slug]}</h2>
                <span className={`rounded-full px-3 py-1 text-xs font-bold ${st.cls}`}>
                  {st.label}
                </span>
              </div>
              <p className="text-sm">{HOW[i.slug]}</p>
              <dl className="grid grid-cols-2 gap-1 text-xs text-muted-foreground">
                <dt>Último teste</dt>
                <dd>{fmt(i.lastCheckedAt)}</dd>
                <dt>Última sincronização</dt>
                <dd>{fmt(i.lastSyncAt)}</dd>
              </dl>
              {i.lastError && (
                <p className="text-xs text-destructive">Último erro: {i.lastError}</p>
              )}
              {i.hasApi && (
                <Button
                  variant="outline"
                  disabled={!i.configured || busy === i.slug}
                  onClick={() => test(i.slug)}
                >
                  {busy === i.slug ? "Testando…" : "Testar conexão"}
                </Button>
              )}
              {i.hasApi && !i.configured && (
                <p className="text-xs text-muted-foreground">
                  Peça no chat para configurar as credenciais quando forem liberadas.
                </p>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}
