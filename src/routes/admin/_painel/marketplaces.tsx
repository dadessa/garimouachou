import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { adminMarketplaces, type MarketplaceRow } from "@/lib/admin/api";
import { friendlyError } from "@/lib/admin/errors";

export const Route = createFileRoute("/admin/_painel/marketplaces")({
  loader: ({ context }) => context.queryClient.ensureQueryData(adminMarketplaces),
  head: () => ({
    meta: [
      { title: "Marketplaces — Painel Garimou Achou!" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: Marketplaces,
});

const DOMAIN = /^(?!-)[a-z0-9-]+(\.[a-z0-9-]+)+$/;
export const parseDomains = (v: string) =>
  v
    .split(/[\s,]+/)
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);

function Marketplaces() {
  const { data } = useSuspenseQuery(adminMarketplaces);
  return (
    <>
      <h1 className="mb-1 text-2xl font-extrabold text-navy">Marketplaces</h1>
      <p className="mb-4 text-sm text-muted-foreground">
        Os links de afiliado só são aceitos se forem destes domínios (ou subdomínios deles).
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        {data.map((m) => (
          <Item key={m.id} m={m} />
        ))}
      </div>
    </>
  );
}

function Item({ m }: { m: MarketplaceRow }) {
  const qc = useQueryClient();
  const [domains, setDomains] = useState(m.allowed_domains.join(", "));
  const [manual, setManual] = useState(m.allow_manual_price);
  const [hours, setHours] = useState(String(m.price_max_age_hours));
  const [busy, setBusy] = useState(false);
  const list = parseDomains(domains);
  const bad = list.filter((d) => !DOMAIN.test(d));
  const h = Number(hours);
  const valid = list.length > 0 && !bad.length && Number.isInteger(h) && h > 0 && h <= 720;
  async function save() {
    setBusy(true);
    const { error } = await supabase
      .from("marketplaces")
      .update({ allowed_domains: list, allow_manual_price: manual, price_max_age_hours: h })
      .eq("id", m.id);
    setBusy(false);
    if (error) {
      toast.error(friendlyError(error));
      return;
    }
    toast.success(`${m.name} salvo.`);
    qc.invalidateQueries();
  }
  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <p className="font-extrabold text-navy">{m.name}</p>
      <div className="space-y-1">
        <Label htmlFor={`d-${m.id}`}>Domínios permitidos (separados por vírgula)</Label>
        <Input
          id={`d-${m.id}`}
          value={domains}
          onChange={(e) => setDomains(e.target.value)}
          spellCheck={false}
        />
        {bad.length > 0 && (
          <p className="text-xs text-destructive">
            Domínio inválido: {bad.join(", ")}. Use só o domínio, sem https:// nem barras.
          </p>
        )}
      </div>
      <label className="flex items-center gap-2 text-sm font-semibold">
        <input type="checkbox" checked={manual} onChange={(e) => setManual(e.target.checked)} />
        Permitir preço digitado à mão
      </label>
      <div className="space-y-1">
        <Label htmlFor={`h-${m.id}`}>Prazo de validade do preço (horas)</Label>
        <Input
          id={`h-${m.id}`}
          inputMode="numeric"
          value={hours}
          onChange={(e) => setHours(e.target.value)}
          className="w-28"
        />
      </div>
      <Button size="sm" disabled={busy || !valid} onClick={save}>
        Salvar
      </Button>
    </div>
  );
}
