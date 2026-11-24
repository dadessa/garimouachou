import { productPageUrl } from "@/lib/share";

/** Canais prontos para links de divulgação. */
export const CAMPAIGN_CHANNELS = [
  { id: "instagram", label: "Instagram", source: "instagram", medium: "social" },
  { id: "whatsapp", label: "WhatsApp", source: "whatsapp", medium: "mensagem" },
  { id: "facebook", label: "Facebook", source: "facebook", medium: "social" },
  { id: "tiktok", label: "TikTok", source: "tiktok", medium: "social" },
] as const;

/** Deixa o nome da campanha em minúsculas, sem acentos nem espaços. */
export const utmSlug = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

/** Link da página do produto no site com UTM. Nunca altera o link de afiliado. */
export function campaignUrl(slug: string, o: { source: string; medium: string; campaign: string }) {
  const u = new URL(productPageUrl(slug));
  u.searchParams.set("utm_source", utmSlug(o.source) || "outro");
  u.searchParams.set("utm_medium", utmSlug(o.medium) || "outro");
  u.searchParams.set("utm_campaign", utmSlug(o.campaign) || slug);
  return u.toString();
}

/** Monta CSV (separado por ponto e vírgula, como o Excel em português espera). */
export function toCsv(rows: (string | number)[][]): string {
  const cell = (v: string | number) => {
    let s = String(v);
    if (/^[=+\-@]/.test(s)) s = `'${s}`;
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "\ufeff" + rows.map((r) => r.map(cell).join(";")).join("\n");
}

/** Taxa de cliques por visita, em %, com uma casa. Zero visitas = 0. */
export const clickRate = (clicks: number, visits: number) =>
  visits > 0 ? Math.round((clicks / visits) * 1000) / 10 : 0;
