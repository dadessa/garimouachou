import type { EventType } from "./event-rules";

type Extra = { slug?: string; channel?: "whatsapp" | "nativo" | "copiar" };
const SID = "ga_sid";
const UTM = "ga_utm";
const REF = "ga_ref";

/** Código anônimo da visita (some ao fechar a aba). Não identifica a pessoa. */
function sessionId(): string {
  let id = sessionStorage.getItem(SID);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(SID, id);
  }
  return id;
}

/** Guarda a campanha (UTM) e a origem da primeira página da visita. */
function attribution() {
  if (!sessionStorage.getItem(UTM)) {
    const q = new URLSearchParams(location.search);
    const utm = {
      source: q.get("utm_source") ?? undefined,
      medium: q.get("utm_medium") ?? undefined,
      campaign: q.get("utm_campaign") ?? undefined,
      content: q.get("utm_content") ?? undefined,
      term: q.get("utm_term") ?? undefined,
    };
    sessionStorage.setItem(UTM, JSON.stringify(utm));
    sessionStorage.setItem(REF, document.referrer || "");
  }
  return {
    utm: JSON.parse(sessionStorage.getItem(UTM) ?? "{}"),
    ref: sessionStorage.getItem(REF) || undefined,
  };
}

/** Registra um evento sem atrasar nem impedir o visitante. Falhas são ignoradas. */
export function track(type: EventType, extra: Extra = {}) {
  try {
    if (typeof window === "undefined" || location.pathname.startsWith("/admin")) return;
    const body = JSON.stringify({
      type,
      sid: sessionId(),
      path: location.pathname,
      ...attribution(),
      ...extra,
    });
    const blob = new Blob([body], { type: "application/json" });
    if (!navigator.sendBeacon?.("/api/public/track", blob)) {
      fetch("/api/public/track", {
        method: "POST",
        body,
        keepalive: true,
        headers: { "content-type": "application/json" },
      }).catch(() => {});
    }
  } catch {
    /* nunca atrapalha a navegação */
  }
}
