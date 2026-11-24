import { useEffect, useState } from "react";
import { Link2, MessageCircle, Share2 } from "lucide-react";
import { useHydrated } from "@tanstack/react-router";
import type { Product } from "@/lib/catalog/types";
import { track } from "@/lib/analytics/track";
import { nativeShareData, productPageUrl, shareText, whatsappShareUrl } from "@/lib/share";

const btn =
  "inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full border border-border bg-card px-4 text-sm font-bold text-navy transition hover:bg-accent";

/** Compartilha a página do produto pelo WhatsApp ou pelo menu nativo do celular. */
export function ShareButtons({ product }: { product: Product }) {
  const hydrated = useHydrated();
  const [copied, setCopied] = useState(false);
  const canNative = hydrated && typeof navigator !== "undefined" && !!navigator.share;

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2500);
    return () => clearTimeout(t);
  }, [copied]);

  const copy = async (log = true) => {
    if (log) track("share_click", { slug: product.slug, channel: "copiar" });
    try {
      await navigator.clipboard.writeText(productPageUrl(product.slug));
      setCopied(true);
    } catch {
      /* sem permissão para copiar: nada a fazer */
    }
  };

  const native = async () => {
    track("share_click", { slug: product.slug, channel: "nativo" });
    try {
      await navigator.share(nativeShareData(product));
    } catch (e) {
      if ((e as DOMException)?.name !== "AbortError") await copy(false);
    }
  };

  return (
    <div role="group" aria-label="Compartilhar este produto" className="flex flex-wrap gap-2">
      <a
        href={whatsappShareUrl(shareText(product))}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => track("share_click", { slug: product.slug, channel: "whatsapp" })}
        className={btn}
      >
        <MessageCircle className="size-4" aria-hidden />
        WhatsApp
      </a>
      {canNative ? (
        <button type="button" onClick={native} className={btn}>
          <Share2 className="size-4" aria-hidden />
          Compartilhar
        </button>
      ) : (
        <button type="button" onClick={() => copy()} className={btn}>
          <Link2 className="size-4" aria-hidden />
          {copied ? "Link copiado" : "Copiar link"}
        </button>
      )}
    </div>
  );
}
