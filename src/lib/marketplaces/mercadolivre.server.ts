/** Mercado Livre: token de aplicativo (client_credentials) pela API oficial. */
export function mercadolivreConfigured() {
  return !!process.env["MERCADOLIVRE_CLIENT_ID"] && !!process.env["MERCADOLIVRE_CLIENT_SECRET"];
}

export async function mercadolivreAppToken() {
  const id = process.env["MERCADOLIVRE_CLIENT_ID"];
  const secret = process.env["MERCADOLIVRE_CLIENT_SECRET"];
  if (!id || !secret) throw new Error("Mercado Livre não configurado.");
  const res = await fetch("https://api.mercadolibre.com/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: id,
      client_secret: secret,
    }),
  });
  const body = (await res.json().catch(() => null)) as {
    access_token?: string;
    message?: string;
  } | null;
  if (!res.ok || !body?.access_token)
    throw new Error(`Mercado Livre [${res.status}]: ${body?.message ?? "resposta inválida"}`);
  return body.access_token;
}
