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
export type Mode = "oportunidades" | "tendencia" | "comissao" | "baratos" | "comparar";

export const MODE_SEARCH: Record<Mode, { sort: string; priceMax?: number }> = {
  oportunidades: { sort: "discount_desc" },
  tendencia: { sort: "sales_desc" },
  comissao: { sort: "commission_desc" },
  baratos: { sort: "sales_desc", priceMax: 100 },
  comparar: { sort: "relevance" },
};

export const PRESET_MODE: Record<string, Mode> = {
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
  if (!it.title || !it.url) return null;
  const price =
    typeof it.price_number === "number" && it.price_number > 0
      ? Math.round(it.price_number * 100)
      : null;
  const disc =
    typeof it.discount_percent === "number" && it.discount_percent > 0 ? it.discount_percent : null;
  const comm =
    typeof it.commission_rate === "number" && it.commission_rate > 0
      ? Math.round(it.commission_rate * 10000) / 100
      : null;
  const aff =
    monetized && it.affiliate_url && it.affiliate_url !== it.url ? it.affiliate_url : null;
  return {
    marketplace_slug: (it.site ?? "outro").toLowerCase(),
    external_id: it.url,
    name: it.title.slice(0, 200),
    image_url: it.image_url && /^https:\/\//.test(it.image_url) ? it.image_url : null,
    affiliate_url: aff,
    price_cents: price,
    original_price_cents: price != null && disc ? Math.round(price / (1 - disc / 100)) : null,
    discount_pct: disc,
    commission_rate: comm,
    sales: typeof it.sales === "number" ? it.sales : null,
    rating: typeof it.rating === "number" ? Math.round(it.rating * 10) / 10 : null,
    signals: monetized ? [] : ["sem_comissao_na_conta"],
    source: "mcp_afiliado",
    fetched_at: now.toISOString(),
    valid_until: new Date(now.getTime() + AF_VALID_HOURS * 36e5).toISOString(),
  };
}
