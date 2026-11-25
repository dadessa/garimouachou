/** Endereço oficial do site. */
export const SITE_URL = "https://garimouachou.com.br";
/** Torna absoluto um endereço do site (ex.: /img/...), necessário para prévias no WhatsApp/redes. */
export const absoluteUrl = (u: string | null | undefined) =>
  !u ? null : u.startsWith("https://") ? u : u.startsWith("/") ? `${SITE_URL}${u}` : null;

/** Instagram oficial (endereço completo https://www.instagram.com/...). Vazio = link escondido no site. */
export const INSTAGRAM_URL = "https://www.instagram.com/garimouachouoficial";
/** Nome de usuário exibido no site. */
export const INSTAGRAM_HANDLE = "@garimouachouoficial";
