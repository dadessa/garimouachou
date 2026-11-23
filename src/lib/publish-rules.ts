import { isAllowedAffiliateUrl } from "@/lib/marketplaces/types";

export interface PublishInput {
  name: string;
  mainImageUrl: string | null;
  mainImageAlt: string;
  category: { isActive: boolean } | null;
  marketplace: { isActive: boolean; name: string; allowedDomains: string[] } | null;
  affiliateUrl: string;
}

/** Mesmas regras do gatilho do banco: lista o que falta para publicar (vazia = pode publicar). */
export function publishMissing(p: PublishInput): string[] {
  const out: string[] = [];
  if (!p.name.trim()) out.push("Nome do produto");
  if (!p.mainImageUrl) out.push("Imagem principal");
  if (!p.mainImageAlt.trim()) out.push("Texto alternativo da imagem");
  if (!p.category) out.push("Categoria");
  else if (!p.category.isActive) out.push("Categoria ativa (a escolhida está desativada)");
  if (!p.marketplace) out.push("Marketplace");
  else if (!p.marketplace.isActive) out.push("Marketplace ativo (o escolhido está desativado)");
  if (p.marketplace && !isAllowedAffiliateUrl(p.affiliateUrl, p.marketplace.allowedDomains)) {
    out.push(`Link de afiliado https de um domínio permitido de ${p.marketplace.name}`);
  }
  return out;
}

/** Converte "R$ 1.234,56" / "1234,56" / "1234.56" em centavos. Vazio = null; inválido = NaN. */
export function parseReais(v: string): number | null {
  const t = v.replace(/[R$\s]/g, "");
  if (!t) return null;
  const norm = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  if (!/^\d+(\.\d{1,2})?$/.test(norm)) return Number.NaN;
  return Math.round(Number(norm) * 100);
}

export const slugify = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100);
