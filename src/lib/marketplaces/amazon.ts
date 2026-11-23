import type { MarketplaceAdapter } from "./types";

export const amazon: MarketplaceAdapter = {
  slug: "amazon",
  name: "Amazon Brasil",
  allowedDomains: ["amazon.com.br", "amzn.to"],
  allowManualPrice: false,
  priceMaxAgeHours: 24,
  integrationStatus: "manual",
};
