/** Regras compartilhadas para completar produtos a partir do que foi identificado pelo link. */

/** Sem nome ou sem foto, o produto só é salvo se a administradora pedir rascunho incompleto. */
export function needsExplicitDraft(missing: string[]): boolean {
  return missing.includes("nome") || missing.includes("foto");
}

export interface FoundData {
  name: string;
  imageUrl: string | null;
  categoryId: string | null;
  description: string;
  tags: string[];
  externalId: string | null;
}

export interface CurrentData {
  name: string | null;
  main_image_url: string | null;
  category_id: string | null;
  short_description: string | null;
  tags: string[] | null;
  external_id: string | null;
}

/** Só preenche o que está vazio; nunca troca o link de afiliada nem dados já preenchidos. */
export function emptyFieldPatch(cur: CurrentData, found: FoundData, mkSlug: (n: string) => string) {
  const p: Record<string, unknown> = {};
  const name = found.name.trim();
  if (!cur.name?.trim() && name) {
    p["name"] = name;
    p["slug"] = mkSlug(name);
  }
  const finalName = (cur.name?.trim() || name) as string;
  if (!cur.main_image_url && found.imageUrl) {
    p["main_image_url"] = found.imageUrl;
    p["main_image_alt"] = finalName || null;
  }
  if (!cur.category_id && found.categoryId) p["category_id"] = found.categoryId;
  if (!cur.short_description?.trim() && found.description.trim())
    p["short_description"] = found.description.trim();
  if (!(cur.tags ?? []).length && found.tags.length) p["tags"] = found.tags;
  if (!cur.external_id && found.externalId) p["external_id"] = found.externalId;
  return p;
}
