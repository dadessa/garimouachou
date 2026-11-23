/** DADOS DE EXEMPLO LOCAIS (Etapa 1). Fictícios, sem preço e sem link. Removidos na Etapa 2. */
import type { PriceInfo } from "./price";

export type CategoryIcon = "home" | "cpu" | "shirt" | "sparkles" | "box" | "gift" | "grid";

export interface Category { slug: string; name: string; icon: CategoryIcon; order: number; active: boolean }
export interface Product extends PriceInfo {
  slug: string;
  name: string;
  shortDescription: string;
  categorySlug: string;
  marketplaceSlug: string;
  affiliateUrl: string;
  imageAlt: string;
  isFeatured: boolean;
  isWeeklyPick: boolean;
  publishedAt: string;
}

export const categories: Category[] = [
  { slug: "casa-e-cozinha", name: "Casa e Cozinha", icon: "home", order: 1, active: true },
  { slug: "tecnologia", name: "Tecnologia", icon: "cpu", order: 2, active: true },
  { slug: "moda-e-acessorios", name: "Moda e Acessórios", icon: "shirt", order: 3, active: true },
  { slug: "beleza", name: "Beleza", icon: "sparkles", order: 4, active: true },
  { slug: "organizacao", name: "Organização", icon: "box", order: 5, active: true },
  { slug: "presentes", name: "Presentes", icon: "gift", order: 6, active: true },
  { slug: "outros", name: "Outros", icon: "grid", order: 7, active: true },
];

const mks = ["amazon", "shopee", "mercadolivre", "magalu"];
export const products: Product[] = Array.from({ length: 16 }, (_, i) => {
  const n = i + 1;
  const cat = categories[i % categories.length]!;
  return {
    slug: `produto-de-exemplo-${n}`,
    name: `Produto de exemplo ${n}`,
    shortDescription: "Descrição de exemplo para testar o layout. Este produto não existe e não tem preço nem link.",
    categorySlug: cat.slug,
    marketplaceSlug: mks[i % mks.length]!,
    affiliateUrl: "",
    imageAlt: `Imagem ilustrativa do produto de exemplo ${n}`,
    isFeatured: i % 4 === 1,
    isWeeklyPick: i % 3 === 0,
    publishedAt: new Date(Date.UTC(2026, 10, 20 - i)).toISOString(),
    currentPrice: null,
    previousPrice: null,
    priceCheckedAt: null,
    priceSource: "manual",
  };
});

export const activeCategories = () => categories.filter((c) => c.active).sort((a, b) => a.order - b.order);
export const getCategory = (slug: string) => activeCategories().find((c) => c.slug === slug);
export const publishedProducts = () =>
  products.filter((p) => getCategory(p.categorySlug)).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
export const getProduct = (slug: string) => publishedProducts().find((p) => p.slug === slug);

const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
export function searchProducts(q: string, cat?: string, mk?: string) {
  const t = norm(q.trim());
  return publishedProducts().filter(
    (p) =>
      (!t || norm(`${p.name} ${p.shortDescription}`).includes(t)) &&
      (!cat || p.categorySlug === cat) &&
      (!mk || p.marketplaceSlug === mk),
  );
}
