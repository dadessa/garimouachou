import { ExternalLink } from "lucide-react";
import type { Product } from "@/lib/sample-data";

/** Na Etapa 4 vira link para /go/:slug. Sem URL de afiliado, fica desativado. */
export function OfferButton({ product, label = "Ver oferta", className = "" }: { product: Product; label?: string; className?: string }) {
  const base = `inline-flex h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-extrabold transition ${className}`;
  if (!product.affiliateUrl) {
    return <span aria-disabled="true" title="Produto de exemplo, sem link" className={`${base} cursor-not-allowed bg-primary/40 text-primary-foreground`}>{label}</span>;
  }
  return (
    <a href={`/go/${product.slug}`} rel="sponsored nofollow noopener" className={`${base} bg-primary text-primary-foreground shadow-card hover:brightness-110`}>
      {label}<ExternalLink className="size-4" />
    </a>
  );
}
