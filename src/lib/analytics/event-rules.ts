import { z } from "zod";

/** Tipos de evento aceitos. Cliques não são vendas: nenhum evento representa compra ou comissão. */
export const EVENT_TYPES = [
  "page_view",
  "product_view",
  "offer_click",
  "share_click",
  "instagram_click",
  "banner_click",
  "category_click",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const SHARE_CHANNELS = ["whatsapp", "nativo", "copiar"] as const;

const short = (max: number) => z.string().trim().max(max).optional();

/** Formato aceito pelo servidor; qualquer outra coisa é descartada. */
export const trackSchema = z.object({
  type: z.enum(EVENT_TYPES),
  sid: z.string().regex(/^[a-zA-Z0-9-]{8,64}$/),
  path: z.string().max(300).regex(/^\//),
  slug: z
    .string()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    .max(120)
    .optional(),
  channel: z.enum(SHARE_CHANNELS).optional(),
  ref: short(200),
  utm: z
    .object({
      source: short(100),
      medium: short(100),
      campaign: short(100),
      content: short(100),
      term: short(100),
    })
    .optional(),
});
export type TrackInput = z.infer<typeof trackSchema>;

/** Eventos de produto precisam do produto. */
export const needsProduct = (t: EventType) =>
  t === "product_view" || t === "offer_click" || t === "share_click";

/** Janela em que o mesmo evento da mesma visita conta uma vez só (segundos). */
export const DEDUP_WINDOW_S: Record<EventType, number> = {
  page_view: 30 * 60,
  product_view: 30 * 60,
  offer_click: 10,
  share_click: 10,
  instagram_click: 10,
  banner_click: 10,
  category_click: 10,
};

export function dedupKey(e: TrackInput, nowMs: number): string {
  const bucket = Math.floor(nowMs / 1000 / DEDUP_WINDOW_S[e.type]);
  return [
    e.type,
    e.sid,
    e.slug ?? "",
    e.type === "page_view" ? e.path : "",
    e.channel ?? "",
    bucket,
  ].join("|");
}

/** Robôs e pré-visualizações de link não contam como visita. */
export const isBot = (ua: string | null) =>
  !ua ||
  /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|headless|lighthouse/i.test(ua);

/** Guarda só o domínio de quem indicou o site, nunca o endereço completo. Ignora o próprio site. */
export function referrerHost(ref: string | undefined, ownHost: string): string | null {
  if (!ref) return null;
  try {
    const h = new URL(ref).hostname.replace(/^www\./, "").toLowerCase();
    return h && h !== ownHost.replace(/^www\./, "").toLowerCase() ? h.slice(0, 100) : null;
  } catch {
    return null;
  }
}
