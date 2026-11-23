import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowDown, ArrowUp } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { adminBanners, swapOrder, type BannerRow } from "@/lib/admin/api";
import { friendlyError } from "@/lib/admin/errors";
import { removeImages, uploadImage } from "@/lib/admin/storage";

export const Route = createFileRoute("/admin/_painel/banners")({
  loader: ({ context }) => context.queryClient.ensureQueryData(adminBanners),
  head: () => ({
    meta: [
      { title: "Banners — Painel Garimou Achou!" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: Banners,
});

/** Destino: caminho do próprio site (/ofertas) ou endereço https. */
export const validBannerLink = (v: string) =>
  v === "" || /^\/(?!\/)[^\s\\]*$/.test(v) || /^https:\/\/[^\s\\]+$/.test(v);

function Banners() {
  const { data } = useSuspenseQuery(adminBanners);
  const qc = useQueryClient();
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin"] });
    qc.invalidateQueries({ queryKey: ["home"] });
  };
  const move = async (i: number, d: -1 | 1) => {
    const a = data[i],
      b = data[i + d];
    if (!a || !b) return;
    try {
      await swapOrder("banners", a, b);
      refresh();
    } catch (e) {
      toast.error(friendlyError(e));
    }
  };
  return (
    <>
      <h1 className="mb-1 text-2xl font-extrabold text-navy">Banners</h1>
      <p className="mb-4 text-sm text-muted-foreground">
        Aparecem no carrossel da página inicial, nesta ordem.
      </p>
      <ul className="space-y-3">
        {data.map((b, i) => (
          <BannerItem
            key={b.id}
            b={b}
            first={i === 0}
            last={i === data.length - 1}
            onMove={(d) => move(i, d)}
            onSaved={refresh}
          />
        ))}
      </ul>
    </>
  );
}

function BannerItem({
  b,
  first,
  last,
  onMove,
  onSaved,
}: {
  b: BannerRow;
  first: boolean;
  last: boolean;
  onMove: (d: -1 | 1) => void;
  onSaved: () => void;
}) {
  const [alt, setAlt] = useState(b.alt);
  const [link, setLink] = useState(b.link_url ?? "");
  const [busy, setBusy] = useState(false);
  const desk = useRef<HTMLInputElement>(null);
  const mob = useRef<HTMLInputElement>(null);
  const upd = async (patch: Partial<BannerRow>, msg: string) => {
    setBusy(true);
    const { error } = await supabase.from("banners").update(patch).eq("id", b.id);
    setBusy(false);
    if (error) {
      toast.error(friendlyError(error));
      return false;
    }
    toast.success(msg);
    onSaved();
    return true;
  };
  const swapImage = async (file: File | undefined, key: "image_url" | "image_mobile_url") => {
    if (!file) return;
    setBusy(true);
    try {
      const url = await uploadImage("banner-images", file);
      const old = b[key];
      if (await upd({ [key]: url }, "Imagem trocada."))
        removeImages("banner-images", [old]).catch(() => {});
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };
  const dirty = alt.trim() !== b.alt || link.trim() !== (b.link_url ?? "");
  const linkOk = validBannerLink(link.trim());
  return (
    <li
      className={`rounded-2xl border border-border bg-card p-3 ${b.is_active ? "" : "opacity-60"}`}
    >
      <div className="flex flex-wrap gap-3">
        <div className="flex flex-col justify-center">
          <button
            aria-label="Subir"
            disabled={first}
            onClick={() => onMove(-1)}
            className="disabled:opacity-30"
          >
            <ArrowUp className="size-4" />
          </button>
          <button
            aria-label="Descer"
            disabled={last}
            onClick={() => onMove(1)}
            className="disabled:opacity-30"
          >
            <ArrowDown className="size-4" />
          </button>
        </div>
        <img
          src={b.image_url}
          alt=""
          className="h-20 w-auto max-w-[240px] rounded-xl object-cover"
        />
        {b.image_mobile_url && (
          <img src={b.image_mobile_url} alt="" className="h-20 w-auto rounded-xl object-cover" />
        )}
        <div className="min-w-[220px] flex-1 space-y-2">
          <p className="font-bold">{b.title}</p>
          <div className="space-y-1">
            <Label htmlFor={`alt-${b.id}`}>Texto alternativo</Label>
            <Input
              id={`alt-${b.id}`}
              value={alt}
              maxLength={200}
              onChange={(e) => setAlt(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`link-${b.id}`}>Destino ao clicar (opcional)</Label>
            <Input
              id={`link-${b.id}`}
              value={link}
              placeholder="/ofertas"
              onChange={(e) => setLink(e.target.value)}
            />
            {!linkOk && (
              <p className="text-xs text-destructive">
                Use um caminho do site (ex.: /ofertas) ou um endereço https.
              </p>
            )}
          </div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {dirty && (
          <Button
            size="sm"
            disabled={busy || !linkOk || !alt.trim()}
            onClick={() => upd({ alt: alt.trim(), link_url: link.trim() || null }, "Banner salvo.")}
          >
            Salvar
          </Button>
        )}
        <input
          ref={desk}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          onChange={(e) => swapImage(e.target.files?.[0], "image_url")}
        />
        <input
          ref={mob}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          onChange={(e) => swapImage(e.target.files?.[0], "image_mobile_url")}
        />
        <Button size="sm" variant="outline" disabled={busy} onClick={() => desk.current?.click()}>
          Trocar imagem (computador)
        </Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => mob.current?.click()}>
          {b.image_mobile_url ? "Trocar" : "Enviar"} imagem (celular)
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="ml-auto"
          disabled={busy}
          onClick={() =>
            upd({ is_active: !b.is_active }, b.is_active ? "Banner desativado." : "Banner ativado.")
          }
        >
          {b.is_active ? "Desativar" : "Ativar"}
        </Button>
      </div>
    </li>
  );
}
