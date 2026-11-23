// eslint-disable-next-line no-control-regex -- rejeita caracteres de controle de propósito
const UNSAFE = /[\\\u0000-\u001f\u007f]/;
export function oauthReturnPath(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    UNSAFE.test(value)
  )
    return "/";
  const origin = "https://app.invalid";
  try {
    const target = new URL(value, origin);
    if (target.origin !== origin || target.pathname.startsWith("//")) return "/";
    return target.pathname + target.search + target.hash;
  } catch {
    return "/";
  }
}
