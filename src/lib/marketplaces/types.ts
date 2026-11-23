/** Interface comum de cada marketplace. Integrações de API futuras entram aqui, por módulo. */
export interface MarketplaceAdapter {
  slug: string;
  name: string;
  allowedDomains: string[];
  allowManualPrice: boolean;
  priceMaxAgeHours: number;
  integrationStatus: "manual" | "planned" | "active";
}

/** Retorna o domínio permitido reconhecido na URL de afiliado, ou null se a URL não for aceita.
 *  Só https, hostname exato ou subdomínio; sem credenciais, IP ou porta não padrão. */
export function matchAffiliateDomain(raw: string, allowedDomains: string[]): string | null {
  if (/[\s\\]/.test(raw)) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  if (url.port && url.port !== "443") return null;
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(":") || host.startsWith("[")) return null;
  const doms = allowedDomains.map((d) => d.toLowerCase());
  return doms.find((d) => host === d) ?? doms.find((d) => host.endsWith(`.${d}`)) ?? null;
}

export const isAllowedAffiliateUrl = (raw: string, allowedDomains: string[]) => matchAffiliateDomain(raw, allowedDomains) !== null;
