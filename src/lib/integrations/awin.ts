import { matchAffiliateDomain } from "@/lib/marketplaces/types";

export const AWIN_RELATIONSHIPS = [
  "joined",
  "pending",
  "suspended",
  "rejected",
  "notjoined",
] as const;
export type AwinRelationship = (typeof AWIN_RELATIONSHIPS)[number];

export interface AwinProgramme {
  id: number;
  name: string;
  status: string;
  linkStatus: string;
  domains: string[];
}

export function normalizeProgrammes(data: unknown): AwinProgramme[] {
  if (!Array.isArray(data)) throw new Error("Resposta inesperada da Awin.");
  const result: AwinProgramme[] = [];
  for (const item of data) {
    if (!item || typeof item !== "object") continue;
    const p = item as Record<string, unknown>;
    if (
      typeof p["id"] !== "number" ||
      !Number.isSafeInteger(p["id"]) ||
      p["id"] <= 0 ||
      typeof p["name"] !== "string"
    )
      continue;
    const domains = Array.isArray(p["validDomains"])
      ? p["validDomains"].flatMap((v: unknown) => {
          const raw = v && typeof v === "object" ? (v as Record<string, unknown>)["domain"] : null;
          if (typeof raw !== "string") return [];
          const domain = raw.trim().toLowerCase().replace(/\.$/, "");
          return /^(?:[a-z0-9-]+\.)+[a-z0-9-]+$/.test(domain) && !/^\d+(?:\.\d+){3}$/.test(domain)
            ? [domain]
            : [];
        })
      : [];
    result.push({
      id: p["id"],
      name: p["name"].slice(0, 160),
      status: typeof p["status"] === "string" ? p["status"].toLowerCase() : "",
      linkStatus: typeof p["linkStatus"] === "string" ? p["linkStatus"].toLowerCase() : "",
      domains: [...new Set(domains)],
    });
  }
  return result.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

export function canGenerateAwinLink(programme: AwinProgramme, url: string) {
  return (
    programme.status === "active" &&
    programme.linkStatus !== "offline" &&
    url.length <= 2000 &&
    !!matchAffiliateDomain(url, programme.domains)
  );
}

/** Apenas links retornados pela API oficial, vinculados à conta e ao anunciante selecionados. */
export function verifiedAwinLink(
  value: unknown,
  publisherId: string,
  advertiserId: number,
  destination: string,
) {
  if (typeof value !== "string" || !matchAffiliateDomain(value, ["awin1.com"])) return null;
  const u = new URL(value);
  if (
    u.pathname !== "/cread.php" ||
    u.searchParams.getAll("awinaffid").length !== 1 ||
    u.searchParams.getAll("awinmid").length !== 1 ||
    u.searchParams.getAll("ued").length !== 1 ||
    u.searchParams.get("awinaffid") !== publisherId ||
    u.searchParams.get("awinmid") !== String(advertiserId)
  )
    return null;
  try {
    if (new URL(u.searchParams.get("ued") ?? "").href !== new URL(destination).href) return null;
  } catch {
    return null;
  }
  return value;
}
