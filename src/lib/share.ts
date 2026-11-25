import { SITE_URL } from "./site";
import type { Product } from "@/lib/catalog/types";

/** Endereço público da página do produto. */
export const productPageUrl = (slug: string) => `${SITE_URL}/p/${slug}`;

/** Frase curta que acompanha o endereço. Nunca leva preço. */
const shareMessage = (p: Product) => `Olha este achadinho: ${p.name}`;

/** Texto completo do compartilhamento: frase + endereço da página. */
export const shareText = (p: Product) => `${shareMessage(p)}\n${productPageUrl(p.slug)}`;

/** Endereço do WhatsApp com o texto já preenchido. */
export const whatsappShareUrl = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`;

/** Dados para o menu nativo de compartilhamento do celular. */
export const nativeShareData = (p: Product) => ({
  title: p.name,
  text: shareMessage(p),
  url: productPageUrl(p.slug),
});
