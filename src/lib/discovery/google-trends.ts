/** Parser limitado ao RSS público do Google Trends; não resolve entidades nem carrega XML externo. */
export interface Trend {
  title: string;
  traffic: string | null;
  publishedAt: string;
}

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

function decode(value: string) {
  return value
    .replace(/^<!\[CDATA\[([\s\S]*?)\]\]>$/, "$1")
    .replace(/&(amp|lt|gt|quot|apos|#39|#x27);/g, (m, entity: string) => {
      const map: Record<string, string> = {
        amp: "&",
        lt: "<",
        gt: ">",
        quot: '"',
        apos: "'",
        "#39": "'",
        "#x27": "'",
      };
      return map[entity] ?? m;
    })
    .trim();
}

export function parseTrendsRss(xml: string, now = new Date()): Trend[] {
  if (!/<rss\b/i.test(xml) || /<!DOCTYPE|<!ENTITY/i.test(xml)) {
    throw new Error("Feed RSS inválido.");
  }
  const result: Trend[] = [];
  const seen = new Set<string>();
  const items = xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi);
  for (const match of items) {
    if (result.length >= 100) break;
    const body = match[1] ?? "";
    const title = decode(body.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? "");
    const date = body.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1] ?? "";
    const at = Date.parse(date);
    const age = now.getTime() - at;
    if (!title || title.length > 120 || /[<>\x00-\x1f]/.test(title)) continue;
    if (!(age >= -300_000 && age <= 48 * 36e5)) continue;
    const key = norm(title);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const raw = decode(body.match(/<ht:approx_traffic>([\s\S]*?)<\/ht:approx_traffic>/i)?.[1] ?? "");
    result.push({
      title,
      traffic: /^[\d.,]+\+?$/.test(raw) ? raw : null,
      publishedAt: new Date(at).toISOString(),
    });
  }
  return result;
}

// Mapeia apenas termos de produtos reconhecidos; não transforma nomes/notícias em ofertas.
const PRODUCT_TERMS: [RegExp, string][] = [
  [/\b(?:iphone|smartphone|celular|galaxy s\d+)\b/, "smartphone"],
  [/\b(?:air fryer|airfryer|fritadeira eletrica)\b/, "air fryer"],
  [/\b(?:smart tv|televisao|televisor)\b/, "smart tv"],
  [/\b(?:notebook|laptop|macbook)\b/, "notebook"],
  [/\b(?:fone bluetooth|headset|airpods)\b/, "fone bluetooth"],
  [/\b(?:smartwatch|apple watch|relogio inteligente)\b/, "smartwatch"],
  [/\b(?:playstation|ps5|xbox|nintendo switch)\b/, "console de videogame"],
  [/\b(?:ar condicionado|ventilador|climatizador)\b/, "ventilador"],
  [/\b(?:geladeira|refrigerador)\b/, "geladeira"],
  [/\b(?:maquina de lavar|lavadora)\b/, "máquina de lavar"],
  [/\b(?:perfume|perfumaria|colonia)\b/, "perfume"],
  [/\b(?:protetor solar|skincare)\b/, "protetor solar"],
  [/\b(?:tenis de corrida|tenis esportivo)\b/, "tênis esportivo"],
  [/\b(?:vestido|vestidos)\b/, "vestido"],
  [/\b(?:cafeteira|maquina de cafe)\b/, "cafeteira"],
  [/\b(?:aspirador robo|robo aspirador)\b/, "robô aspirador"],
];

const NON_COMMERCIAL =
  /\b(?:morte|morreu|acidente|incendio|crime|prisao|assassinato|fraude|golpe|recall|explosao|eleicao|politica|jogo|partida|placar|futebol|falecimento|roubo|roubado)\b/;

export function commercialKeywords(trends: Trend[], limit = 3): string[] {
  const keywords = new Set<string>();
  for (const t of trends) {
    const title = norm(t.title);
    if (NON_COMMERCIAL.test(title)) continue;
    const product = PRODUCT_TERMS.find(([pattern]) => pattern.test(title));
    if (product) keywords.add(product[1]);
    if (keywords.size >= limit) break;
  }
  return [...keywords];
}
