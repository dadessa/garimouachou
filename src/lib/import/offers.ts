/**
 * Leitura de mensagens de divulgação (WhatsApp, Mercado Livre, Shopee) e listas de links.
 * Regra pura: nada é inventado — só o que está escrito no texto colado.
 */
export interface OfferBlock {
  /** Link exatamente como colado (com parâmetros de afiliado). */
  url: string;
  /** Texto da mensagem que acompanha o link. */
  context: string;
  name: string;
  priceCents: number | null;
  previousPriceCents: number | null;
  discountPct: number | null;
  coupon: string | null;
}

export const MAX_OFFERS = 50;
const URL_RE = /https?:\/\/[^\s<>"'`]+/gi;
const PRICE_RE = /R\$\s?(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:,\d{1,2})?)/gi;

/** Remove pontuação final que o WhatsApp cola junto do link. */
export function cleanUrl(u: string): string {
  return u.replace(/[)\].,;:!?*_~]+$/, "");
}

export function reaisToCents(v: string): number | null {
  const n = Number(v.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
}

/** Prefixo de mensagem exportada/copiada do WhatsApp: "[24/11 10:30] Fulana:" ou "24/11/2026 10:30 - Fulana:". */
const WA_PREFIX = /^\s*(\[[^\]]{4,25}\]\s*[^:]{1,40}:|\d{1,2}\/\d{1,2}(\/\d{2,4})?,?\s+\d{1,2}:\d{2}\s*-\s*[^:]{1,40}:)\s*/;
const NOT_NAME =
  /^(link|compre|comprar|cupom|frete|aproveite|corre|clique|acesse|garanta|oferta|promo[çc][aã]o|achadinho|por apenas|de r\$|r\$|\d+%)/i;

function cleanLine(l: string): string {
  return l
    .replace(WA_PREFIX, "")
    .replace(/[*_~`]/g, "")
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function guessName(context: string): string {
  for (const raw of context.split(/\r?\n/)) {
    const l = cleanLine(raw).replace(/[:\-–]+$/, "").trim();
    if ((l.match(/\p{L}/gu)?.length ?? 0) < 4) continue;
    if (NOT_NAME.test(l) || PRICE_RE.test(l)) {
      PRICE_RE.lastIndex = 0;
      continue;
    }
    return l.slice(0, 200);
  }
  return "";
}

export function parsePrices(context: string) {
  const deMatch = /de\s*:?\s*R\$\s?([\d.,]+)[\s\S]{0,40}?por\s*:?\s*R\$\s?([\d.,]+)/i.exec(context);
  let price: number | null = null;
  let prev: number | null = null;
  if (deMatch) {
    prev = reaisToCents(deMatch[1]!.replace(/[.,]$/, ""));
    price = reaisToCents(deMatch[2]!.replace(/[.,]$/, ""));
  } else {
    const all = [...context.matchAll(PRICE_RE)]
      .map((m) => reaisToCents(m[1]!))
      .filter((n): n is number => n != null);
    if (all.length === 1) price = all[0]!;
    else if (all.length >= 2) {
      price = Math.min(all[0]!, all[1]!);
      prev = Math.max(all[0]!, all[1]!);
      if (prev === price) prev = null;
    }
  }
  if (prev != null && price != null && prev <= price) prev = null;
  const d = /(\d{1,2})\s*%\s*(off|de\s+desconto|desconto)?/i.exec(context);
  const discountPct = d ? Number(d[1]) : null;
  const c = /cupom\s*:?\s*([A-Z0-9]{4,20})\b/i.exec(context);
  return { priceCents: price, previousPriceCents: prev, discountPct, coupon: c ? c[1]!.toUpperCase() : null };
}

/**
 * Separa o texto colado em ofertas: cada link fica com o texto escrito desde o link anterior
 * (mensagens com o link no fim, o mais comum). Texto depois do último link vai para ele.
 * Links repetidos entram uma vez só.
 */
export function splitOffers(text: string): OfferBlock[] {
  const matches = [...text.matchAll(URL_RE)];
  const out: OfferBlock[] = [];
  const seen = new Set<string>();
  let cursor = 0;
  matches.forEach((m, i) => {
    const url = cleanUrl(m[0]);
    const start = m.index ?? 0;
    let context = text.slice(cursor, start);
    cursor = start + m[0].length;
    if (i === matches.length - 1) context += "\n" + text.slice(cursor);
    else {
      // texto na mesma linha depois do link pertence a este link
      const rest = text.slice(cursor);
      const nl = rest.indexOf("\n");
      const sameLine = nl === -1 ? rest : rest.slice(0, nl);
      const nextUrlInLine = sameLine.search(URL_RE);
      URL_RE.lastIndex = 0;
      if (nextUrlInLine === -1) {
        context += sameLine;
        cursor += sameLine.length;
      }
    }
    context = context.trim().slice(0, 2000);
    if (seen.has(url)) return;
    seen.add(url);
    out.push({ url, context, name: guessName(context), ...parsePrices(context) });
  });
  return out;
}

/** Identificador do produto na loja, lido do endereço final (para achar duplicados). */
export function externalIdFromUrl(url: string): string | null {
  const ml = /\bMLB-?(\d{6,})/i.exec(url);
  if (ml) return `MLB${ml[1]}`;
  const sp = /-i\.(\d+)\.(\d+)/.exec(url) ?? /\/product\/(\d+)\/(\d+)/.exec(url);
  if (sp) return `${sp[1]}:${sp[2]}`;
  const az = /\/(?:dp|gp\/product)\/([A-Z0-9]{10})/.exec(url);
  if (az) return az[1]!;
  return null;
}
