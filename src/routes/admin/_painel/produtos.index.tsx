import { AdminImg } from "@/lib/admin/storage";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { publishMissing } from "@/lib/publish-rules";
import { adminCategories, adminMarketplaces, adminProducts, isPriceStale } from "@/lib/admin/api";

export const Route = createFileRoute("/admin/_painel/produtos/")({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(adminProducts),
      context.queryClient.ensureQueryData(adminCategories),
      context.queryClient.ensureQueryData(adminMarketplaces),
    ]),
  head: () => ({
    meta: [
      { title: "Produtos — Painel Garimou Achou!" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ProductList,
});

const STATUS = { draft: "Rascunho", published: "Publicado", inactive: "Inativo" } as const;
const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
const sel = "h-10 rounded-full border-2 border-input bg-background px-3 text-sm font-semibold";
const MAX_PUBLISH_BATCH = 50;
type BatchItem = { id: string; name: string; updatedAt: string; missing: string[] };
type BatchResult = { id: string; name: string; ok: boolean; message: string };

function ProductList() {
  const qc = useQueryClient();
  const { data: products } = useSuspenseQuery(adminProducts);
  const { data: cats } = useSuspenseQuery(adminCategories);
  const { data: mks } = useSuspenseQuery(adminMarketplaces);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [cat, setCat] = useState("");
  const [mk, setMk] = useState("");
  const [stale, setStale] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [preview, setPreview] = useState<BatchItem[] | null>(null);
  const [results, setResults] = useState<BatchResult[]>([]);
  const [publishing, setPublishing] = useState(false);
  const [progress, setProgress] = useState(0);
  const resetSelection = () => { setSelected(new Set()); setPreview(null); };
  const catName = new Map(cats.map((c) => [c.id, c.name]));
  const mkById = new Map(mks.map((m) => [m.id, m]));
  const list = products.filter(
    (p) =>
      (!q || norm(`${p.name} ${p.slug}`).includes(norm(q))) &&
      (!status || p.status === status) &&
      (!cat || p.category_id === cat) &&
      (!mk || p.marketplace_id === mk) &&
      (!stale || isPriceStale(p, p.marketplace_id ? mkById.get(p.marketplace_id) : undefined)),
  );

  const drafts = list.filter((p) => p.status === "draft");
  const chosen = drafts.filter((p) => selected.has(p.id));
  const allSelected = drafts.length > 0 && chosen.length === Math.min(drafts.length, MAX_PUBLISH_BATCH);
  const categoryById = new Map(cats.map((c) => [c.id, c]));
  const check = (p: (typeof products)[number]) => {
    const category = p.category_id ? categoryById.get(p.category_id) : undefined;
    const marketplace = p.marketplace_id ? mkById.get(p.marketplace_id) : undefined;
    const missing = publishMissing({
      name: p.name ?? "",
      mainImageUrl: p.main_image_url,
      mainImageAlt: p.main_image_alt ?? "",
      category: category ? { isActive: category.is_active } : null,
      marketplace: marketplace ? { isActive: marketplace.is_active, name: marketplace.name, allowedDomains: marketplace.allowed_domains } : null,
      affiliateUrl: p.affiliate_url ?? "",
    });
    if (isPriceStale(p, marketplace)) missing.push("Revalidar ou remover o preço vencido");
    return missing;
  };

  function prepareBatch() {
    setResults([]);
    setPreview(chosen.slice(0, MAX_PUBLISH_BATCH).map((p) => ({
      id: p.id, name: p.name || "Sem nome", updatedAt: p.updated_at, missing: check(p),
    })));
  }

  async function publishBatch() {
    if (publishing || !preview) return;
    const approved = preview.filter((p) => p.missing.length === 0).slice(0, MAX_PUBLISH_BATCH);
    if (!approved.length) return;
    setPublishing(true);
    setProgress(0);
    const output: BatchResult[] = [];
    try {
      for (const item of approved) {
        try {
          const { data: current, error: readError } = await supabase.from("products").select("*").eq("id", item.id).maybeSingle();
          if (readError || !current || current.status !== "draft" || current.updated_at !== item.updatedAt) {
            output.push({ ...item, ok: false, message: "Produto alterado ou indisponível. Revise novamente." });
          } else {
            const missing = check(current);
            if (missing.length) {
              output.push({ ...item, ok: false, message: missing.join("; ") });
            } else {
              // RLS exige papel admin e o gatilho valida novamente os requisitos de publicação.
              const { data, error } = await supabase.from("products").update({ status: "published" })
                .eq("id", item.id).eq("status", "draft").eq("updated_at", item.updatedAt)
                .select("id").maybeSingle();
              output.push({ ...item, ok: !!data && !error, message: error?.message ?? (data ? "Publicado" : "Produto alterado ou sem permissão.") });
            }
          }
        } catch {
          output.push({ ...item, ok: false, message: "Falha na publicação. Tente novamente." });
        }
        setProgress(output.length);
      }
      setResults(output);
      setSelected((old) => new Set([...old].filter((id) => !output.some((x) => x.id === id && x.ok))));
      setPreview(null);
      await Promise.all(["admin", "home", "offers", "search", "product", "category", "categories"].map((key) =>
        qc.invalidateQueries({ queryKey: [key] }),
      ));
    } finally {
      setPublishing(false);
    }
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold text-navy">Produtos</h1>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/admin/importar"
            className="rounded-full bg-card px-5 py-2.5 text-sm font-extrabold"
          >
            Importar produtos
          </Link>
          <Link
            to="/admin/produtos/$id"
            params={{ id: "novo" }}
            className="rounded-full bg-primary px-5 py-2.5 text-sm font-extrabold text-primary-foreground"
          >
            Novo produto
          </Link>
        </div>
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        <Input
          aria-label="Buscar produtos"
          placeholder="Buscar por nome"
          value={q}
          disabled={publishing}
          onChange={(e) => { setQ(e.target.value); resetSelection(); }}
          className="h-10 max-w-xs rounded-full bg-background"
        />
        <select
          aria-label="Status"
          className={sel}
          value={status}
          disabled={publishing}
          onChange={(e) => { setStatus(e.target.value); resetSelection(); }}
        >
          <option value="">Todos os status</option>
          {Object.entries(STATUS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select
          aria-label="Categoria"
          className={sel}
          value={cat}
          disabled={publishing}
          onChange={(e) => { setCat(e.target.value); resetSelection(); }}
        >
          <option value="">Todas as categorias</option>
          {cats.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Marketplace"
          className={sel}
          value={mk}
          disabled={publishing}
          onChange={(e) => { setMk(e.target.value); resetSelection(); }}
        >
          <option value="">Todos os marketplaces</option>
          {mks.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" checked={stale} disabled={publishing}
          onChange={(e) => { setStale(e.target.checked); resetSelection(); }} />
          Só preço vencido
        </label>
      </div>
      {drafts.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-3">
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" checked={allSelected} disabled={publishing || !!preview}
              onChange={(e) => setSelected(new Set(e.target.checked ? drafts.slice(0, MAX_PUBLISH_BATCH).map((p) => p.id) : []))} />
            {drafts.length > MAX_PUBLISH_BATCH ? "Selecionar até 50 rascunhos visíveis" : "Selecionar todos os rascunhos visíveis"}
          </label>
          <span className="text-sm text-muted-foreground">{chosen.length} selecionado(s)</span>
          <Button size="sm" disabled={!chosen.length || publishing || !!preview} onClick={prepareBatch}>
            Publicar selecionados ({chosen.length})
          </Button>
          <Button size="sm" variant="outline" disabled={!chosen.length || publishing} onClick={resetSelection}>Limpar seleção</Button>
        </div>
      )}
      {preview && (
        <section aria-label="Revisar publicação em lote" className="mb-4 space-y-3 rounded-xl border-2 border-navy bg-card p-4">
          <h2 className="text-base font-bold">Confirmar publicação em lote</h2>
          <p className="text-sm">{preview.filter((p) => !p.missing.length).length} apto(s) · {preview.filter((p) => p.missing.length).length} com pendências. Somente os produtos aptos serão publicados.</p>
          <ul className="max-h-64 space-y-2 overflow-auto text-sm">
            {preview.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
                <Link to="/admin/produtos/$id" params={{ id: p.id }} className="font-semibold underline">{p.name}</Link>
                <span className={p.missing.length ? "text-destructive" : "text-muted-foreground"}>{p.missing.length ? p.missing.join("; ") : "Apto para publicação"}</span>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <Button disabled={publishing || !preview.some((p) => !p.missing.length)} onClick={publishBatch}>
              {publishing ? "Publicando " + progress + "/" + preview.filter((p) => !p.missing.length).length + "…" : "Confirmar publicação de " + preview.filter((p) => !p.missing.length).length + " produto(s)"}
            </Button>
            <Button variant="outline" disabled={publishing} onClick={() => setPreview(null)}>Cancelar</Button>
          </div>
        </section>
      )}
      {results.length > 0 && (
        <section aria-live="polite" className="mb-4 space-y-2 rounded-xl border border-border bg-card p-4">
          <h2 className="font-bold">{results.filter((r) => r.ok).length} publicado(s) · {results.filter((r) => !r.ok).length} com falha</h2>
          {results.filter((r) => !r.ok).map((r) => (
            <p key={r.id} className="text-sm"><Link to="/admin/produtos/$id" params={{ id: r.id }} className="font-semibold underline">{r.name}</Link> — {r.message}</p>
          ))}
          <Button size="sm" variant="outline" onClick={() => setResults([])}>Fechar resumo</Button>
        </section>
      )}
      {list.length === 0 ? (
        <p className="rounded-2xl bg-card p-8 text-center text-muted-foreground">
          {products.length
            ? "Nenhum produto com esses filtros."
            : "Nenhum produto cadastrado ainda."}
        </p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {list.map((p) => {
            const m = p.marketplace_id ? mkById.get(p.marketplace_id) : undefined;
            const isStale = isPriceStale(p, m);
            return (
              <li key={p.id} className="flex items-center">
                <div className="flex w-10 shrink-0 justify-center">
                  {p.status === "draft" && (
                    <input type="checkbox" aria-label={"Selecionar " + (p.name || "rascunho")}
                      checked={selected.has(p.id)}
                      disabled={publishing || !!preview || (!selected.has(p.id) && chosen.length >= MAX_PUBLISH_BATCH)}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setSelected((old) => {
                          const next = new Set(old);
                          if (checked && next.size < MAX_PUBLISH_BATCH) next.add(p.id);
                          else if (!checked) next.delete(p.id);
                          return next;
                        });
                      }} />
                  )}
                </div>
                <Link
                  to="/admin/produtos/$id"
                  params={{ id: p.id }}
                  className="flex min-w-0 flex-1 items-center gap-3 p-3 hover:bg-muted"
                >
                  <div className="size-14 shrink-0 overflow-hidden rounded-xl bg-muted">
                    {p.main_image_url && (
                      <AdminImg src={p.main_image_url} alt="" className="size-full object-cover" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold">{p.name || "Sem nome"}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[p.category_id && catName.get(p.category_id), m?.name]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </p>
                  </div>
                  {isStale && (
                    <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold text-primary-foreground">
                      Preço vencido
                    </span>
                  )}
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${p.status === "published" ? "bg-yellow text-navy" : "bg-muted text-muted-foreground"}`}
                  >
                    {STATUS[p.status]}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
