import { matchAffiliateDomain } from "@/lib/marketplaces/types";

/** Servidores oficiais de imagens das lojas (CDNs). Fora desta lista, nenhuma imagem é baixada. */
export const IMAGE_HOSTS = [
  "mlstatic.com",
  "susercontent.com",
  "shopee.com.br",
  "media-amazon.com",
  "ssl-images-amazon.com",
  "mlcdn.com.br",
  "magazineluiza.com.br",
];
export const IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_PAGE_BYTES = 1024 * 1024;

/** Só https, porta padrão, sem IP/credenciais e com domínio na lista (proteção contra SSRF). */
export const isSafeUrl = (url: string, hosts: string[]) => matchAffiliateDomain(url, hosts) !== null;

/** Lê metadados públicos (Open Graph) de uma página de produto. */
export function readMeta(html: string) {
  const get = (k: string) => {
    const re = new RegExp(
      `<meta[^>]+(?:property|name)=["']${k}["'][^>]*content=["']([^"']*)["']|<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${k}["']`,
      "i",
    );
    const m = re.exec(html);
    return decode((m?.[1] ?? m?.[2] ?? "").trim()) || null;
  };
  return {
    title: get("og:title"),
    image: get("og:image:secure_url") ?? get("og:image"),
    description: get("og:description"),
    availability: get("product:availability") ?? get("og:availability"),
  };
}

function decode(s: string) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

/** Lê o corpo até um limite de bytes (evita respostas gigantes). */
export async function readCapped(res: Response, max: number): Promise<Uint8Array | null> {
  const reader = res.body?.getReader();
  if (!reader) return null;
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      return null;
    }
    parts.push(value);
  }
  const out = new Uint8Array(size);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.byteLength;
  }
  return out;
}

/**
 * Segue redirecionamentos (links encurtados) um a um, só entre domínios permitidos.
 * Sem cookies de sessão; timeout por pedido.
 */
export async function safeFetch(url: string, hosts: string[], accept: string, maxHops = 5) {
  let current = url;
  for (let hop = 0; hop <= maxHops; hop++) {
    if (!isSafeUrl(current, hosts)) return { error: "Endereço fora das lojas permitidas.", url: current };
    const res = await fetch(current, {
      redirect: "manual",
      headers: { accept, "user-agent": "GarimouAchouBot/1.0 (+https://garimouachou.lovable.app)" },
      signal: AbortSignal.timeout(8000),
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      await res.body?.cancel();
      if (!loc) return { error: "Redirecionamento sem destino.", url: current };
      current = new URL(loc, current).toString();
      continue;
    }
    return { res, url: current };
  }
  return { error: "Redirecionamentos demais.", url: current };
}
