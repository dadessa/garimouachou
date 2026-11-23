/** Interface comum de cada marketplace. Integrações de API futuras entram aqui, por módulo. */
export interface MarketplaceAdapter {
  slug: string;
  name: string;
  allowedDomains: string[];
  allowManualPrice: boolean;
  priceMaxAgeHours: number;
  integrationStatus: "manual" | "planned" | "active";
}

/** Valida URL de afiliado: só https, hostname exato ou subdomínio de um domínio permitido. */
export function isAllowedAffiliateUrl(raw: string, allowedDomains: string[]): boolean {
  if (/[\s\\]/.test(raw)) return false;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  if (url.username || url.password) return false;
  if (url.port && url.port !== "443") return false;
  const host = url.hostname.toLowerCase();
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(":") || host.startsWith("[")) return false;
  return allowedDomains.some((d) => host === d || host.endsWith(`.${d}`));
}
