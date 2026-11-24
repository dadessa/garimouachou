/**
 * Leitura de mensagens de divulgação (WhatsApp, Mercado Livre, Shopee) e listas de links.
 * Regra pura: nada é inventado — só o que está escrito no texto colado.
 */
export interface OfferFacts {
  priceCents: number | null;
  previousPriceCents: number | null;
  /** Desconto ao cliente (nunca comissão). */
  discountPct: number | null;
  /** Comissão da afiliada (%). */
  commissionPct: number | null;
  /** Comissão extra / ganhos extras em %. */
  extraCommissionPct: number | null;
  /** Ganhos extras em reais (centavos). */
  extraEarningsCents: number | null;
  coupon: string | null;
  sales: number | null;
  rating: number | null;
  bestSeller: boolean;
  mostSearched: boolean;
}

export interface OfferBlock extends OfferFacts {
  /** Link exatamente como colado (com parâmetros de afiliado). */
  url: string;
  /** Texto da mensagem que acompanha o link. */
  context: string;
  name: string;
}

export const MAX_OFFERS = 50;
const URL_RE = /https?:\/\/[^\s<>"'`]+/gi;
const MONEY = String.raw`R\$\s?(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:,\d{1,2})?)`;
const PRICE_RE = new RegExp(MONEY, "gi");

const count = (s: string, c: string) => s.split(c).length - 1;

/**
 * Tira só o que não faz parte do link: pontuação de frase no fim, parêntese/colchete sem par
 * e marcação do WhatsApp (*negrito*, _itálico_, ~riscado~) quando ela abre logo antes do link.
 * "_", "~", "=", "&", "-", "/" e parênteses balanceados são caracteres válidos e ficam.
 */
export function cleanUrl(u: string, before = ""): string {
  let s = u;
  const mark = before.slice(-1);
  for (;;) {
    const last = s.slice(-1);
    if (/[.,;:!?]/.test(last)) s = s.slice(0, -1);
    else if (last === ")" && count(s, ")") > count(s, "(")) s = s.slice(0, -1);
    else if (last === "]" && count(s, "]") > count(s, "[")) s = s.slice(0, -1);
    else if ("*_~".includes(last) && last === mark) s = s.slice(0, -1);
    else return s;
  }
}

export function reaisToCents(v: string): number | null {
  const n = Number(v.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
}

const WA_PREFIX =
  /^\s*(\[[^\]]{4,25}\]\s*[^:]{1,40}:|\d{1,2}\/\d{1,2}(\/\d{2,4})?,?\s+\d{1,2}:\d{2}\s*-\s*[^:]{1,40}:)\s*/;
const NOT_NAME =
  /^(link|compre|comprar|cupom|frete|aproveite|corre|clique|acesse|garanta|oferta|promo[çc][aã]o|achadinho|por apenas|de r\$|r\$|\d+%|comiss|ganhos?|mais vendido|mais buscado|mais procurado|avalia|nota|\+?\s?\d+[.,]?\d*\s*(mil)?\s*vendid)/i;

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
    const l = cleanLine(raw)
      .replace(/[:\-–]+$/, "")
      .trim();
    if ((l.match(/\p{L}/gu)?.length ?? 0) < 4) continue;
    if (NOT_NAME.test(l) || new RegExp(MONEY, "i").test(l)) continue;
    return l.slice(0, 200);
  }
  return "";
}

const num = (s: string) => Number(s.replace(",", "."));

/** Lê fatos comerciais da mensagem. Percentual perto de "comissão"/"ganho" nunca vira desconto. */
export function parseFacts(raw: string): OfferFacts {
  const text = raw.replace(/[*_~]/g, "");
  const lines = text.split(/\r?\n/);
  const comLines = lines.filter((l) => /comiss|ganho|cashback|b[oô]nus/i.test(l));
  const plain = lines.filter((l) => !comLines.includes(l)).join("\n");

  // preços (ignorando linhas de comissão/ganhos)
  let price: number | null = null;
  let prev: number | null = null;
  const de = new RegExp(String.raw`de\s*:?\s*${MONEY}[\s\S]{0,40}?por\s*:?\s*${MONEY}`, "i").exec(
    plain,
  );
  if (de) {
    prev = reaisToCents(de[1]!);
    price = reaisToCents(de[2]!);
  } else {
    const all = [...plain.matchAll(PRICE_RE)]
      .map((m) => reaisToCents(m[1]!))
      .filter((n): n is number => n != null);
    if (all.length === 1) price = all[0]!;
    else if (all.length >= 2) {
      price = Math.min(all[0]!, all[1]!);
      prev = Math.max(all[0]!, all[1]!);
    }
  }
  if (prev != null && price != null && prev <= price) prev = null;

  let commissionPct: number | null = null;
  let extraCommissionPct: number | null = null;
  let extraEarningsCents: number | null = null;
  for (const l of comLines) {
    const pct = /(\d{1,2}(?:[.,]\d{1,2})?)\s*%/.exec(l);
    const money = new RegExp(MONEY, "i").exec(l);
    const extra = /extra|ganhos?|b[oô]nus|cashback|adicional/i.test(l);
    if (extra) {
      if (pct && extraCommissionPct == null) extraCommissionPct = num(pct[1]!);
      if (money && extraEarningsCents == null) extraEarningsCents = reaisToCents(money[1]!);
    } else if (pct && commissionPct == null) commissionPct = num(pct[1]!);
  }

  const d =
    /(\d{1,2})\s*%\s*(?:off|de\s+desconto|desconto)/i.exec(plain) ??
    /desconto\s*(?:de)?\s*:?\s*(\d{1,2})\s*%/i.exec(plain) ??
    /\((\d{1,2})\s*%\)/.exec(plain) ??
    /-\s?(\d{1,2})\s*%/.exec(plain);
  const c = /cupom\s*:?\s*([A-Z0-9]{4,20})\b/i.exec(text);
  const s = /\+?\s?(\d+(?:[.,]\d+)?)\s*(mil)?\s*(?:vendidos|vendas)/i.exec(text);
  const sales = s ? Math.round(num(s[1]!.replace(/\.(?=\d{3}\b)/, "")) * (s[2] ? 1000 : 1)) : null;
  const r =
    /(?:nota|avalia[çc][aã]o|avaliado(?:\s+em)?)\s*:?\s*([0-5](?:[.,]\d)?)/i.exec(text) ??
    /([0-5][.,]\d)\s*(?:★|⭐|estrelas)/.exec(raw);
  const rating = r ? num(r[1]!) : null;
  return {
    priceCents: price,
    previousPriceCents: prev,
    discountPct: d ? Number(d[1]) : null,
    commissionPct,
    extraCommissionPct,
    extraEarningsCents,
    coupon: c ? c[1]!.toUpperCase() : null,
    sales,
    rating: rating != null && rating <= 5 ? rating : null,
    bestSeller: /mais\s+vendid[oa]/i.test(text),
    mostSearched: /mais\s+(buscad|procurad|pesquisad)[oa]/i.test(text),
  };
}

/**
 * Separa o texto colado em ofertas: cada link fica com o texto escrito desde o link anterior
 * (mensagens com o link no fim, o mais comum). Texto depois do último link vai para ele.
 */
export function splitOffers(text: string): OfferBlock[] {
  const matches = [...text.matchAll(URL_RE)];
  const out: OfferBlock[] = [];
  const seen = new Set<string>();
  let cursor = 0;
  matches.forEach((m, i) => {
    const start = m.index ?? 0;
    const url = cleanUrl(m[0], text.slice(Math.max(0, start - 1), start));
    let context = text.slice(cursor, start);
    cursor = start + m[0].length;
    if (i === matches.length - 1) context += "\n" + text.slice(cursor);
    else {
      const rest = text.slice(cursor);
      const nl = rest.indexOf("\n");
      const sameLine = nl === -1 ? rest : rest.slice(0, nl);
      if (!/https?:\/\//i.test(sameLine)) {
        context += sameLine;
        cursor += sameLine.length;
      }
    }
    context = context.trim().slice(0, 2000);
    if (seen.has(url)) return;
    seen.add(url);
    out.push({ url, context, name: guessName(context), ...parseFacts(context) });
  });
  return out;
}

/** Identificador do produto na loja, lido do endereço (resolvido ou original) — só para achar duplicados. */
export function externalIdFromUrl(url: string): string | null {
  let u = url;
  try {
    u = decodeURIComponent(url);
  } catch {
    /* mantém */
  }
  const ml = /\bMLB-?(\d{6,})/i.exec(u);
  if (ml) return `MLB${ml[1]}`;
  const sp = /-i\.(\d+)\.(\d+)/.exec(u) ?? /\/product\/(\d+)\/(\d+)/.exec(u);
  if (sp) return `${sp[1]}:${sp[2]}`;
  const az = /\/(?:dp|gp\/product)\/([A-Z0-9]{10})/.exec(u);
  if (az) return az[1]!;
  return null;
}

/** Selos de destaque citados na mensagem (para o Radar). */
export const signalsOf = (f: OfferFacts) =>
  [f.bestSeller && "mais_vendido", f.mostSearched && "mais_buscado"].filter(
    (x): x is string => !!x,
  );
