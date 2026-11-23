import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { adminMarketplaces, adminProducts, isPriceStale } from "@/lib/admin/api";

export const Route = createFileRoute("/admin/_painel/")({
  loader: ({ context }) => Promise.all([context.queryClient.ensureQueryData(adminProducts), context.queryClient.ensureQueryData(adminMarketplaces)]),
  head: () => ({ meta: [{ title: "Visão geral — Painel Garimou Achou!" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: Overview,
});

function Overview() {
  const { data: products } = useSuspenseQuery(adminProducts);
  const { data: mks } = useSuspenseQuery(adminMarketplaces);
  const mk = new Map(mks.map((m) => [m.id, m]));
  const cards = [
    { label: "Publicados", n: products.filter((p) => p.status === "published").length },
    { label: "Rascunhos", n: products.filter((p) => p.status === "draft").length },
    { label: "Inativos", n: products.filter((p) => p.status === "inactive").length },
    { label: "Com preço vencido", n: products.filter((p) => isPriceStale(p, p.marketplace_id ? mk.get(p.marketplace_id) : undefined)).length, warn: true },
  ];
  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold text-navy">Visão geral</h1>
        <Link to="/admin/produtos/$id" params={{ id: "novo" }} className="rounded-full bg-primary px-5 py-2.5 text-sm font-extrabold text-primary-foreground">Novo produto</Link>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className={`rounded-2xl border bg-card p-4 shadow-card ${c.warn && c.n > 0 ? "border-primary" : "border-border"}`}>
            <p className="text-3xl font-extrabold text-navy">{c.n}</p>
            <p className="text-sm font-semibold text-muted-foreground">{c.label}</p>
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs text-muted-foreground">Preço vencido: o preço não aparece no site até ser confirmado de novo.</p>
    </>
  );
}
