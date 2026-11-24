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
export const isSafeUrl = (url: string, hosts: string[]) =>
  matchAffiliateDomain(url, hosts) !== null;

/** Endereço IP privado, local, reservado ou de metadados de nuvem (bloqueado). */
export function isPrivateIp(ip: string): boolean {
  const v = ip.toLowerCase();
  if (v.includes(":")) {
    return (
      v === "::1" ||
      v === "::" ||
      /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(v) ||
      v.startsWith("::ffff:") ||
      v.startsWith("64:ff9b")
    );
  }
  const p = v.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !(n >= 0 && n <= 255))) return true;
  const [a, b] = p as [number, number, number, number];
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19))
  );
}

/** Confere (DNS sobre HTTPS) que o domínio só aponta para IPs públicos antes de conectar. */
const DOH = ["https://cloudflare-dns.com/dns-query", "https://dns.google/resolve"];

/** null = nenhum serviço de verificação respondeu (diferente de "endereço privado"). */
export async function resolvesPublic(host: string): Promise<boolean | null> {
  for (const base of DOH) {
    try {
      const ips: string[] = [];
      for (const type of ["A", "AAAA"]) {
        const r = await fetch(`${base}?name=${encodeURIComponent(host)}&type=${type}`, {
          headers: { accept: "application/dns-json" },
          signal: AbortSignal.timeout(4000),
        });
        if (!r.ok) throw new Error("doh");
        const j = (await r.json()) as { Answer?: { type: number; data: string }[] };
        for (const a of j.Answer ?? []) if (a.type === 1 || a.type === 28) ips.push(a.data);
      }
      return ips.length > 0 && ips.every((ip) => !isPrivateIp(ip));
    } catch {
      // tenta o próximo serviço
    }
  }
  return null;
}

/** Confere pelos primeiros bytes que o arquivo é mesmo JPG, PNG ou WebP (não confia só no cabeçalho). */
export function sniffImage(b: Uint8Array): string | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (
    b[0] === 0x52 &&
    b[1] === 0x49 &&
    b[2] === 0x46 &&
    b[3] === 0x46 &&
    b[8] === 0x57 &&
    b[9] === 0x45 &&
    b[10] === 0x42 &&
    b[11] === 0x50
  )
    return "image/webp";
  return null;
}

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
    images: [
      ...html.matchAll(
        /<meta[^>]+(?:property|name)=["']og:image(?::secure_url)?["'][^>]*content=["']([^"']+)["']|<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']og:image(?::secure_url)?["']/gi,
      ),
    ]
      .map((m) => decode((m[1] ?? m[2] ?? "").trim()))
      .filter((u, i, a) => u && a.indexOf(u) === i)
      .slice(0, 6),
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
    if (!isSafeUrl(current, hosts))
      return { error: "Endereço fora das lojas permitidas.", url: current };
    const pub = await resolvesPublic(new URL(current).hostname);
    if (pub === null)
      return {
        error: "Verificação de segurança do endereço indisponível agora. Tente de novo.",
        url: current,
      };
    if (!pub) return { error: "Endereço não aponta para um servidor público.", url: current };
    const res = await fetch(current, {
      redirect: "manual",
      credentials: "omit",
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
