import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { CategoryRow, MarketplaceRow } from "@/lib/admin/api";
import { generateCopy } from "@/lib/admin/ai.functions";
import { AdminImg, uploadImage } from "@/lib/admin/storage";
import { importOne } from "@/lib/import/importer";
import { MAX_OFFERS, splitOffers } from "@/lib/import/offers";
import { identifyOffers, importOfferImage, type IdentifiedOffer } from "@/lib/import/offers.functions";
import { STATUS_LABEL, emptyDraft, type ImportStatus } from "@/lib/import/rules";
import { parseReais } from "@/lib/publish-rules";

type Card = IdentifiedOffer & {
  key: string;
  selected: boolean;
  priceText: string;
  prevText: string;
  priceConfirmed: boolean;
  status: ImportStatus | "found";
  message: string;
  productId?: string | undefined;
};

const brl = (c: number | null) => (c == null ? "" : (c / 100).toFixed(2).replace(".", ","));
const CHUNK = 5;
const sel = "h-9 w-full rounded-full border-2 border-input bg-background px-3 text-sm font-semibold";

export function OfferPaste({
  cats,
  mks,
  opts,
  onDone,
}: {
  cats: CategoryRow[];
  mks: MarketplaceRow[];
  opts: { publish: boolean; defaultCategoryId: string | null; useAi: boolean };
  onDone: () => void;
}) {
  const identify = useServerFn(identifyOffers);
  const copyImg = useServerFn(importOfferImage);
  const genCopy = useServerFn(generateCopy);
  const [text, setText] = useState("");
  const [cards, setCards] = useState<Card[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number; label: string } | null>(null);
  const busy = progress !== null;
  const patch = (key: string, p: Partial<Card>) =>
    setCards((xs) => xs.map((x) => (x.key === key ? { ...x, ...p } : x)));

  async function find() {
    const blocks = splitOffers(text);
    if (!blocks.length) {
      toast.error("Não encontrei nenhum link no texto colado.");
      return;
    }
    if (blocks.length > MAX_OFFERS) {
      toast.error(`No máximo ${MAX_OFFERS} ofertas por vez.`);
      return;
    }
    setCards([]);
    const found: Card[] = [];
    setProgress({ done: 0, total: blocks.length, label: "Identificando" });
    for (let i = 0; i < blocks.length; i += CHUNK) {
      const part = blocks.slice(i, i + CHUNK);
      const r = await identify({ data: { blocks: part, useAi: opts.useAi } }).catch(() => null);
      const items: IdentifiedOffer[] =
        r?.items ??
        part.map((b) => ({
          ...b, finalUrl: b.url, marketplaceId: null, marketplaceName: null, pageTitle: null, imageUrl: null,
          pageDescription: null, availability: null, externalId: null, categoryId: null, nameSource: null,
          duplicateId: null, missing: ["nome", "foto"], notes: [r?.error ?? "Falha ao identificar. Tente de novo."],
        }));
      for (const it of items) {
        found.push({
          ...it,
          key: crypto.randomUUID(),
          selected: !!it.marketplaceId && !it.duplicateId,
          priceText: brl(it.priceCents),
          prevText: brl(it.previousPriceCents),
          priceConfirmed: false,
          status: it.duplicateId ? "duplicate" : "found",
          message: it.duplicateId ? "Este produto já está no catálogo." : "",
          productId: it.duplicateId ?? undefined,
        });
      }
      setCards([...found]);
      setProgress({ done: Math.min(i + CHUNK, blocks.length), total: blocks.length, label: "Identificando" });
    }
    setProgress(null);
  }

  async function include(list: Card[]) {
    if (!list.length) {
      toast.error("Selecione ao menos um produto.");
      return;
    }
    setProgress({ done: 0, total: list.length, label: "Incluindo" });
    let n = 0;
    for (const c of list) {
      patch(c.key, { status: "running", message: "" });
      const notes: string[] = [];
      let image = c.imageUrl;
      if (image && /^https:/.test(image)) {
        const r = await copyImg({ data: { url: image } }).catch(() => ({ error: "Falha ao copiar a foto.", path: null }));
        if (r.path) {
          image = r.path;
          patch(c.key, { imageUrl: r.path });
        } else {
          image = null;
          notes.push(`Foto: ${r.error} Anexe a foto da mensagem.`);
        }
      }
      const cents = c.priceConfirmed ? parseReais(c.priceText) : null;
      const prev = c.priceConfirmed ? parseReais(c.prevText) : null;
      const okCents = cents != null && !Number.isNaN(cents) ? cents : null;
      const details = [c.pageDescription, c.context].filter(Boolean).join("\n").slice(0, 2000);
      try {
        const r = await importOne(
          {
            ...emptyDraft(c.url),
            name: c.name.trim(),
            categoryId: c.categoryId,
            imageUrl: image,
            imageAlt: c.name.trim(),
            externalId: c.externalId,
            priceCents: okCents,
            previousPriceCents: okCents != null && prev != null && !Number.isNaN(prev) && prev > okCents ? prev : null,
          },
          opts,
          {
            mks,
            cats,
            genCopy: (a) => genCopy({ data: { ...a.data, details: details || a.data.details } }),
          },
        );
        if (!c.priceConfirmed && c.priceText) notes.push("Preço da mensagem não salvo: confirme-o no cadastro.");
        patch(c.key, { ...r, message: [r.message, ...notes].join(" ") });
      } catch {
        patch(c.key, { status: "error", message: "Falha inesperada. Tente de novo." });
      }
      setProgress({ done: ++n, total: list.length, label: "Incluindo" });
    }
    setProgress(null);
    onDone();
  }

  async function attach(c: Card, file: File | undefined) {
    if (!file) return;
    try {
      const url = await uploadImage("product-images", file);
      patch(c.key, { imageUrl: url, missing: c.missing.filter((m) => m !== "foto") });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const selectable = cards.filter((c) => c.marketplaceId && (c.status === "found" || c.status === "error"));
  const chosen = selectable.filter((c) => c.selected);
  const failed = cards.filter((c) => c.status === "error");

  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor="offers">Colar ofertas e links</Label>
        <Textarea
          id="offers"
          rows={8}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"Cole mensagens do WhatsApp, ofertas compartilhadas ou até 50 links.\n\nEx.: 🔥 Garrafa térmica 1L\nDe R$ 99,90 por R$ 49,90\nhttps://s.shopee.com.br/…"}
        />
        <p className="text-xs text-muted-foreground">
          O link é guardado exatamente como colado. Nome e foto vêm da página pública da loja quando ela
          libera; senão, da mensagem. Preço de mensagem só é salvo se você confirmar que conferiu agora.
          Comissão só aparece com a integração oficial da loja conectada.
        </p>
      </div>
      <Button disabled={busy || !text.trim()} onClick={find}>
        Identificar produtos
      </Button>

      {progress && (
        <div aria-live="polite" className="space-y-1">
          <p className="text-sm font-bold">
            {progress.label}: {progress.done} de {progress.total}
          </p>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary transition-all" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
          </div>
        </div>
      )}

      {cards.length > 0 && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-bold">Encontrados: {cards.length}</span>
            <Button size="sm" variant="outline" disabled={busy}
              onClick={() => setCards((xs) => xs.map((x) => (selectable.includes(x) ? { ...x, selected: chosen.length !== selectable.length } : x)))}>
              {chosen.length === selectable.length ? "Desmarcar todos" : "Selecionar todos"}
            </Button>
            <Button size="sm" disabled={busy || !chosen.length} onClick={() => include(chosen)}>
              Incluir selecionados ({chosen.length})
            </Button>
            {failed.length > 0 && !busy && (
              <Button size="sm" variant="outline" onClick={() => include(failed)}>
                Reprocessar com erro ({failed.length})
              </Button>
            )}
          </div>
          <ul className="space-y-3">
            {cards.map((c) => (
              <li key={c.key} className="grid gap-3 rounded-xl border border-border p-3 sm:grid-cols-[96px_1fr]">
                <div className="flex size-24 items-center justify-center overflow-hidden rounded-lg bg-muted text-center text-xs text-muted-foreground">
                  {c.imageUrl?.startsWith("/img/") ? (
                    <AdminImg src={c.imageUrl} alt="" className="size-full object-contain" />
                  ) : c.imageUrl ? (
                    <img src={c.imageUrl} alt="" referrerPolicy="no-referrer" className="size-full object-contain" />
                  ) : (
                    "Sem foto"
                  )}
                </div>
                <div className="min-w-0 space-y-2 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="flex items-center gap-1 font-semibold">
                      <input type="checkbox" checked={c.selected} disabled={!selectable.includes(c) || busy}
                        onChange={(e) => patch(c.key, { selected: e.target.checked })} />
                      Selecionar
                    </label>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-bold">{c.marketplaceName ?? "Loja não cadastrada"}</span>
                    <span className="text-xs font-bold">{c.status === "found" ? "Encontrado" : STATUS_LABEL[c.status]}</span>
                    {c.productId && (
                      <Link to="/admin/produtos/$id" params={{ id: c.productId }} className="text-xs font-bold text-navy underline">
                        Abrir cadastro
                      </Link>
                    )}
                  </div>
                  <p className="truncate text-xs text-muted-foreground" title={c.url}>{c.url}</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div>
                      <Label className="text-xs">Nome {c.nameSource && <span className="font-normal">({c.nameSource})</span>}</Label>
                      <Input value={c.name} disabled={busy} onChange={(e) => patch(c.key, { name: e.target.value })} className="h-9" />
                    </div>
                    <div>
                      <Label className="text-xs">Categoria</Label>
                      <select className={sel} value={c.categoryId ?? ""} disabled={busy}
                        onChange={(e) => patch(c.key, { categoryId: e.target.value || null })}>
                        <option value="">{opts.defaultCategoryId ? "Usar a categoria padrão" : "Sem categoria"}</option>
                        {cats.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <Label className="text-xs">Preço da mensagem (R$)</Label>
                      <Input value={c.priceText} disabled={busy} inputMode="decimal" onChange={(e) => patch(c.key, { priceText: e.target.value })} className="h-9" />
                    </div>
                    <div>
                      <Label className="text-xs">Preço anterior (R$)</Label>
                      <Input value={c.prevText} disabled={busy} inputMode="decimal" onChange={(e) => patch(c.key, { prevText: e.target.value })} className="h-9" />
                    </div>
                  </div>
                  {c.priceText && (
                    <label className="flex items-center gap-1 text-xs font-semibold">
                      <input type="checkbox" checked={c.priceConfirmed} disabled={busy}
                        onChange={(e) => patch(c.key, { priceConfirmed: e.target.checked })} />
                      Conferi este preço na loja agora
                    </label>
                  )}
                  <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                    {c.discountPct != null && <span>Desconto citado na mensagem: {c.discountPct}%</span>}
                    {c.coupon && <span>Cupom citado: {c.coupon}</span>}
                    {c.availability && <span>Disponibilidade na página: {c.availability}</span>}
                    <span>Comissão: indisponível sem integração oficial</span>
                  </div>
                  {!c.imageUrl && (
                    <label className="block text-xs font-semibold">
                      Anexar foto da mensagem{" "}
                      <input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy}
                        onChange={(e) => attach(c, e.target.files?.[0])} />
                    </label>
                  )}
                  {(c.missing.length > 0 || c.notes.length > 0) && c.status === "found" && (
                    <p className="text-xs text-destructive">
                      {c.missing.length > 0 && `Pendente: ${c.missing.join(", ")}. `}
                      {c.notes.join(" ")}
                    </p>
                  )}
                  {c.message && <p className="text-xs">{c.message}</p>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
