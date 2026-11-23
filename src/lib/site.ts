/** Endereço oficial do site. Troque aqui quando o domínio próprio for conectado. */
export const SITE_URL = "https://garimouachou.lovable.app";
/** Torna absoluto um endereço do site (ex.: /img/...), necessário para prévias no WhatsApp/redes. */
export const absoluteUrl = (u: string | null | undefined) =>
  !u ? null : u.startsWith("https://") ? u : u.startsWith("/") ? `${SITE_URL}${u}` : null;

/** Instagram oficial (endereço completo https://www.instagram.com/...). Vazio = link escondido no site. */
export const INSTAGRAM_URL = "";
