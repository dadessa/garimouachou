import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { adminCategories, adminMarketplaces } from "@/lib/admin/api";
import { generateCopy } from "@/lib/admin/ai.functions";
import { importOne } from "@/lib/import/importer";
import {
  CSV_COLUMNS,
  MAX_BATCH,
  STATUS_LABEL,
  csvRowToDraft,
  emptyDraft,
  parseCsv,
  parseLinkList,
  type ImportDraft,
  type ImportStatus,
} from "@/lib/import/rules";
import { searchShopeeOffers } from "@/lib/integrations/integrations.functions";
import { parseReais } from "@/lib/publish-rules";
import { OfferPaste } from "@/components/admin/OfferPaste";

export const Route = createFileRoute("/admin/_painel/importar")({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(adminCategories),
      context.queryClient.ensureQueryData(adminMarketplaces),
    ]),
  head: () => ({
    meta: [
      { title: "Importar produtos — Painel Garimou Achou!" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ImportCenter,
});

type Item = {
  key: string;
  draft: ImportDraft;
  status: ImportStatus;
  message: string;
  productId?: string;
};
type Tab = "offers" | "link" | "csv" | "api";
const sel =
  "h-10 w-full rounded-full border-2 border-input bg-background px-3 text-sm font-semibold";

function ImportCenter() {
  const { data: cats } = useSuspenseQuery(adminCategories);
  const { data: mks } = useSuspenseQuery(adminMarketplaces);
  const genCopy = useServerFn(generateCopy);
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("offers");
  const [links, setLinks] = useState("");
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [publish, setPublish] = useState(false);
  const [useAi, setUseAi] = useState(true);
  const [items, setItems] = useState<Item[]>([]);
  const [running, setRunning] = useState(false);

  const opts = { publish, defaultCategoryId: categoryId || null, useAi };
  const patch = (key: string, p: Partial<Item>) =>
    setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...p } : x)));

  async function run(list: Item[]) {
    setRunning(true);
    for (const it of list) {
      patch(it.key, { status: "running", message: "" });
      try {
        const r = await importOne(it.draft, opts, { mks, cats, genCopy });
        patch(it.key, r);
      } catch {
        patch(it.key, { status: "error", message: "Falha inesperada. Tente de novo." });
      }
    }
    setRunning(false);
    qc.invalidateQueries({ queryKey: ["admin", "products"] });
  }

  function enqueue(drafts: ImportDraft[]) {
    if (!drafts.length) {
      toast.error("Nada para importar.");
      return;
    }
    if (drafts.length > MAX_BATCH) {
      toast.error(`No máximo ${MAX_BATCH} itens por vez.`);
      return;
    }
    const list = drafts.map((d, i) => ({
      key: `${Date.now()}-${i}`,
      draft: d,
      status: "pending" as const,
      message: "",
    }));
    setItems((xs) => [...list, ...xs]);
    void run(list);
  }

  function fromLinks() {
    const urls = parseLinkList(links);
    enqueue(urls.map((u) => ({ ...emptyDraft(u), name: urls.length === 1 ? name.trim() : "" })));
  }

  async function fromCsv(file: File | undefined) {
    if (!file) return;
    if (file.size > 1024 * 1024) {
      toast.error("A planilha precisa ter no máximo 1 MB.");
      return;
    }
    const rows = parseCsv(await file.text());
    enqueue(rows.map((r) => csvRowToDraft(r, cats)));
  }

  const failed = items.filter((i) => i.status === "error");
  const count = (s: ImportStatus) => items.filter((i) => i.status === s).length;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Link to="/admin/produtos" className="text-sm font-bold text-navy underline">
          ← Produtos
        </Link>
        <h1 className="text-2xl font-extrabold text-navy">Importar produtos</h1>
      </div>

      <div role="tablist" aria-label="Forma de importar" className="mb-4 flex flex-wrap gap-2">
        {(
          [
            ["offers", "Colar ofertas e links"],
            ["link", "Por link"],
            ["csv", "Planilha CSV"],
            ["api", "Busca na loja (API)"],
          ] as const
        ).map(([t, l]) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`rounded-full px-4 py-2 text-sm font-bold ${tab === t ? "bg-navy text-background" : "bg-card"}`}
          >
            {l}
          </button>
        ))}
        <Link
          to="/admin/produtos/$id"
          params={{ id: "novo" }}
          className="rounded-full bg-card px-4 py-2 text-sm font-bold"
        >
          Cadastro manual
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <section className="space-y-4 rounded-2xl border border-border bg-card p-4 md:p-6">
          {tab === "offers" && (
            <OfferPaste
              cats={cats}
              mks={mks}
              opts={opts}
              onDone={() => qc.invalidateQueries({ queryKey: ["admin", "products"] })}
            />
          )}
          {tab === "link" && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="links">Links de afiliada (um por linha)</Label>
                <Textarea
                  id="links"
                  rows={6}
                  value={links}
                  onChange={(e) => setLinks(e.target.value)}
                  placeholder="https://s.shopee.com.br/…"
                />
                <p className="text-xs text-muted-foreground">
                  O link é guardado exatamente como você colou. Sem API, o produto entra como
                  rascunho para você completar nome, foto e preço.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="iname">Nome do produto (opcional, só para 1 link)</Label>
                <Input id="iname" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <Button disabled={running} onClick={fromLinks}>
                Importar links
              </Button>
            </>
          )}
          {tab === "csv" && (
            <>
              <p className="text-sm">
                Colunas aceitas: <strong>{CSV_COLUMNS.join(", ")}</strong>. Só <strong>link</strong>{" "}
                é obrigatória. Separador vírgula ou ponto e vírgula; até {MAX_BATCH} linhas.
              </p>
              <Label htmlFor="csv">Escolher planilha</Label>
              <input
                id="csv"
                type="file"
                accept=".csv,text/csv"
                disabled={running}
                onChange={(e) => fromCsv(e.target.files?.[0])}
              />
            </>
          )}
          {tab === "api" && <ApiSearch onAdd={enqueue} running={running} />}
        </section>

        <aside className="space-y-4 rounded-2xl border border-border bg-card p-4">
          <h2 className="font-extrabold text-navy">Opções</h2>
          <div className="space-y-1.5">
            <Label htmlFor="defcat">Categoria (quando o item não trouxer)</Label>
            <select
              id="defcat"
              className={sel}
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">Sem categoria</option>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" checked={useAi} onChange={(e) => setUseAi(e.target.checked)} />
            Gerar descrição e etiquetas com IA (quando houver nome)
          </label>
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input
              type="checkbox"
              checked={publish}
              onChange={(e) => setPublish(e.target.checked)}
            />
            Publicar quando tudo estiver completo
          </label>
          <p className="text-xs text-muted-foreground">
            Se faltar algo, o produto fica como rascunho e o motivo aparece abaixo.
          </p>
        </aside>
      </div>

      {items.length > 0 && (
        <section className="mt-6 space-y-3" aria-live="polite">
          <div className="flex flex-wrap items-center gap-3 text-sm font-bold">
            <span>Selecionados: {items.length}</span>
            <span>Publicados: {count("published")}</span>
            <span>Aguardando revisão: {count("created")}</span>
            <span>Duplicados: {count("duplicate")}</span>
            <span>Com erro: {failed.length}</span>
            {failed.length > 0 && !running && (
              <Button size="sm" variant="outline" onClick={() => run(failed)}>
                Tentar de novo os que falharam
              </Button>
            )}
          </div>
          <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
            {items.map((i) => (
              <li key={i.key} className="flex flex-wrap items-center gap-3 p-3 text-sm">
                <span className="min-w-0 flex-1 truncate">
                  {i.draft.name || i.draft.affiliateUrl}
                </span>
                <span className="font-bold">{STATUS_LABEL[i.status]}</span>
                {i.message && (
                  <span className="w-full text-xs text-muted-foreground">{i.message}</span>
                )}
                {i.productId && (
                  <Link
                    to="/admin/produtos/$id"
                    params={{ id: i.productId }}
                    className="text-xs font-bold text-navy underline"
                  >
                    Abrir cadastro
                  </Link>
                )}
                {i.status === "error" && !running && (
                  <Button size="sm" variant="ghost" onClick={() => run([i])}>
                    Tentar de novo
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

type Offer = Awaited<ReturnType<typeof searchShopeeOffers>>["nodes"][number];

function ApiSearch({ onAdd, running }: { onAdd: (d: ImportDraft[]) => void; running: boolean }) {
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const search = useServerFn(searchShopeeOffers);
  const [kw, setKw] = useState("");
  const [sort, setSort] = useState(2);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [nodes, setNodes] = useState<Offer[]>([]);
  const [picked, setPicked] = useState<Set<number>>(new Set());

  async function go() {
    setBusy(true);
    const r = await search({ data: { keyword: kw, sort } }).catch(() => ({
      error: "Falha na consulta.",
      nodes: [],
    }));
    setErr(r.error);
    setNodes(r.nodes);
    setFetchedAt(new Date().toISOString());
    setPicked(new Set());
    setBusy(false);
  }
  const toDraft = (o: Offer): ImportDraft => {
    const cents = o.price != null ? parseReais(String(o.price)) : null;
    return {
      ...emptyDraft(o.offerLink),
      name: o.productName,
      imageUrl: o.imageUrl,
      imageAlt: o.productName,
      externalId: `${o.shopId}:${o.itemId}`,
      priceCents: cents != null && !Number.isNaN(cents) ? cents : null,
      fromApi: true,
      priceCheckedAt: fetchedAt,
    };
  };

  return (
    <>
      <p className="rounded-xl bg-muted p-3 text-sm">
        Disponível para a Shopee quando o App ID e o App Secret forem configurados e o teste em{" "}
        <Link to="/admin/integracoes" className="font-bold underline">
          Integrações
        </Link>{" "}
        passar. Mercado Livre, Amazon e Magalu: use link ou planilha por enquanto.
      </p>
      <div className="flex flex-wrap gap-2">
        <Input
          aria-label="Palavra-chave"
          placeholder="Palavra-chave"
          value={kw}
          onChange={(e) => setKw(e.target.value)}
          className="h-10 max-w-xs rounded-full"
        />
        <select
          aria-label="Ordenar"
          className="h-10 rounded-full border-2 border-input bg-background px-3 text-sm font-semibold"
          value={sort}
          onChange={(e) => setSort(Number(e.target.value))}
        >
          <option value={2}>Maior comissão</option>
          <option value={1}>Mais recentes</option>
          <option value={5}>Mais vendidos</option>
          <option value={3}>Lojas populares</option>
        </select>
        <Button disabled={busy} onClick={go}>
          {busy ? "Buscando…" : "Buscar na Shopee"}
        </Button>
      </div>
      {err && <p className="text-sm text-destructive">{err}</p>}
      {nodes.length > 0 && (
        <>
          <Button
            disabled={!picked.size || running}
            onClick={() => onAdd(nodes.filter((n) => picked.has(n.itemId)).map(toDraft))}
          >
            + Incluir selecionados ({picked.size})
          </Button>
          <ul className="grid gap-3 sm:grid-cols-2">
            {nodes.map((o) => (
              <li key={o.itemId} className="flex gap-3 rounded-xl border border-border p-2">
                {o.imageUrl && (
                  <img
                    src={o.imageUrl}
                    alt=""
                    className="size-20 shrink-0 rounded-lg object-contain"
                  />
                )}
                <div className="min-w-0 flex-1 space-y-1 text-xs">
                  <p className="line-clamp-2 text-sm font-bold">{o.productName}</p>
                  {o.price && <p>Preço informado pela Shopee: R$ {o.price}</p>}
                  {o.priceDiscountRate ? <p>Desconto informado: {o.priceDiscountRate}%</p> : null}
                  {o.commissionRate && (
                    <p>
                      Comissão estimada: {(Number(o.commissionRate) * 100).toFixed(1)}% (não é
                      receita confirmada)
                    </p>
                  )}
                  <div className="flex gap-2">
                    <label className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={picked.has(o.itemId)}
                        onChange={(e) =>
                          setPicked((s) => {
                            const n = new Set(s);
                            if (e.target.checked) n.add(o.itemId);
                            else n.delete(o.itemId);
                            return n;
                          })
                        }
                      />
                      Selecionar
                    </label>
                    <Button size="sm" disabled={running} onClick={() => onAdd([toDraft(o)])}>
                      + Incluir
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
