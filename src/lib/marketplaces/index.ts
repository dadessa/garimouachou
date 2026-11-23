import { amazon } from "./amazon";
import { magalu } from "./magalu";
import { mercadolivre } from "./mercadolivre";
import { shopee } from "./shopee";

export const marketplaces = [amazon, shopee, mercadolivre, magalu];
export const getMarketplace = (slug: string) => marketplaces.find((m) => m.slug === slug);
export * from "./types";
