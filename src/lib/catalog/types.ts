import type { MarketplaceAdapter } from "@/lib/marketplaces/types";
import type { PriceInfo } from "@/lib/price";

export type CategoryIcon = "home" | "cpu" | "shirt" | "sparkles" | "box" | "gift" | "grid";
export const CATEGORY_ICONS: CategoryIcon[] = [
  "home",
  "cpu",
  "shirt",
  "sparkles",
  "box",
  "gift",
  "grid",
];
export const asIcon = (v: string): CategoryIcon =>
  CATEGORY_ICONS.includes(v as CategoryIcon) ? (v as CategoryIcon) : "grid";

export interface Category {
  slug: string;
  name: string;
  icon: CategoryIcon;
}
export interface Marketplace extends MarketplaceAdapter {
  id?: string;
}

export interface Product extends PriceInfo {
  slug: string;
  name: string;
  shortDescription: string;
  categorySlug: string;
  categoryName: string;
  marketplace: Marketplace;
  affiliateUrl: string;
  imageUrl: string | null;
  imageAlt: string;
  isFeatured: boolean;
  isWeeklyPick: boolean;
  publishedAt: string | null;
}

export interface Banner {
  id: string;
  image: string;
  mobileImage?: string;
  alt: string;
  link?: string;
}

/** Linha de marketplace do banco -> adaptador usado pelas regras de preço e de link. */
export interface MarketplaceRow {
  id?: string;
  slug: string;
  name: string;
  allowed_domains: string[];
  allow_manual_price: boolean;
  price_max_age_hours: number;
  integration_status: "manual" | "planned" | "active";
}
export const toMarketplace = (m: MarketplaceRow): Marketplace => ({
  ...(m.id ? { id: m.id } : {}),
  slug: m.slug,
  name: m.name,
  allowedDomains: m.allowed_domains,
  allowManualPrice: m.allow_manual_price,
  priceMaxAgeHours: m.price_max_age_hours,
  integrationStatus: m.integration_status,
});

export interface ProductRow {
  slug: string;
  name: string;
  short_description: string;
  affiliate_url: string;
  main_image_url: string | null;
  main_image_alt: string | null;
  current_price_cents: number | null;
  previous_price_cents: number | null;
  price_checked_at: string | null;
  price_source: "manual" | "api";
  is_featured: boolean;
  is_weekly_pick: boolean;
  published_at: string | null;
  categories: { slug: string; name: string } | null;
  marketplaces: MarketplaceRow | null;
}
export const PRODUCT_SELECT =
  "slug,name,short_description,affiliate_url,main_image_url,main_image_alt,current_price_cents,previous_price_cents,price_checked_at,price_source,is_featured,is_weekly_pick,published_at,categories!inner(slug,name),marketplaces!inner(slug,name,allowed_domains,allow_manual_price,price_max_age_hours,integration_status)";

export function toProduct(r: ProductRow): Product | null {
  if (!r.categories || !r.marketplaces) return null;
  return {
    slug: r.slug,
    name: r.name,
    shortDescription: r.short_description,
    categorySlug: r.categories.slug,
    categoryName: r.categories.name,
    marketplace: toMarketplace(r.marketplaces),
    affiliateUrl: r.affiliate_url,
    imageUrl: r.main_image_url,
    imageAlt: r.main_image_alt ?? r.name,
    isFeatured: r.is_featured,
    isWeeklyPick: r.is_weekly_pick,
    publishedAt: r.published_at,
    currentPrice: r.current_price_cents,
    previousPrice: r.previous_price_cents,
    priceCheckedAt: r.price_checked_at,
    priceSource: r.price_source,
  };
}
