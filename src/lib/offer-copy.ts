/** Valores em reais devem vir do bloco de preço, inclusive em ofertas antigas. */
export function withoutOfferPrice(text: string): string {
  return text
    .replace(/\s*[-–—|·:]?\s*R\$\s*(?:\d+(?:[.,]\d+)*)?\s*$/i, "")
    .replace(/R\$\s*\d+(?:[.,]\d+)*/gi, "o preço na loja")
    .trim();
}
