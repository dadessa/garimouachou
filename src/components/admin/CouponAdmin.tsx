import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { awinCouponsFn } from "@/lib/integrations/awin.functions";
import { couponSchema, couponIssues, type Coupon } from "@/lib/coupons/rules";
import { marketplaces } from "@/lib/marketplaces";

export function CouponAdmin() {
  const load = useServerFn(awinCouponsFn);
  const [rows, setRows] = useState<Coupon[]>([]);
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [raw, setRaw] = useState("");
  const [selected, setSelected] = useState<string[]>([]);

  function merge(incoming: Coupon[]) {
    setRows((old) => [
      ...old.filter((c) => !incoming.some((n) => n.id === c.id)),
      ...incoming.map((c) => ({ ...c, approved: false })),
    ]);
    setSelected([]);
  }

  function edit(id: string, patch: Partial<Coupon>) {
    setRows((old) => old.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    setSelected((old) => old.filter((x) => x !== id));
  }

  const issues = (c: Coupon) => {
    const parsed = couponSchema.safeParse(c);
    if (!parsed.success) return ["Campos inválidos"];
    try {
      return couponIssues(parsed.data);
    } catch {
      return ["URL inválida"];
    }
  };

  async function importAwin() {
    setBusy(true);
    setMessage("");
    try {
      const r = await load({ data: { page } });
      if (!r.result) {
        setMessage(r.error ?? "Falha na consulta.");
        return;
      }
      merge(r.result.coupons);
      setMessage(
        r.result.received + " recebidos; " + r.result.ignored + " ignorados nesta página.",
      );
    } catch {
      setMessage("Não foi possível consultar a Awin.");
    } finally {
      setBusy(false);
    }
  }

  function importJson() {
    try {
      if (raw.length > 500_000) throw new Error();
      const list: unknown = JSON.parse(raw);
      if (!Array.isArray(list) || list.length > 100) throw new Error();
      const parsed = list.map((c) => couponSchema.parse(c));
      if (new Set(parsed.map((c) => c.id)).size !== parsed.length) throw new Error();
      merge(parsed);
      setRaw("");
      setMessage(parsed.length + " registros importados para revisão.");
    } catch {
      setMessage("JSON inválido. Use o formato do registro de cupons.");
    }
  }

  async function copyApproved() {
    const approved = rows
      .filter((c) => selected.includes(c.id) && !issues(c).length)
      .map((c) => ({ ...c, approved: true }));
    if (!approved.length) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(approved, null, 2));
      toast.success("Registros copiados. A publicação ainda depende do commit de revisão.");
    } catch {
      toast.error("Não foi possível copiar os registros.");
    }
  }

  return (
    <section className="mb-4 space-y-3 rounded-2xl border border-border bg-card p-4">
      <h2 className="text-lg font-extrabold text-navy">Central de Cupons</h2>
      <p className="text-xs text-muted-foreground">
        Importe cupons das parcerias Awin no Brasil ou registros JSON. Revise os códigos, regras e
        links antes de selecionar. Nesta versão, a publicação é realizada pelo registro revisado no
        Git; os rascunhos desta tela não são persistidos.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-sm">
          Página Awin
          <Input
            type="number"
            min={1}
            max={20}
            value={page}
            className="w-20"
            onChange={(e) => setPage(Number(e.target.value))}
          />
        </label>
        <Button
          onClick={importAwin}
          disabled={busy || !Number.isInteger(page) || page < 1 || page > 20}
        >
          {busy ? "Consultando..." : "Importar cupons Awin"}
        </Button>
      </div>
      <details>
        <summary className="cursor-pointer text-sm font-bold">Importar registros JSON</summary>
        <textarea
          aria-label="Registros de cupons JSON"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          className="mt-2 min-h-24 w-full rounded-xl border border-border bg-background p-2 text-sm"
          placeholder="Cole uma lista de registros conforme src/lib/coupons/rules.ts"
        />
        <Button variant="outline" onClick={importJson} disabled={!raw.trim()}>
          Revisar registros
        </Button>
      </details>
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
      {rows.map((c) => {
        const errors = issues(c);
        return (
          <article key={c.id} className="space-y-2 rounded-xl border border-border p-3">
            <p className="font-bold">
              {c.merchant} — {c.title}
            </p>
            <p className="break-all font-mono text-sm">{c.code}</p>
            <p className="text-xs">Vencimento: {new Date(c.endsAt).toLocaleString("pt-BR")}</p>
            <p className="whitespace-pre-wrap break-words text-xs">{c.terms}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="grid gap-1 text-xs">
                Tipo de benefício
                <select
                  className="rounded-lg border bg-background p-2"
                  value={c.kind}
                  onChange={(e) =>
                    edit(c.id, { kind: e.target.value as Coupon["kind"], amount: null })
                  }
                >
                  <option value="other">Condições específicas</option>
                  <option value="percent">Percentual</option>
                  <option value="fixed">Valor fixo em centavos</option>
                  <option value="shipping">Frete grátis</option>
                </select>
              </label>
              {(c.kind === "percent" || c.kind === "fixed") && (
                <label className="grid gap-1 text-xs">
                  Valor (% ou centavos)
                  <Input
                    type="number"
                    value={c.amount ?? ""}
                    onChange={(e) =>
                      edit(c.id, { amount: e.target.value ? Number(e.target.value) : null })
                    }
                  />
                </label>
              )}
              <label className="grid gap-1 text-xs">
                Compra mínima (centavos, se informada)
                <Input
                  type="number"
                  min={0}
                  value={c.minimumCents ?? ""}
                  onChange={(e) =>
                    edit(c.id, { minimumCents: e.target.value ? Number(e.target.value) : null })
                  }
                />
              </label>
              <label className="grid gap-1 text-xs">
                Marketplace
                <select
                  className="rounded-lg border bg-background p-2"
                  value={c.marketplace}
                  onChange={(e) => edit(c.id, { marketplace: e.target.value, productSlug: "" })}
                >
                  <option value="">Anunciante independente</option>
                  {marketplaces.map((m) => (
                    <option key={m.slug} value={m.slug}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-xs">
                Slug do produto (opcional)
                <Input
                  value={c.productSlug}
                  onChange={(e) => edit(c.id, { productSlug: e.target.value })}
                />
              </label>
            </div>
            <p className="break-all text-xs text-muted-foreground">Link: {c.affiliateUrl}</p>
            {errors.length > 0 && <p className="text-xs text-destructive">{errors.join("; ")}</p>}
            <label className="flex gap-2 text-sm">
              <input
                type="checkbox"
                checked={selected.includes(c.id)}
                disabled={errors.length > 0}
                onChange={(e) =>
                  setSelected((old) =>
                    e.target.checked ? [...old, c.id] : old.filter((x) => x !== c.id),
                  )
                }
              />
              Conferi as regras, o benefício, o destino e a autorização de divulgação.
            </label>
          </article>
        );
      })}
      <Button onClick={copyApproved} disabled={!selected.length}>
        Copiar cupons revisados para publicação ({selected.length})
      </Button>
    </section>
  );
}
