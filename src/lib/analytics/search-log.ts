import { supabase } from "@/integrations/supabase/client";

/** Termo de busca limpo, sem dados pessoais (e-mail ou números longos são descartados). LGPD. */
export function cleanTerm(q: string): string | null {
  const t = q.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
  if (t.length < 2 || t.length > 60 || t.includes("@") || /\d{6,}/.test(t)) return null;
  return t;
}

/** Conta a busca uma vez por termo por sessão; só o termo e o dia são guardados. */
export function logSearch(q: string) {
  const t = cleanTerm(q);
  if (!t || typeof sessionStorage === "undefined") return;
  const key = `ga_s_${t}`;
  if (sessionStorage.getItem(key)) return;
  sessionStorage.setItem(key, "1");
  void supabase.rpc("log_search", { _term: t }).then(({ error }) => {
    if (error) console.warn("busca não registrada");
  });
}
