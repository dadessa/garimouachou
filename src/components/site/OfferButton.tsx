import { ExternalLink } from "lucide-react";
import { isAllowedAffiliateUrl } from "@/lib/marketplaces/types";
import type { Product } from "@/lib/catalog/types";
import { track } from "@/lib/analytics/track";

/** Aponta direto para o link de afiliado salvo, sem alterar nada; o clique é registrado à parte. */
export function OfferButton({
  product,
  label = "Ver oferta",
  className = "",
}: {
  product: Product;
  label?: string;
  className?: string;
}) {
  if (!isAllowedAffiliateUrl(product.affiliateUrl, product.marketplace.allowedDomains)) return null;
  return (
    <a
      href={product.affiliateUrl}
      target="_blank"
      rel="sponsored nofollow noopener"
      onClick={() => track("offer_click", { slug: product.slug })}
      className={`inline-flex h-11 items-center justify-center gap-2 rounded-full bg-primary px-5 text-sm font-extrabold text-primary-foreground shadow-card transition hover:brightness-110 ${className}`}
    >
      {label}
      <ExternalLink className="size-4" aria-hidden />
    </a>
  );
}
