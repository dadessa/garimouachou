import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { adminCategories, adminMarketplaces, adminProducts, isPriceStale } from "@/lib/admin/api";

export const Route = createFileRoute("/admin/_painel/produtos/")({
  loader: ({ context }) => Promise.all([
    context.queryClient.ensureQueryData(adminProducts), context.queryClient.ensureQueryData(adminCategories), context.queryClient.ensureQueryData(adminMarketplaces),
  ]),
  head: () => ({ meta: [{ title: "Produtos — Painel Garimou Achou!" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: ProductList,
});

const STATUS = { draft: "Rascunho", published: "Publicado", inactive: "Inativo" } as const;
const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const sel = "h-10 rounded-full border-2 border-input bg-background px-3 text-sm font-semibold";

function ProductList() {
  const { data: products } = useSuspenseQuery(adminProducts);
  const { data: cats } = useSuspenseQuery(adminCategories);
  const { data: mks } = useSuspenseQuery(adminMarketplaces);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [cat, setCat] = useState("");
  const [mk, setMk] = useState("");
  const [stale, setStale] = useState(false);
  const catName = new Map(cats.map((c) => [c.id, c.name]));
  const mkById = new Map(mks.map((m) => [m.id, m]));
  const list = products.filter((p) =>
    (!q || norm(`${p.name} ${p.slug}`).includes(norm(q))) && (!status || p.status === status) &&
    (!cat || p.category_id === cat) && (!mk || p.marketplace_id === mk) &&
    (!stale || isPriceStale(p, p.marketplace_id ? mkById.get(p.marketplace_id) : undefined)));

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold text-navy">Produtos</h1>
        <Link to="/admin/produtos/$id" params={{ id: "novo" }} className="rounded-full bg-primary px-5 py-2.5 text-sm font-extrabold text-primary-foreground">Novo produto</Link>
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        <Input aria-label="Buscar produtos" placeholder="Buscar por nome" value={q} onChange={(e) => setQ(e.target.value)} className="h-10 max-w-xs rounded-full bg-background" />
        <select aria-label="Status" className={sel} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Todos os status</option>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select aria-label="Categoria" className={sel} value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">Todas as categorias</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select aria-label="Marketplace" className={sel} value={mk} onChange={(e) => setMk(e.target.value)}>
          <option value="">Todos os marketplaces</option>{mks.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={stale} onChange={(e) => setStale(e.target.checked)} />Só preço vencido</label>
      </div>
      {list.length === 0 ? (
        <p className="rounded-2xl bg-card p-8 text-center text-muted-foreground">{products.length ? "Nenhum produto com esses filtros." : "Nenhum produto cadastrado ainda."}</p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {list.map((p) => {
            const m = p.marketplace_id ? mkById.get(p.marketplace_id) : undefined;
            const isStale = isPriceStale(p, m);
            return (
              <li key={p.id}>
                <Link to="/admin/produtos/$id" params={{ id: p.id }} className="flex items-center gap-3 p-3 hover:bg-muted">
                  <div className="size-14 shrink-0 overflow-hidden rounded-xl bg-muted">{p.main_image_url && <img src={p.main_image_url} alt="" className="size-full object-cover" />}</div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold">{p.name || "Sem nome"}</p>
                    <p className="truncate text-xs text-muted-foreground">{[p.category_id && catName.get(p.category_id), m?.name].filter(Boolean).join(" · ") || "—"}</p>
                  </div>
                  {isStale && <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold text-primary-foreground">Preço vencido</span>}
                  <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${p.status === "published" ? "bg-yellow text-navy" : "bg-muted text-muted-foreground"}`}>{STATUS[p.status]}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
