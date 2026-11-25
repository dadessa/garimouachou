import { withoutOfferPrice } from "@/lib/offer-copy";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ProductCard } from "@/components/site/ProductCard";
import { ProductDetail } from "@/components/site/ProductDetail";
import { CampaignLinks } from "@/components/admin/CampaignLinks";
import { supabase } from "@/integrations/supabase/client";
import {
  adminCategories,
  adminMarketplaces,
  adminProduct,
  type ProductInsert,
  type ProductRow,
} from "@/lib/admin/api";
import { friendlyError } from "@/lib/admin/errors";
import { AdminImg, removeImages, uploadImage, useAdminImageUrl } from "@/lib/admin/storage";
import { toMarketplace, type Product } from "@/lib/catalog/types";
import { matchAffiliateDomain } from "@/lib/marketplaces/types";
import { formatBRL } from "@/lib/price";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles } from "lucide-react";
import { generateCopy } from "@/lib/admin/ai.functions";
import { identifyOffers, importOfferImage } from "@/lib/import/offers.functions";
import { parseReais, publishMissing, slugify } from "@/lib/publish-rules";

export const Route = createFileRoute("/admin/_painel/produtos/$id")({
  loader: async ({ context, params }) => {
    const [cats, mks] = await Promise.all([
      context.queryClient.ensureQueryData(adminCategories),
      context.queryClient.ensureQueryData(adminMarketplaces),
    ]);
    const product: ProductRow | null =
      params.id === "novo"
        ? null
        : ((await context.queryClient.ensureQueryData(
            adminProduct(params.id),
          )) as ProductRow | null);
    if (params.id !== "novo" && !product) throw notFound();
    return { cats, mks, product };
  },
  head: () => ({
    meta: [
      { title: "Produto — Painel Garimou Achou!" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ProductForm,
});

const STATUS = { draft: "Rascunho", published: "Publicado", inactive: "Inativo" } as const;
const centsToInput = (c: number | null) =>
  c == null ? "" : (c / 100).toFixed(2).replace(".", ",");
const toLocalInput = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

function ProductForm() {
  const { id } = Route.useParams();
  const { data: cats } = useSuspenseQuery(adminCategories);
  const { data: mks } = useSuspenseQuery(adminMarketplaces);
  const initial: ProductRow | null = Route.useLoaderData().product;
  const qc = useQueryClient();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);

  const [f, setF] = useState({
    name: initial?.name ?? "",
    slug: initial?.slug ?? "",
    slugTouched: !!initial,
    description: initial?.short_description ?? "",
    categoryId: initial?.category_id ?? "",
    marketplaceId: initial?.marketplace_id ?? "",
    imageUrl: initial?.main_image_url ?? (null as string | null),
    imageAlt: initial?.main_image_alt ?? "",
    url: initial?.affiliate_url ?? "",
    price: centsToInput(initial?.current_price_cents ?? null),
    prev: centsToInput(initial?.previous_price_cents ?? null),
    checkedAt: toLocalInput(initial?.price_checked_at ?? null),
    featured: initial?.is_featured ?? false,
    weekly: initial?.is_weekly_pick ?? false,
    tags: (initial?.tags ?? []).join(", "),
    details: "",
  });
  const genFn = useServerFn(generateCopy);
  const [genBusy, setGenBusy] = useState(false);
  const identifyFn = useServerFn(identifyOffers);
  const copyImgFn = useServerFn(importOfferImage);
  const [lookBusy, setLookBusy] = useState(false);
  const [lookNotes, setLookNotes] = useState<string[]>([]);

  /** Busca dados pelo link e preenche só campos vazios (o link nunca muda). */
  async function lookup() {
    if (!f.url.trim()) {
      toast.error("Informe o link de afiliada primeiro.");
      return;
    }
    setLookBusy(true);
    setLookNotes([]);
    try {
      const r = await identifyFn({
        data: { blocks: [{ url: f.url, context: f.details }], useAi: true },
      });
      const it = r.items[0];
      if (!it) {
        toast.error(r.error ?? "Não foi possível consultar o link.");
        return;
      }
      const filled: string[] = [];
      const notes = [...it.notes];
      let img: string | null = null;
      if (!f.imageUrl && it.imageUrl) {
        const c = await copyImgFn({ data: { url: it.imageUrl } });
        if (c.path) img = c.path;
        else notes.push(`Foto: ${c.error}`);
      }
      setF((s) => {
        const n = { ...s };
        if (!s.name.trim() && it.name) {
          n.name = it.name;
          filled.push("nome");
          if (!s.slugTouched || !s.slug) n.slug = slugify(it.name);
        }
        if (img) {
          n.imageUrl = img;
          if (!s.imageAlt) n.imageAlt = n.name;
          filled.push("foto");
        }
        if (!s.categoryId && it.categoryId) {
          n.categoryId = it.categoryId;
          filled.push("categoria");
        }
        if (!s.marketplaceId && it.marketplaceId) n.marketplaceId = it.marketplaceId;
        if (!s.details && it.pageDescription) n.details = it.pageDescription;
        return n;
      });
      setLookNotes(notes);
      if (filled.length)
        toast.success(`Preenchido pelo link: ${filled.join(", ")}. Revise e salve.`);
      else toast.error("Nenhum dado novo foi encontrado pelo link. Veja o motivo abaixo.");
    } catch {
      toast.error("A consulta falhou. Tente de novo.");
    } finally {
      setLookBusy(false);
    }
  }
  const [status, setStatus] = useState<ProductRow["status"]>(initial?.status ?? "draft");
  const [replaced, setReplaced] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [confirm, setConfirm] = useState<null | "delete" | "deactivate">(null);
  const [showMissing, setShowMissing] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));

  const cat = cats.find((c) => c.id === f.categoryId) ?? null;
  const mk = mks.find((m) => m.id === f.marketplaceId) ?? null;
  const manualOk = mk ? mk.allow_manual_price : true;
  const domain = mk && f.url ? matchAffiliateDomain(f.url, mk.allowed_domains) : null;
  const priceCents = manualOk ? parseReais(f.price) : null;
  const prevCents = manualOk ? parseReais(f.prev) : null;
  const priceErr =
    Number.isNaN(priceCents) || Number.isNaN(prevCents)
      ? "Use o formato 129,90."
      : prevCents != null && (priceCents == null || prevCents <= priceCents)
        ? "O preço anterior precisa ser maior que o atual."
        : null;
  const slugErr =
    f.slug && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(f.slug)
      ? "Use só letras minúsculas, números e hífens."
      : !f.slug
        ? "Informe o slug."
        : null;
  const missing = publishMissing({
    name: f.name,
    mainImageUrl: f.imageUrl,
    mainImageAlt: f.imageAlt,
    affiliateUrl: f.url,
    category: cat ? { isActive: cat.is_active } : null,
    marketplace: mk
      ? { isActive: mk.is_active, name: mk.name, allowedDomains: mk.allowed_domains }
      : null,
  });

  const previewImg = useAdminImageUrl(f.imageUrl);
  const preview: Product | null = useMemo(
    () =>
      mk && {
        slug: f.slug || "previa",
        name: withoutOfferPrice(f.name),
        shortDescription: withoutOfferPrice(f.description),
        categorySlug: cat?.slug ?? "",
        categoryName: cat?.name ?? "Sem categoria",
        marketplace: toMarketplace(mk),
        affiliateUrl: f.url,
        imageUrl: previewImg,
        imageAlt: f.imageAlt || f.name,
        isFeatured: f.featured,
        isWeeklyPick: f.weekly,
        publishedAt: null,
        currentPrice: Number.isNaN(priceCents) ? null : priceCents,
        previousPrice: Number.isNaN(prevCents) ? null : prevCents,
        priceCheckedAt: f.checkedAt ? new Date(f.checkedAt).toISOString() : null,
        priceSource: initial?.price_source ?? "manual",
        tags: [
          ...new Set(
            f.tags
              .split(",")
              .map((t) => t.trim().toLowerCase())
              .filter(Boolean),
          ),
        ],
      },
    [f, previewImg, mk, cat, priceCents, prevCents, initial?.price_source],
  );

  async function onImage(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadImage("product-images", file);
      if (f.imageUrl) setReplaced((r) => [...r, f.imageUrl!]);
      set("imageUrl", url);
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function save(nextStatus: ProductRow["status"]) {
    if (slugErr || priceErr) {
      toast.error(slugErr ?? priceErr ?? "");
      return;
    }
    if (nextStatus === "published" && missing.length) {
      setShowMissing(true);
      toast.error("Ainda falta preencher alguns itens para publicar.");
      return;
    }
    setBusy(true);
    const payload: ProductInsert = {
      name: f.name.trim(),
      slug: f.slug,
      short_description: f.description.trim(),
      category_id: f.categoryId || null,
      marketplace_id: f.marketplaceId || null,
      affiliate_url: f.url, // gravada exatamente como foi colada
      main_image_url: f.imageUrl,
      main_image_alt: f.imageAlt.trim() || null,
      current_price_cents: priceCents,
      previous_price_cents: prevCents,
      price_checked_at:
        manualOk && f.checkedAt
          ? new Date(f.checkedAt).toISOString()
          : manualOk
            ? null
            : (initial?.price_checked_at ?? null),
      is_featured: f.featured,
      is_weekly_pick: f.weekly,
      tags: [
        ...new Set(
          f.tags
            .split(",")
            .map((t) => t.trim().toLowerCase())
            .filter(Boolean),
        ),
      ],
      status: nextStatus,
      ...(initial?.review_status === "pending" && nextStatus !== "draft"
        ? { review_status: nextStatus === "published" ? "approved" : "rejected" }
        : {}),
    };
    const res =
      id === "novo"
        ? await supabase.from("products").insert(payload).select("id").single()
        : await supabase.from("products").update(payload).eq("id", id).select("id").single();
    setBusy(false);
    if (res.error) {
      toast.error(friendlyError(res.error));
      return;
    }
    if (replaced.length) {
      removeImages("product-images", replaced).catch(() => {});
      setReplaced([]);
    }
    setStatus(nextStatus);
    await qc.invalidateQueries({ queryKey: ["admin"] });
    qc.invalidateQueries({ queryKey: ["home"] });
    qc.invalidateQueries({ queryKey: ["offers"] });
    qc.invalidateQueries({ queryKey: ["search"] });
    qc.invalidateQueries({ queryKey: ["product"] });
    toast.success(
      nextStatus === "published"
        ? "Produto publicado!"
        : nextStatus === "inactive"
          ? "Produto desativado."
          : "Rascunho salvo.",
    );
    if (id === "novo")
      navigate({ to: "/admin/produtos/$id", params: { id: res.data.id }, replace: true });
  }

  async function remove() {
    setBusy(true);
    try {
      // 1) Guarda as fotos ligadas ao produto antes de apagar a linha.
      const { data: extra } = await supabase
        .from("product_images")
        .select("url")
        .eq("product_id", id);
      const urls = [
        f.imageUrl,
        initial?.main_image_url,
        ...replaced,
        ...(extra ?? []).map((x) => x.url),
      ];
      // 2) Apaga o produto primeiro: se falhar, nenhuma foto é perdida.
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) throw error;
      // 3) Só então remove as fotos que nenhum outro produto usa.
      const unique = [...new Set(urls.filter((u): u is string => !!u))];
      const { data: inUse } = unique.length
        ? await supabase.from("products").select("main_image_url").in("main_image_url", unique)
        : { data: [] };
      const used = new Set((inUse ?? []).map((r) => r.main_image_url));
      removeImages(
        "product-images",
        unique.filter((u) => !used.has(u)),
      ).catch(() => {});
      await qc.invalidateQueries({ queryKey: ["admin"] });
      for (const k of ["home", "offers", "search", "product", "category"])
        qc.invalidateQueries({ queryKey: [k] });
      toast.success("Produto excluído.");
      navigate({ to: "/admin/produtos" });
    } catch (e) {
      toast.error(friendlyError(e));
      setBusy(false);
    }
  }

  async function onGenerate() {
    setGenBusy(true);
    try {
      const r = await genFn({
        data: { name: f.name, category: cat?.name ?? "", affiliateUrl: f.url, details: f.details },
      });
      if (r.error) toast.error(r.error);
      else {
        setF((s) => ({ ...s, description: r.description, tags: r.tags.join(", ") }));
        toast.success("Descrição e etiquetas geradas. Revise antes de salvar.");
      }
    } catch {
      toast.error("Não foi possível gerar agora. Tente de novo.");
    } finally {
      setGenBusy(false);
    }
  }

  const field = "space-y-1.5";
  const selectCls = "h-11 w-full rounded-md border border-input bg-background px-3 text-sm";
  const publicUrl = `/p/${f.slug}`;
  const checks = [
    { label: "Nome", ok: !!f.name.trim() },
    { label: "Categoria ativa", ok: !!cat?.is_active },
    { label: "Marketplace ativo", ok: !!mk?.is_active },
    { label: "Link de afiliada aceito", ok: !!domain },
    { label: "Imagem principal", ok: !!f.imageUrl },
    { label: "Texto alternativo", ok: !!f.imageAlt.trim() },
    { label: "Endereço válido", ok: !slugErr },
  ];
  const discount =
    priceCents &&
    prevCents &&
    !Number.isNaN(priceCents) &&
    !Number.isNaN(prevCents) &&
    prevCents > priceCents
      ? Math.round((1 - priceCents / prevCents) * 100)
      : null;
  const statusTone =
    status === "published"
      ? "bg-yellow text-navy"
      : status === "inactive"
        ? "bg-muted text-muted-foreground"
        : "bg-navy/10 text-navy";

  return (
    <>
      <div className="mb-5 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <div className="min-w-0">
          <Link to="/admin/produtos" className="text-xs font-bold text-navy underline">
            ← Produtos
          </Link>
          <h1 className="truncate text-xl font-extrabold text-navy md:text-2xl">
            {id === "novo" ? "Novo produto" : f.name || "Editar produto"}
          </h1>
        </div>
        <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-extrabold ${statusTone}`}>
          {STATUS[status]}
        </span>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <form
          id="product-form"
          className="min-w-0 space-y-5 [&_input:not([type=checkbox])]:h-11"
          onSubmit={(e) => {
            e.preventDefault();
            save(status === "published" ? "published" : "draft");
          }}
        >
          <FormCard n={1} title="Informações básicas">
            <div className={field}>
              <Label htmlFor="nome">Título do achadinho</Label>
              <Input
                id="nome"
                aria-describedby="nome-dica"
                value={f.name}
                maxLength={150}
                onChange={(e) =>
                  setF((s) => ({
                    ...s,
                    name: e.target.value,
                    slug: s.slugTouched ? s.slug : slugify(e.target.value),
                  }))
                }
              />
              <p id="nome-dica" className="text-xs text-muted-foreground">
                Use marca, modelo e uma característica importante. Preencha o preço no campo próprio.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className={field}>
                <Label htmlFor="cat">Categoria</Label>
                <select
                  id="cat"
                  className={selectCls}
                  value={f.categoryId}
                  onChange={(e) => set("categoryId", e.target.value)}
                >
                  <option value="">Escolha…</option>
                  {cats.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.is_active ? "" : " (desativada)"}
                    </option>
                  ))}
                </select>
              </div>
              <div className={field}>
                <Label htmlFor="mk">Marketplace</Label>
                <select
                  id="mk"
                  className={selectCls}
                  value={f.marketplaceId}
                  onChange={(e) => set("marketplaceId", e.target.value)}
                >
                  <option value="">Escolha…</option>
                  {mks.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                      {m.is_active ? "" : " (desativado)"}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex flex-wrap gap-5">
              <label className="flex items-center gap-2 text-sm font-semibold">
                <input
                  type="checkbox"
                  checked={f.featured}
                  onChange={(e) => set("featured", e.target.checked)}
                />
                Destaque (aparece em Ofertas)
              </label>
              <label className="flex items-center gap-2 text-sm font-semibold">
                <input
                  type="checkbox"
                  checked={f.weekly}
                  onChange={(e) => set("weekly", e.target.checked)}
                />
                Achadinho da semana
              </label>
            </div>
          </FormCard>

          <FormCard n={2} title="Conteúdo comercial">
            <div className="space-y-3 rounded-xl border border-border bg-muted/40 p-3">
              <p className="text-sm font-bold">Gerar com IA</p>
              <p className="text-xs text-muted-foreground">
                Preencha nome, categoria e link, conte os detalhes do produto e a IA sugere a
                descrição e as etiquetas. Ela não inventa preço, desconto nem avaliação.
              </p>
              <Textarea
                id="details"
                rows={2}
                aria-label="Detalhes do produto para a IA"
                placeholder="Ex.: látex, 16 polegadas, cor platino, pacote com 12, ideal para festas"
                value={f.details}
                onChange={(e) => set("details", e.target.value)}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={genBusy || !f.name.trim()}
                onClick={onGenerate}
              >
                <Sparkles className="size-4" aria-hidden />
                {genBusy ? "Gerando…" : "Gerar descrição e etiquetas"}
              </Button>
            </div>
            <div className={field}>
              <Label htmlFor="desc">Por que vale o garimpo?</Label>
              <Textarea
                id="desc"
                aria-describedby="desc-dica"
                rows={3}
                maxLength={400}
                value={f.description}
                onChange={(e) => set("description", e.target.value)}
              />
              <p id="desc-dica" className="text-xs text-muted-foreground">
                Escreva uma frase com uma vantagem concreta para quem vai comprar.
              </p>
            </div>
            <div className={field}>
              <Label htmlFor="tags">Etiquetas (separadas por vírgula)</Label>
              <Input
                id="tags"
                value={f.tags}
                onChange={(e) => set("tags", e.target.value)}
                placeholder="festa, aniversário, decoração"
              />
            </div>
          </FormCard>

          <FormCard n={3} title="Mídia">
            <div className="flex items-center gap-4">
              <div className="size-24 shrink-0 overflow-hidden rounded-xl border border-border bg-muted">
                <AdminImg src={f.imageUrl} alt="" className="size-full object-contain" />
              </div>
              <div className="min-w-0 space-y-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  id="img"
                  onChange={(e) => onImage(e.target.files?.[0])}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={uploading}
                  onClick={() => fileRef.current?.click()}
                >
                  {uploading ? "Enviando..." : f.imageUrl ? "Trocar imagem" : "Enviar imagem"}
                </Button>
                <p className="text-xs text-muted-foreground">
                  Imagem principal · JPG, PNG ou WebP, até 5 MB.
                </p>
              </div>
            </div>
            <div className={field}>
              <Label htmlFor="alt">Texto alternativo (obrigatório)</Label>
              <Input
                id="alt"
                maxLength={200}
                placeholder="Ex.: Garrafa térmica azul de 500 ml"
                value={f.imageAlt}
                onChange={(e) => set("imageAlt", e.target.value)}
              />
            </div>
          </FormCard>

          <FormCard n={4} title="Oferta e link de afiliada">
            <div className={field}>
              <Label htmlFor="url">URL oficial de afiliado</Label>
              <Input
                id="url"
                inputMode="url"
                spellCheck={false}
                value={f.url}
                onChange={(e) => set("url", e.target.value.trim())}
                placeholder="https://..."
              />
              {f.url && (
                <p className={`text-xs font-semibold ${domain ? "text-navy" : "text-destructive"}`}>
                  {!mk
                    ? "Escolha o marketplace para validar o link."
                    : domain
                      ? `✓ Domínio reconhecido: ${domain}`
                      : `Link não aceito. Precisa ser https e de: ${mk.allowed_domains.join(", ")}.`}
                </p>
              )}
              {lookNotes.length > 0 && (
                <ul className="list-disc pl-5 text-xs text-destructive">
                  {lookNotes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              )}
            </div>
            <fieldset className="space-y-3" disabled={!manualOk}>
              {!manualOk && (
                <p className="rounded-lg bg-muted p-2 text-xs font-semibold text-muted-foreground">
                  As regras da {mk?.name} não permitem preço digitado à mão. O preço fica oculto no
                  site até existir uma integração oficial.
                </p>
              )}
              <div className="grid gap-3 sm:grid-cols-3">
                <div className={field}>
                  <Label htmlFor="preco">Preço atual (R$)</Label>
                  <Input
                    id="preco"
                    inputMode="decimal"
                    placeholder="129,90"
                    value={f.price}
                    onChange={(e) => set("price", e.target.value)}
                  />
                </div>
                <div className={field}>
                  <Label htmlFor="ant">Preço anterior (R$)</Label>
                  <Input
                    id="ant"
                    inputMode="decimal"
                    placeholder="159,90"
                    value={f.prev}
                    onChange={(e) => set("prev", e.target.value)}
                  />
                </div>
                <div className={field}>
                  <Label>Desconto</Label>
                  <p className="flex h-11 items-center rounded-md border border-dashed border-border px-3 text-sm text-muted-foreground">
                    {discount != null ? `${discount}% (calculado)` : "—"}
                  </p>
                </div>
              </div>
              {priceErr && <p className="text-xs text-destructive">{priceErr}</p>}
              <div className="flex flex-wrap items-end gap-3">
                <div className={field}>
                  <Label htmlFor="verif">Última verificação do preço</Label>
                  <Input
                    id="verif"
                    type="datetime-local"
                    value={f.checkedAt}
                    onChange={(e) => set("checkedAt", e.target.value)}
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="h-11"
                  onClick={() => set("checkedAt", toLocalInput(new Date().toISOString()))}
                >
                  Confirmar preço agora
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                O preço só aparece no site por {mk?.price_max_age_hours ?? 24} h depois da
                verificação.
              </p>
            </fieldset>
          </FormCard>

          <FormCard n={5} title="Endereço e SEO">
            <div className={field}>
              <Label htmlFor="slug">Endereço (slug)</Label>
              <Input
                id="slug"
                value={f.slug}
                maxLength={100}
                onChange={(e) => setF((s) => ({ ...s, slug: e.target.value, slugTouched: true }))}
              />
              <p
                className={`break-all text-xs ${slugErr ? "text-destructive" : "text-muted-foreground"}`}
              >
                {slugErr ?? `garimouachou.com.br/p/${f.slug}`}
              </p>
            </div>
          </FormCard>

          {(showMissing || status !== "published") && missing.length > 0 && (
            <div className="rounded-2xl border border-border bg-card p-4 text-sm" role="status">
              <p className="font-bold text-navy">Falta para publicar:</p>
              <ul className="ml-5 list-disc">
                {missing.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            </div>
          )}
        </form>

        <aside className="space-y-4 lg:sticky lg:top-28">
          <PanelCard title="Ações">
            <div className="grid gap-2">
              {status === "published" ? (
                <Button type="submit" form="product-form" disabled={busy}>
                  Salvar alterações
                </Button>
              ) : (
                <>
                  <Button type="button" disabled={busy} onClick={() => save("published")}>
                    Publicar produto
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() => save("draft")}
                  >
                    Salvar rascunho
                  </Button>
                </>
              )}
              {status === "published" && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => setConfirm("deactivate")}
                >
                  Desativar
                </Button>
              )}
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={lookBusy || !f.url}
                  onClick={lookup}
                >
                  {lookBusy ? "Buscando…" : "Buscar pelo link"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={genBusy || !f.name.trim()}
                  onClick={onGenerate}
                >
                  <Sparkles className="size-4" aria-hidden />
                  {genBusy ? "Gerando…" : "Texto com IA"}
                </Button>
                {initial?.status === "published" && (
                  <Button asChild variant="outline" size="sm">
                    <a href={publicUrl} target="_blank" rel="noopener">
                      Ver no site
                    </a>
                  </Button>
                )}
                {f.url && (
                  <Button asChild variant="outline" size="sm">
                    <a href={f.url} target="_blank" rel="noopener noreferrer">
                      Abrir link
                    </a>
                  </Button>
                )}
              </div>
              {id !== "novo" && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  disabled={busy}
                  onClick={() => setConfirm("delete")}
                >
                  Excluir produto
                </Button>
              )}
            </div>
          </PanelCard>

          <PanelCard title="Pronto para publicar?">
            <ul className="space-y-1 text-sm">
              {checks.map((c) => (
                <li key={c.label} className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className={`grid size-5 shrink-0 place-items-center rounded-full text-xs font-extrabold ${c.ok ? "bg-yellow text-navy" : "bg-muted text-muted-foreground"}`}
                  >
                    {c.ok ? "✓" : "•"}
                  </span>
                  <span className={c.ok ? "" : "text-muted-foreground"}>{c.label}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted-foreground">
              Marketplace:{" "}
              {mk ? `${mk.name}${mk.is_active ? "" : " (desativado)"}` : "não escolhido"}
            </p>
          </PanelCard>

          <PanelCard title="Prévia do card">
            {preview ? (
              <div className="mx-auto max-w-[220px]">
                <ProductCard product={preview} preview />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Escolha o marketplace para ver a prévia.
              </p>
            )}
            {preview?.currentPrice != null && !manualOk && (
              <p className="mt-2 text-xs text-muted-foreground">
                Preço oculto: {formatBRL(preview.currentPrice)} não será exibido.
              </p>
            )}
          </PanelCard>
        </aside>
      </div>

      {preview && (
        <section className="mt-8">
          <h2 className="mb-2 text-sm font-extrabold text-navy">
            Pré-visualização da página do produto
          </h2>
          <div className="relative overflow-hidden rounded-2xl border border-border bg-background p-4">
            {status !== "published" && (
              <div className="absolute inset-x-0 top-0 bg-yellow py-1 text-center text-xs font-extrabold text-navy">
                Rascunho — visível só no painel
              </div>
            )}
            <div className="pt-6">
              <ProductDetail product={preview} preview />
            </div>
          </div>
        </section>
      )}

      {initial?.status === "published" && <CampaignLinks slug={initial.slug} />}

      <AlertDialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm === "delete" ? "Excluir este produto?" : "Desativar este produto?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "delete"
                ? "O produto e as imagens dele serão apagados de vez. Não dá para desfazer."
                : "Ele sai do site na hora. Você pode publicar de novo depois."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => (confirm === "delete" ? remove() : save("inactive"))}>
              {confirm === "delete" ? "Excluir" : "Desativar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function FormCard({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-4 md:p-5">
      <h2 className="flex items-center gap-2 text-base font-extrabold text-navy">
        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-yellow text-xs">
          {n}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function PanelCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <h2 className="mb-3 text-sm font-extrabold text-navy">{title}</h2>
      {children}
    </section>
  );
}
