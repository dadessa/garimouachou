import { supabase } from "@/integrations/supabase/client";
import { importOneWith, type ImportResult } from "./importer-core";
import type { ImportDraft } from "./rules";

export type { ImportResult };

/** Importação pelo painel (navegador): mesma regra do servidor. */
export function importOne(
  d: ImportDraft,
  ...rest: Parameters<typeof importOneWith> extends [unknown, unknown, ...infer R] ? R : never
) {
  return importOneWith(supabase, d, ...rest);
}
