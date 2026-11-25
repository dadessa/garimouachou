import { z } from "zod";
import { getMarketplace } from "@/lib/marketplaces";
import { matchAffiliateDomain } from "@/lib/marketplaces/types";
import { verifiedAwinLink } from "@/lib/integrations/awin";

const date = z.string().datetime({ offset: true });
export const couponSchema = z.object({
  id: z.string().min(1).max(100),
  source: z.enum(["awin", "manual"]),
  merchant: z.string().trim().min(1).max(160),
  marketplace: z.string().max(60),
  productSlug: z
    .string()
    .max(120)
    .regex(/^[a-z0-9-]*$/),
  title: z.string().trim().min(1).max(300),
  code: z.string().trim().min(1).max(100),
  terms: z.string().trim().min(1).max(10000),
  kind: z.enum(["percent", "fixed", "shipping", "other"]),
  amount: z.number().finite().positive().nullable(),
  minimumCents: z.number().int().nonnegative().nullable(),
  startsAt: date,
  endsAt: date,
  destination: z.string().max(2000),
  affiliateUrl: z.string().min(1).max(4000),
  advertiserId: z.number().int().positive().nullable(),
  publisherId: z
    .string()
    .regex(/^\d{1,15}$/)
    .nullable(),
  approved: z.boolean(),
});

export type Coupon = z.infer<typeof couponSchema>;

function safeDestination(raw: string) {
  try {
    return !!matchAffiliateDomain(raw, [new URL(raw).hostname]);
  } catch {
    return false;
  }
}

export function couponIssues(c: Coupon, now = new Date()) {
  const issues: string[] = [];
  const start = Date.parse(c.startsAt);
  const end = Date.parse(c.endsAt);
  if (!(start < end)) issues.push("Período inválido");
  if (!(start <= now.getTime() && now.getTime() < end)) issues.push("Fora da validade");
  if (c.kind === "percent" && !(c.amount !== null && c.amount <= 100)) {
    issues.push("Percentual inválido");
  }
  if (c.kind === "fixed" && !(c.amount !== null && Number.isSafeInteger(c.amount))) {
    issues.push("Valor fixo em centavos inválido");
  }
  if (["shipping", "other"].includes(c.kind) && c.amount !== null) {
    issues.push("Tipo não admite valor numérico");
  }
  const mk = getMarketplace(c.marketplace);
  if (c.productSlug && !mk) issues.push("Produto exige marketplace cadastrado");
  if (c.marketplace && !mk) issues.push("Marketplace inválido");
  if (c.source === "awin") {
    if (
      !c.publisherId ||
      !c.advertiserId ||
      !safeDestination(c.destination) ||
      !verifiedAwinLink(c.affiliateUrl, c.publisherId, c.advertiserId, c.destination)
    ) {
      issues.push("Link Awin não verificável");
    }
    if (mk && !matchAffiliateDomain(c.destination, mk.allowedDomains)) {
      issues.push("Destino não corresponde ao marketplace");
    }
  } else if (
    !mk ||
    !matchAffiliateDomain(c.affiliateUrl, mk.allowedDomains) ||
    !matchAffiliateDomain(c.destination, mk.allowedDomains)
  ) {
    issues.push("Domínio de loja não autorizado");
  }
  return issues;
}

export function activeCoupons(rows: unknown[], now = new Date()): Coupon[] {
  const result = new Map<string, Coupon>();
  for (const row of rows) {
    const parsed = couponSchema.safeParse(row);
    if (!parsed.success || !parsed.data.approved) continue;
    const c = parsed.data;
    try {
      if (couponIssues(c, now).length) continue;
      const key = [c.source, c.merchant.toLowerCase(), c.code, c.productSlug].join("|");
      if (!result.has(key)) result.set(key, c);
    } catch {
      // URL malformada: não divulgar.
    }
  }
  return [...result.values()].sort((a, b) => a.endsAt.localeCompare(b.endsAt));
}
