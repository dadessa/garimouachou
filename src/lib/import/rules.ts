import { matchAffiliateDomain } from "@/lib/marketplaces/types";
import { slugify } from "@/lib/publish-rules";

/** Dados de um produto a importar — só o que veio de verdade (link, planilha ou API oficial). */
export interface ImportDraft {
  affiliateUrl: string;
  name: string;
  description: string;
  tags: string[];
  categoryId: string | null;
  priceCents: number | null;
  previousPriceCents: number | null;
  /** Data real da consulta do preço (API/Radar). Nunca a data do cadastro. */
  priceCheckedAt: string | null;
  imageUrl: string | null;
  imageAlt: string;
  externalId: string | null;
  fromApi: boolean;
}

export const emptyDraft = (affiliateUrl: string): ImportDraft => ({
  affiliateUrl: affiliateUrl.trim(),
  name: "",
  description: "",
  tags: [],
  categoryId: null,
  priceCents: null,
  previousPriceCents: null,
  priceCheckedAt: null,
  imageUrl: null,
  imageAlt: "",
  externalId: null,
  fromApi: false,
});

export const MAX_BATCH = 50;

/** Um link por linha; ignora vazios e repetidos, mantém o link exatamente como colado. */
export function parseLinkList(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

/** Descobre a loja pelo domínio do link; null quando o domínio não é de nenhuma loja cadastrada. */
export function detectMarketplace<M extends { allowed_domains: string[] }>(
  url: string,
  mks: M[],
): M | null {
  return mks.find((m) => matchAffiliateDomain(url, m.allowed_domains)) ?? null;
}

/** Lê CSV com vírgula ou ponto e vírgula, aspas e cabeçalho; chaves em minúsculas sem acento. */
export function parseCsv(text: string): Record<string, string>[] {
  const src = text.replace(/^\uFEFF/, "");
  const first = src.split(/\r?\n/, 1)[0] ?? "";
  const sep = (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (q) {
      if (c === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === sep) {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  const [head, ...body] = rows.filter((r) => r.some((v) => v.trim()));
  if (!head) return [];
  const keys = head.map((h) =>
    h
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase(),
  );
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? "").trim()])));
}

export const CSV_COLUMNS = ["link", "nome", "categoria", "descricao", "etiquetas"] as const;

/** Converte uma linha da planilha num rascunho; a categoria é procurada por nome ou slug. */
export function csvRowToDraft(
  r: Record<string, string>,
  cats: { id: string; name: string; slug: string }[],
): ImportDraft {
  const d = emptyDraft(r["link"] ?? r["link_afiliado"] ?? r["url"] ?? "");
  d.name = (r["nome"] ?? "").slice(0, 200);
  d.description = (r["descricao"] ?? "").slice(0, 2000);
  d.tags = (r["etiquetas"] ?? "")
    .split(/[,|]/)
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 12);
  const c = (r["categoria"] ?? "").trim();
  if (c) {
    const s = slugify(c);
    d.categoryId = cats.find((x) => x.slug === s || slugify(x.name) === s)?.id ?? null;
  }
  return d;
}

/** Slug único: nome + sufixo aleatório curto (ou "importado-…" sem nome). */
export function importSlug(name: string, rand = Math.random().toString(36).slice(2, 7)) {
  return `${slugify(name).slice(0, 80) || "importado"}-${rand}`;
}

export type ImportStatus = "pending" | "running" | "created" | "published" | "duplicate" | "error";
export const STATUS_LABEL: Record<ImportStatus, string> = {
  pending: "Na fila",
  running: "Processando",
  created: "Rascunho — aguardando revisão",
  published: "Publicado",
  duplicate: "Já cadastrado",
  error: "Erro",
};
