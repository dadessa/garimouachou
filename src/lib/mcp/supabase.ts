import { createClient } from "@supabase/supabase-js";

type RuntimeGlobals = typeof globalThis & {
  process?: { env?: Record<string, string | undefined> };
};

function env(names: readonly string[]): string | undefined {
  const e = (globalThis as RuntimeGlobals).process?.env;
  for (const n of names) {
    const v = e?.[n]?.trim();
    if (v) return v;
  }
  return undefined;
}

export function supabaseAnon() {
  const url = env(["SUPABASE_URL", "VITE_SUPABASE_URL"]);
  const key = env([
    "SUPABASE_PUBLISHABLE_KEY",
    "VITE_SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_ANON_KEY",
  ]);
  if (!url || !key) throw new Error("Backend configuration missing");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export const SITE_URL = "https://garimouachou.lovable.app";
