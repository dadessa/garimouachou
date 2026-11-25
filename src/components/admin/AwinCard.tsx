import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AWIN_RELATIONSHIPS,
  canGenerateAwinLink,
  type AwinRelationship,
} from "@/lib/integrations/awin";
import { awinProgrammesFn, awinLinkFn } from "@/lib/integrations/awin.functions";

const labels: Record<AwinRelationship, string> = {
  joined: "Parcerias aprovadas",
  pending: "Aguardando aprovação",
  suspended: "Suspensas",
  rejected: "Recusadas",
  notjoined: "Ainda não solicitadas",
};

export function AwinCard() {
  const list = useServerFn(awinProgrammesFn);
  const link = useServerFn(awinLinkFn);
  const [relationship, setRelationship] = useState<AwinRelationship>("joined");
  const [result, setResult] = useState<Awaited<ReturnType<typeof awinProgrammesFn>> | null>(null);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState("");
  const [destination, setDestination] = useState("");
  const [generated, setGenerated] = useState("");
  const [error, setError] = useState("");
  const programmes = result?.ok ? result.programmes : [];
  const filtered = programmes.filter((p) =>
    p.name.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const programme = programmes.find((p) => String(p.id) === selected);

  async function load() {
    setBusy(true);
    setResult(null);
    setSelected("");
    setGenerated("");
    setError("");
    try {
      setResult(await list({ data: { relationship } }));
    } catch {
      setError("Não foi possível consultar a Awin.");
    } finally {
      setBusy(false);
    }
  }

  async function generate() {
    if (
      !programme ||
      relationship !== "joined" ||
      !canGenerateAwinLink(programme, destination.trim())
    )
      return;
    setBusy(true);
    setGenerated("");
    setError("");
    try {
      const r = await link({
        data: { advertiserId: programme.id, destination: destination.trim() },
      });
      if (r.url) setGenerated(r.url);
      else setError(r.error ?? "Não foi possível gerar o link.");
    } catch {
      setError("Falha na comunicação com a Awin.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mb-4 space-y-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-extrabold text-navy">Awin — rede de afiliados</h2>
        <span className="text-xs font-bold">
          {result?.ok
            ? "API validada nesta consulta"
            : result
              ? "Não validada"
              : "Aguardando teste"}
        </span>
      </div>
      <p className="text-sm text-muted-foreground">
        Consulte anunciantes do Brasil, confira parcerias e gere links oficiais. Nenhum produto é
        publicado automaticamente.
      </p>
      <p className="text-xs text-muted-foreground">
        Configure AWIN_PUBLISHER_ID e AWIN_ACCESS_TOKEN nos Secrets do servidor. Nunca cole seu
        token neste painel.
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="grid gap-1 text-sm font-semibold">
          Situação da parceria
          <select
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={relationship}
            disabled={busy}
            onChange={(e) => {
              setRelationship(e.target.value as AwinRelationship);
              setResult(null);
              setSelected("");
              setGenerated("");
              setError("");
            }}
          >
            {AWIN_RELATIONSHIPS.map((v) => (
              <option key={v} value={v}>
                {labels[v]}
              </option>
            ))}
          </select>
        </label>
        <Button disabled={busy} onClick={load}>
          {busy ? "Consultando…" : "Consultar Awin"}
        </Button>
        <a
          href="https://ui.awin.com/awin-api"
          target="_blank"
          rel="noopener noreferrer"
          className="px-2 py-2 text-sm font-bold underline"
        >
          Credenciais Awin
        </a>
      </div>
      {result && (
        <p role="status" className="text-xs text-muted-foreground">
          Consulta: {new Date(result.at).toLocaleString("pt-BR")}{" "}
          {result.ok ? "· " + programmes.length + " programa(s)" : ""}
        </p>
      )}
      {(error || result?.error) && (
        <p role="alert" className="text-sm text-destructive">
          {error || result?.error}
        </p>
      )}
      {result?.ok && (
        <>
          <Input
            aria-label="Buscar anunciante"
            placeholder="Buscar Natura, KaBuM!, Samsung…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="max-h-64 overflow-auto rounded-md border border-border">
            {filtered.length ? (
              <ul className="divide-y divide-border">
                {filtered.map((p) => (
                  <li
                    key={p.id}
                    className="flex flex-wrap items-center justify-between gap-2 p-2 text-sm"
                  >
                    <span className="min-w-0 break-words">
                      {p.name}{" "}
                      <span className="text-xs text-muted-foreground">
                        · ID {p.id}
                        {p.linkStatus === "offline" ? " · links indisponíveis" : ""}
                      </span>
                    </span>
                    {relationship === "joined" && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={
                          busy ||
                          p.status !== "active" ||
                          p.linkStatus === "offline" ||
                          !p.domains.length
                        }
                        onClick={() => {
                          setSelected(String(p.id));
                          setGenerated("");
                          setDestination("");
                          setError("");
                        }}
                      >
                        Selecionar
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="p-3 text-sm text-muted-foreground">
                Nenhum anunciante encontrado nesta situação.
              </p>
            )}
          </div>
        </>
      )}
      {relationship === "joined" && programme && (
        <div className="space-y-2 border-t border-border pt-3">
          <h3 className="font-bold">Gerar link — {programme.name}</h3>
          <p className="break-words text-xs text-muted-foreground">
            Domínios autorizados: {programme.domains.join(", ")}
          </p>
          <label className="grid gap-1 text-sm">
            URL original do produto
            <Input
              type="url"
              value={destination}
              disabled={busy}
              placeholder="https://..."
              onChange={(e) => {
                setDestination(e.target.value);
                setGenerated("");
              }}
            />
          </label>
          <Button
            disabled={busy || !canGenerateAwinLink(programme, destination.trim())}
            onClick={generate}
          >
            Gerar link de afiliada
          </Button>
          {generated && (
            <div className="space-y-2">
              <Input aria-label="Link de afiliada gerado" readOnly value={generated} />
              <Button
                variant="outline"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(generated);
                    toast.success("Link copiado.");
                  } catch {
                    toast.error("Selecione e copie o link manualmente.");
                  }
                }}
              >
                Copiar link
              </Button>
              <p className="text-xs text-muted-foreground">
                Link retornado pela Awin; atribuição e comissão dependem das regras do anunciante.
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
