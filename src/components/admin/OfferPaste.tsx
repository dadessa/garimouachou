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
import {
  identifyOffers,
  importOfferImage,
  type IdentifiedOffer,
} from "@/lib/import/offers.functions";
import { supabase } from "@/integrations/supabase/client";
import { keepApiRows, toRadarRow } from "@/lib/import/radar-feed";
import { STATUS_LABEL, emptyDraft, type ImportStatus } from "@/lib/import/rules";
import { parseReais } from "@/lib/publish-rules";
import { emptyFieldPatch, needsExplicitDraft } from "@/lib/import/enrich";
import { importSlug } from "@/lib/import/rules";

type Card = IdentifiedOffer & {
  key: string;
  selected: boolean;
  priceText: string;
  prevText: string;
  priceConfirmed: boolean;
  status: ImportStatus | "found";
  message: string;
  productId?: string | undefined;
  /** Marcado pela administradora: salvar mesmo sem nome/foto. */
  allowIncomplete: boolean;
  /** Rascunho já existente sendo completado (não cria outro produto). */
  updateId?: string | undefined;
};

const liveMissing = (c: Card, defCat: string | null) =>
  [!c.name.trim() && "nome", !c.imageUrl && "foto", !c.categoryId && !defCat && "categoria"].filter(
    Boolean,
  ) as string[];

const brl = (c: number | null) => (c == null ? "" : (c / 100).toFixed(2).replace(".", ","));
const CHUNK = 5;
const sel =
  "h-9 w-full rounded-full border-2 border-input bg-background px-3 text-sm font-semibold";

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
  const [toRadar, setToRadar] = useState(true);
  const [summary, setSummary] = useState<Record<string, number> | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number; label: string } | null>(
    null,
  );
  const busy = progress !== null;
  const patch = (key: string, p: Partial<Card>) =>
    setCards((xs) => xs.map((x) => (x.key === key ? { ...x, ...p } : x)));

  async function identifyPart(part: { url: string; context: string }[]) {
    const r = await identify({
      data: { blocks: part.map((b) => ({ url: b.url, context: b.context })), useAi: opts.useAi },
    }).catch(() => null);
    return { r, part };
  }

  function toCard(it: IdentifiedOffer, updateId?: string): Card {
    const isDup = !!it.duplicateId && !updateId;
    return {
      ...it,
      key: crypto.randomUUID(),
      selected: !!it.marketplaceId && !isDup && !needsExplicitDraft(it.missing),
      priceText: brl(it.priceCents),
      prevText: brl(it.previousPriceCents),
      priceConfirmed: false,
      status: isDup ? "duplicate" : "found",
      message: isDup ? "Este produto já está no catálogo." : "",
      productId: updateId ?? it.duplicateId ?? undefined,
      allowIncomplete: false,
      updateId,
    };
  }

  async function retry(c: Card) {
    patch(c.key, { status: "running", message: "Consultando de novo…" });
    const { r } = await identifyPart([{ url: c.url, context: c.context }]);
    const it = r?.items?.[0];
    if (!it) {
      patch(c.key, {
        status: "error",
        message: r?.error ?? "Falha ao identificar. Tente de novo.",
      });
      return;
    }
    const fresh = toCard(it, c.updateId);
    setCards((xs) => xs.map((x) => (x.key === c.key ? { ...fresh, key: c.key } : x)));
  }

  async function loadDrafts() {
    const { data, error } = await supabase
      .from("products")
      .select("id,affiliate_url,name,main_image_url")
      .eq("status", "draft")
      .or("name.eq.,main_image_url.is.null")
      .limit(MAX_OFFERS);
    if (error) {
      toast.error("Não foi possível carregar os rascunhos.");
      return;
    }
    if (!data?.length) {
      toast.info("Nenhum rascunho incompleto para reprocessar.");
      return;
    }
    setCards([]);
    const found: Card[] = [];
    setProgress({ done: 0, total: data.length, label: "Reprocessando rascunhos" });
    for (let i = 0; i < data.length; i += CHUNK) {
      const part = data.slice(i, i + CHUNK);
      const { r } = await identifyPart(part.map((p) => ({ url: p.affiliate_url, context: "" })));
      part.forEach((p, j) => {
        const it = r?.items?.[j];
        if (it) found.push(toCard({ ...it, name: p.name || it.name }, p.id));
      });
      setCards([...found]);
      setProgress({
        done: Math.min(i + CHUNK, data.length),
        total: data.length,
        label: "Reprocessando rascunhos",
      });
    }
    setProgress(null);
  }

  async function updateDraft(c: Card, image: string | null) {
    const { data: cur } = await supabase
      .from("products")
      .select("name,main_image_url,category_id,short_description,tags,external_id")
      .eq("id", c.updateId!)
      .single();
    if (!cur) return { status: "error" as const, message: "Rascunho não encontrado." };
    let description = "";
    let tags: string[] = [];
    const name = cur.name?.trim() || c.name.trim();
    if (opts.useAi && name && !cur.short_description?.trim()) {
      const g = await genCopy({
        data: {
          name,
          category: cats.find((x) => x.id === c.categoryId)?.name ?? "",
          affiliateUrl: c.url,
          details: [c.pageDescription, c.context].filter(Boolean).join("\n").slice(0, 2000),
        },
      }).catch(() => null);
      if (g && !g.error) ({ description, tags } = g);
    }
    const p = emptyFieldPatch(
      cur,
      {
        name: c.name,
        imageUrl: image,
        categoryId: c.categoryId ?? opts.defaultCategoryId,
        description,
        tags,
        externalId: c.externalId,
      },
      importSlug,
    );
    if (!Object.keys(p).length)
      return { status: "error" as const, message: "Nada novo foi encontrado para este rascunho." };
    const { error } = await supabase
      .from("products")
      .update(p as never)
      .eq("id", c.updateId!);
    if (error)
      return { status: "error" as const, message: "Não foi possível atualizar o rascunho." };
    return {
      status: "created" as const,
      productId: c.updateId,
      message: `Rascunho completado: ${Object.keys(p)
        .filter((k) => k !== "slug" && k !== "main_image_alt")
        .join(", ")}.`,
    };
  }

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
      const { r } = await identifyPart(part);
      const items: IdentifiedOffer[] =
        r?.items ??
        part.map((b) => ({
          ...b,
          finalUrl: b.url,
          marketplaceId: null,
          marketplaceSlug: null,
          extraImages: [],
          sources: { api: "não consultada", page: "não consultada", message: !!b.context },
          marketplaceName: null,
          pageTitle: null,
          imageUrl: null,
          pageDescription: null,
          availability: null,
          externalId: null,
          categoryId: null,
          nameSource: null,
          duplicateId: null,
          missing: ["nome", "foto"],
          notes: [r?.error ?? "Falha ao identificar. Tente de novo."],
        }));
      for (const it of items) found.push(toCard(it));
      setCards([...found]);
      setProgress({
        done: Math.min(i + CHUNK, blocks.length),
        total: blocks.length,
        label: "Identificando",
      });
    }
    setProgress(null);
  }

  async function include(list: Card[]) {
    if (!list.length) {
      toast.error("Selecione ao menos um produto.");
      return;
    }
    setProgress({ done: 0, total: list.length, label: "Incluindo" });
    setSummary(null);
    const tally: Record<string, number> = { published: 0, created: 0, duplicate: 0, error: 0 };
    let n = 0;
    for (const c of list) {
      patch(c.key, { status: "running", message: "" });
      const notes: string[] = [];
      let image = c.imageUrl;
      if (image && /^https:/.test(image)) {
        const r = await copyImg({ data: { url: image } }).catch(() => ({
          error: "Falha ao copiar a foto.",
          path: null,
        }));
        if (r.path) {
          image = r.path;
          patch(c.key, { imageUrl: r.path });
        } else {
          image = null;
          notes.push(`Foto: ${r.error} Anexe a foto da mensagem.`);
        }
      }
      if (c.updateId) {
        const r = await updateDraft(c, image);
        tally[r.status] = (tally[r.status] ?? 0) + 1;
        patch(c.key, { ...r, message: [r.message, ...notes].join(" ") });
        setProgress({ done: ++n, total: list.length, label: "Completando" });
        continue;
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
            previousPriceCents:
              okCents != null && prev != null && !Number.isNaN(prev) && prev > okCents
                ? prev
                : null,
          },
          { ...opts, allowIncomplete: c.allowIncomplete },
          {
            mks,
            cats,
            genCopy: (a) => genCopy({ data: { ...a.data, details: details || a.data.details } }),
          },
        );
        if (!c.priceConfirmed && c.priceText)
          notes.push("Preço da mensagem não salvo: confirme-o no cadastro.");
        if (r.productId && r.status !== "duplicate" && c.extraImages.length) {
          const extra: string[] = [];
          for (const u of c.extraImages) {
            const x = await copyImg({ data: { url: u } }).catch(() => null);
            if (x?.path) extra.push(x.path);
          }
          if (extra.length) {
            const { error } = await supabase.from("product_images").insert(
              extra.map((url, i) => ({
                product_id: r.productId!,
                url,
                alt: c.name.trim(),
                sort_order: i + 1,
              })),
            );
            notes.push(
              error
                ? "Fotos adicionais não foram salvas."
                : `${extra.length} foto(s) adicional(is) da loja.`,
            );
          }
        }
        tally[r.status] = (tally[r.status] ?? 0) + 1;
        patch(c.key, { ...r, message: [r.message, ...notes].join(" ") });
      } catch {
        tally["error"] = (tally["error"] ?? 0) + 1;
        patch(c.key, { status: "error", message: "Falha inesperada. Tente de novo." });
      }
      setProgress({ done: ++n, total: list.length, label: "Incluindo" });
    }
    if (toRadar) await feedRadar(list);
    setProgress(null);
    setSummary(tally);
    onDone();
  }

  async function feedRadar(list: Card[]) {
    const rows = list
      .filter((c) => c.marketplaceSlug && c.name.trim())
      .map((c) =>
        toRadarRow({
          ...c,
          name: c.name.trim(),
          marketplaceSlug: c.marketplaceSlug!,
          imageUrl: c.imageUrl,
          category: cats.find((x) => x.id === c.categoryId)?.name ?? null,
          fromPage: c.sources.page === "dados públicos lidos",
        }),
      );
    if (!rows.length) return;
    const { data: existing } = await supabase
      .from("radar_opportunities")
      .select("marketplace_slug,external_id,source")
      .in(
        "external_id",
        rows.map((r) => r.external_id),
      );
    const ok = keepApiRows(rows, existing ?? []);
    if (!ok.length) return;
    const { error } = await supabase
      .from("radar_opportunities")
      .upsert(ok, { onConflict: "marketplace_slug,external_id" });
    if (error) toast.error("As ofertas não foram enviadas ao Radar.");
    else
      toast.success(
        `${ok.length} oferta(s) enviada(s) ao Radar como dado de mensagem (não confirmado).`,
      );
  }

  async function attach(c: Card, file: File | undefined) {
    if (!file) return;
    try {
      const url = await uploadImage("product-images", file);
      patch(c.key, { imageUrl: url });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const selectable = cards.filter(
    (c) =>
      c.marketplaceId &&
      (c.status === "found" || c.status === "error") &&
      (c.updateId ||
        c.allowIncomplete ||
        !needsExplicitDraft(liveMissing(c, opts.defaultCategoryId))),
  );
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
          placeholder={
            "Cole mensagens do WhatsApp, ofertas compartilhadas ou até 50 links.\n\nEx.: 🔥 Garrafa térmica 1L\nDe R$ 99,90 por R$ 49,90\nhttps://s.shopee.com.br/…"
          }
        />
        <p className="text-xs text-muted-foreground">
          O link é guardado exatamente como colado. Nome e foto vêm da página pública da loja quando
          ela libera; senão, da mensagem. Preço de mensagem só é salvo se você confirmar que
          conferiu agora. Comissão só aparece com a integração oficial da loja conectada.
        </p>
      </div>
      <label className="flex items-center gap-2 text-sm font-semibold">
        <input type="checkbox" checked={toRadar} onChange={(e) => setToRadar(e.target.checked)} />
        Enviar também ao Radar de Oportunidades (fonte: mensagem, vale 24h)
      </label>
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy || !text.trim()} onClick={find}>
          Identificar produtos
        </Button>
        <Button variant="outline" disabled={busy} onClick={loadDrafts}>
          Reprocessar rascunhos incompletos
        </Button>
      </div>

      {progress && (
        <div aria-live="polite" className="space-y-1">
          <p className="text-sm font-bold">
            {progress.label}: {progress.done} de {progress.total}
          </p>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${(progress.done / progress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {summary && (
        <p role="status" className="rounded-xl bg-muted p-3 text-sm font-bold">
          Resumo: {summary["published"]} publicado(s) · {summary["created"]} rascunho(s) ·{" "}
          {summary["duplicate"]} duplicado(s) · {summary["error"]} com erro
        </p>
      )}
      {cards.length > 0 && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-bold">Encontrados: {cards.length}</span>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() =>
                setCards((xs) =>
                  xs.map((x) =>
                    selectable.includes(x)
                      ? { ...x, selected: chosen.length !== selectable.length }
                      : x,
                  ),
                )
              }
            >
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
              <li
                key={c.key}
                className="grid gap-3 rounded-xl border border-border p-3 sm:grid-cols-[96px_1fr]"
              >
                <div className="flex size-24 items-center justify-center overflow-hidden rounded-lg bg-muted text-center text-xs text-muted-foreground">
                  {c.imageUrl?.startsWith("/img/") ? (
                    <AdminImg src={c.imageUrl} alt="" className="size-full object-contain" />
                  ) : c.imageUrl ? (
                    <img
                      src={c.imageUrl}
                      alt=""
                      referrerPolicy="no-referrer"
                      className="size-full object-contain"
                    />
                  ) : (
                    "Sem foto"
                  )}
                </div>
                <div className="min-w-0 space-y-2 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="flex items-center gap-1 font-semibold">
                      <input
                        type="checkbox"
                        checked={c.selected}
                        disabled={!selectable.includes(c) || busy}
                        onChange={(e) => patch(c.key, { selected: e.target.checked })}
                      />
                      Selecionar
                    </label>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-bold">
                      {c.marketplaceName ?? "Loja não cadastrada"}
                    </span>
                    <span className="text-xs font-bold">
                      {c.status === "found" ? "Encontrado" : STATUS_LABEL[c.status]}
                    </span>
                    {c.productId && (
                      <Link
                        to="/admin/produtos/$id"
                        params={{ id: c.productId }}
                        className="text-xs font-bold text-navy underline"
                      >
                        Abrir cadastro
                      </Link>
                    )}
                  </div>
                  {c.updateId && (
                    <p className="text-xs font-bold text-navy">
                      Completando rascunho existente (só campos vazios)
                    </p>
                  )}
                  <p className="truncate text-xs text-muted-foreground" title={c.url}>
                    {c.url}
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div>
                      <Label className="text-xs">
                        Nome {c.nameSource && <span className="font-normal">({c.nameSource})</span>}
                      </Label>
                      <Input
                        value={c.name}
                        disabled={busy}
                        onChange={(e) => patch(c.key, { name: e.target.value })}
                        className="h-9"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Categoria</Label>
                      <select
                        className={sel}
                        value={c.categoryId ?? ""}
                        disabled={busy}
                        onChange={(e) => patch(c.key, { categoryId: e.target.value || null })}
                      >
                        <option value="">
                          {opts.defaultCategoryId ? "Usar a categoria padrão" : "Sem categoria"}
                        </option>
                        {cats.map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <Label className="text-xs">Preço da mensagem (R$)</Label>
                      <Input
                        value={c.priceText}
                        disabled={busy}
                        inputMode="decimal"
                        onChange={(e) => patch(c.key, { priceText: e.target.value })}
                        className="h-9"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Preço anterior (R$)</Label>
                      <Input
                        value={c.prevText}
                        disabled={busy}
                        inputMode="decimal"
                        onChange={(e) => patch(c.key, { prevText: e.target.value })}
                        className="h-9"
                      />
                    </div>
                  </div>
                  {c.priceText && (
                    <label className="flex items-center gap-1 text-xs font-semibold">
                      <input
                        type="checkbox"
                        checked={c.priceConfirmed}
                        disabled={busy}
                        onChange={(e) => patch(c.key, { priceConfirmed: e.target.checked })}
                      />
                      Conferi este preço na loja agora
                    </label>
                  )}
                  <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                    <span className="w-full font-semibold">
                      Informado na mensagem (não confirmado pela loja):
                    </span>
                    {c.discountPct != null && <span>Desconto: {c.discountPct}%</span>}
                    <span>
                      Comissão: {c.commissionPct != null ? `${c.commissionPct}%` : "não informada"}
                    </span>
                    {c.extraCommissionPct != null && (
                      <span>Comissão extra: {c.extraCommissionPct}%</span>
                    )}
                    {c.extraEarningsCents != null && (
                      <span>Ganhos extras: R$ {brl(c.extraEarningsCents)}</span>
                    )}
                    {c.coupon && <span>Cupom: {c.coupon}</span>}
                    {c.sales != null && <span>Vendas: {c.sales.toLocaleString("pt-BR")}</span>}
                    {c.rating != null && (
                      <span>Avaliação: {String(c.rating).replace(".", ",")}</span>
                    )}
                    {c.bestSeller && <span>Selo: mais vendido</span>}
                    {c.mostSearched && <span>Selo: mais buscado</span>}
                    {c.availability && <span>Disponibilidade na página: {c.availability}</span>}
                    <span className="w-full">
                      Fontes — API oficial: {c.sources.api} · Página pública: {c.sources.page} ·
                      Mensagem: {c.sources.message ? "sim" : "não"}
                      {c.extraImages.length > 0 &&
                        ` · ${c.extraImages.length} foto(s) adicional(is)`}
                    </span>
                  </div>
                  {c.pageDescription && (
                    <p className="line-clamp-3 text-xs">
                      <span className="font-semibold">Descrição da página: </span>
                      {c.pageDescription}
                    </p>
                  )}
                  {!c.imageUrl && (
                    <label className="block text-xs font-semibold">
                      Anexar foto da mensagem{" "}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        disabled={busy}
                        onChange={(e) => attach(c, e.target.files?.[0])}
                      />
                    </label>
                  )}
                  {(() => {
                    const miss = liveMissing(c, opts.defaultCategoryId);
                    if (c.status !== "found" && c.status !== "error") return null;
                    return (
                      <>
                        {(miss.length > 0 || c.notes.length > 0) && (
                          <p className="text-xs text-destructive">
                            {miss.length > 0 && `Pendente: ${miss.join(", ")}. `}
                            {c.notes.join(" ")}
                          </p>
                        )}
                        <details className="text-xs">
                          <summary className="cursor-pointer font-semibold">
                            Colar a mensagem de divulgação e tentar de novo
                          </summary>
                          <Textarea
                            rows={3}
                            value={c.context}
                            disabled={busy}
                            aria-label="Mensagem de divulgação deste produto"
                            onChange={(e) => patch(c.key, { context: e.target.value })}
                          />
                        </details>
                        <div className="flex flex-wrap items-center gap-3">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => retry(c)}
                          >
                            Tentar de novo
                          </Button>
                          {!c.updateId && c.marketplaceId && needsExplicitDraft(miss) && (
                            <label className="flex items-center gap-1 text-xs font-semibold">
                              <input
                                type="checkbox"
                                checked={c.allowIncomplete}
                                disabled={busy}
                                onChange={(e) =>
                                  patch(c.key, {
                                    allowIncomplete: e.target.checked,
                                    selected: e.target.checked,
                                  })
                                }
                              />
                              Salvar mesmo assim como rascunho incompleto
                            </label>
                          )}
                        </div>
                      </>
                    );
                  })()}
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
