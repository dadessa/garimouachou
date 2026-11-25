/** Regras puras (testáveis) para ofertas vindas do MCP do Afiliado. */
export interface AfItem {
  title?: string;
  price_number?: number | null;
  image_url?: string | null;
  url?: string;
  affiliate_url?: string | null;
  commission_rate?: number | null;
  rating?: number | null;
  sales?: number | null;
  discount_percent?: number | null;
  site?: string;
}
export const AF_VALID_HOURS = 6;

/** Dados externos não são confiáveis: apenas URLs HTTPS sem credenciais ou porta alternativa. */
export function safeHttps(value: unknown): value is string {
  if (typeof value !== "string" || /[\s\\]/.test(value)) return false;
  try {
    const u = new URL(value);
    return u.protocol === "https:" && !!u.hostname && !u.username && !u.password && !u.port;
  } catch {
    return false;
  }
}

export function convertedAffiliateLink(
  original: string,
  affiliate: unknown,
  final: unknown,
): string | null {
  // Preferir o link de afiliada explícito (evita depender de encurtador adicional).
  for (const v of [affiliate, final]) if (safeHttps(v) && v !== original) return v;
  return null;
}
export type Mode = "oportunidades" | "tendencia" | "comissao" | "baratos" | "comparar";

export const MODE_SEARCH: Record<Mode, { sort: string; priceMax?: number }> = {
  oportunidades: { sort: "discount_desc" },
  tendencia: { sort: "sales_desc" },
  comissao: { sort: "commission_desc" },
  baratos: { sort: "sales_desc", priceMax: 100 },
  comparar: { sort: "relevance" },
};

export const PRESET_MODE: Record<string, Mode> = {
  "Garimpar agora": "oportunidades",
  "Encontrar melhores oportunidades de hoje": "oportunidades",
  "Encontrar produtos em tendência": "tendencia",
  "Encontrar produtos com maiores comissões": "comissao",
  "Encontrar produtos baratos com boa demanda": "baratos",
  "Comparar marketplaces": "comparar",
};

/** Palavras-chave padrão quando não há categorias prioritárias configuradas. */
export const DEFAULT_KEYWORDS = [
  "fone bluetooth",
  "smartwatch",
  "air fryer",
  "teclado gamer",
  "caixa de som bluetooth",
];

/**
 * Converte item em linha do Radar. Só grava link de afiliada quando a loja é monetizada
 * pela conta (link convertido); catálogo público fica sem link de afiliada e não pode ser publicado.
 */
export function afToRow(it: AfItem, monetized: boolean, now = new Date()) {
  if (typeof it.title !== "string" || !it.title.trim() || !safeHttps(it.url)) return null;
  const price =
    typeof it.price_number === "number" &&
    Number.isFinite(it.price_number) &&
    it.price_number >= 0.01 &&
    it.price_number <= 21_474_836.47
      ? Math.round(it.price_number * 100)
      : null;
  const disc =
    typeof it.discount_percent === "number" && it.discount_percent > 0 && it.discount_percent < 100
      ? it.discount_percent
      : null;
  const comm =
    monetized &&
    typeof it.commission_rate === "number" &&
    it.commission_rate > 0 &&
    it.commission_rate <= 1
      ? Math.round(it.commission_rate * 10000) / 100
      : null;
  const aff = monetized ? convertedAffiliateLink(it.url, it.affiliate_url, null) : null;
  return {
    marketplace_slug: (it.site ?? "outro").toLowerCase(),
    external_id: it.url,
    name: it.title.trim().slice(0, 200),
    image_url: safeHttps(it.image_url) ? it.image_url : null,
    affiliate_url: aff,
    price_cents: price,
    // Desconto percentual arredondado não comprova o preço anterior.
    original_price_cents: null,
    discount_pct: disc,
    commission_rate: comm,
    sales:
      typeof it.sales === "number" &&
      Number.isSafeInteger(it.sales) &&
      it.sales >= 0 &&
      it.sales <= 2_147_483_647
        ? it.sales
        : null,
    rating:
      typeof it.rating === "number" && it.rating >= 0 && it.rating <= 5
        ? Math.round(it.rating * 10) / 10
        : null,
    signals: monetized ? [] : ["sem_comissao_na_conta"],
    source: "mcp_afiliado",
    fetched_at: now.toISOString(),
    valid_until: new Date(now.getTime() + AF_VALID_HOURS * 36e5).toISOString(),
  };
}
