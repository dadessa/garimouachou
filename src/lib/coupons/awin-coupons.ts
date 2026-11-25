import { couponSchema, couponIssues, type Coupon } from "./rules";

const obj = (v: unknown) =>
  v && typeof v === "object" ? (v as Record<string, unknown>) : {};
const str = (v: unknown) => (typeof v === "string" ? v : "");
const utc = (v: unknown) => {
  const s = str(v);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?$/.test(s)) return "";
  const t = Date.parse(s.endsWith("Z") ? s : s + "Z");
  return Number.isFinite(t) ? new Date(t).toISOString() : "";
};

/** Campos documentados da API. Não deduz benefício numérico a partir de texto promocional. */
export function normalizeAwinCoupons(raw: unknown, publisherId: string, now = new Date()) {
  const envelope = obj(raw);
  const rows = Array.isArray(raw) ? raw : (envelope["promotions"] ?? envelope["offers"]);
  if (!Array.isArray(rows)) throw new Error("Resposta de cupons não reconhecida.");
  const coupons = new Map<string, Coupon>();
  let ignored = 0;
  for (const row of rows.slice(0, 200)) {
    const r = obj(row);
    const a = obj(r["advertiser"]);
    const v = obj(r["voucher"]);
    const regions = obj(r["regions"]);
    const brazil =
      regions["all"] === true ||
      (Array.isArray(regions["list"]) &&
        regions["list"].some((x: unknown) => obj(x)["countryCode"] === "BR"));
    if (
      r["type"] !== "voucher" ||
      a["joined"] !== true ||
      !brazil ||
      !Number.isSafeInteger(r["promotionId"]) ||
      v["exclusive"] === true
    ) {
      ignored++;
      continue;
    }
    const parsed = couponSchema.safeParse({
      id: "awin-" + r["promotionId"],
      source: "awin",
      merchant: str(a["name"]),
      marketplace: "",
      productSlug: "",
      title: str(r["title"]),
      code: str(v["code"]),
      terms: str(r["terms"]),
      kind: "other",
      amount: null,
      minimumCents: null,
      startsAt: utc(r["startDate"]),
      endsAt: utc(r["endDate"]),
      destination: str(r["url"]),
      affiliateUrl: str(r["urlTracking"]),
      advertiserId: a["id"],
      publisherId,
      approved: false,
    });
    if (!parsed.success) {
      ignored++;
      continue;
    }
    try {
      if (couponIssues(parsed.data, now).length) {
        ignored++;
        continue;
      }
      coupons.set(parsed.data.id, parsed.data);
    } catch {
      ignored++;
    }
  }
  return { coupons: [...coupons.values()], ignored, received: rows.length };
}
