import type { MarketplaceAdapter } from "./types";

export const shopee: MarketplaceAdapter = {
  slug: "shopee",
  name: "Shopee",
  allowedDomains: ["shopee.com.br", "s.shopee.com.br"],
  allowManualPrice: true,
  priceMaxAgeHours: 24,
  integrationStatus: "manual",
};
