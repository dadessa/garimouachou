import type { MarketplaceAdapter } from "./types";

export const magalu: MarketplaceAdapter = {
  slug: "magalu",
  name: "Magalu",
  allowedDomains: ["magazineluiza.com.br", "magazinevoce.com.br"],
  allowManualPrice: true,
  priceMaxAgeHours: 24,
  integrationStatus: "manual",
};
