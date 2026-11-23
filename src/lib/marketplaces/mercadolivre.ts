import type { MarketplaceAdapter } from "./types";

export const mercadolivre: MarketplaceAdapter = {
  slug: "mercadolivre",
  name: "Mercado Livre",
  allowedDomains: ["mercadolivre.com.br", "mercadolivre.com"],
  allowManualPrice: true,
  priceMaxAgeHours: 24,
  integrationStatus: "manual",
};
