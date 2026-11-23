import type { MarketplaceAdapter } from "./marketplaces/types";

export interface PriceInfo {
  currentPrice?: number | null; // centavos
  previousPrice?: number | null;
  priceCheckedAt?: string | null;
  priceSource?: "manual" | "api";
}

/** Retorna o preço exibível ou null. Nunca exibe preço vencido, manual proibido ou inexistente. */
export function displayablePrice(p: PriceInfo, mk: MarketplaceAdapter, now = new Date()) {
  if (p.currentPrice == null || !p.priceCheckedAt) return null;
  if (p.priceSource !== "api" && !mk.allowManualPrice) return null;
  const ageH = (now.getTime() - new Date(p.priceCheckedAt).getTime()) / 36e5;
  if (ageH < 0 || ageH > mk.priceMaxAgeHours) return null;
  const previous = p.previousPrice != null && p.previousPrice > p.currentPrice ? p.previousPrice : null;
  return { current: p.currentPrice, previous, checkedAt: new Date(p.priceCheckedAt) };
}

export const formatBRL = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
