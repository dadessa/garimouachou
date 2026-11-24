import { createOpenAI } from "@ai-sdk/openai";
import { Output, streamText } from "ai";
import { z } from "zod";
import { externalIdFromUrl, type OfferBlock } from "./offers";
import { IMAGE_HOSTS, MAX_PAGE_BYTES, isSafeUrl, readCapped, readMeta, safeFetch } from "./safe-fetch";

export interface PageInfo {
  finalUrl: string;
  title: string | null;
  image: string | null;
  description: string | null;
  availability: string | null;
  externalId: string | null;
  note: string | null;
}

/** Abre o link (seguindo encurtadores das lojas) e lê só os metadados públicos da página. */
export async function readPage(url: string, storeHosts: string[]): Promise<PageInfo> {
  const base = { finalUrl: url, title: null, image: null, description: null, availability: null };
  try {
    const r = await safeFetch(url, storeHosts, "text/html");
    const externalId = externalIdFromUrl(r.url) ?? externalIdFromUrl(url);
    if (!("res" in r) || !r.res) return { ...base, finalUrl: r.url, externalId, note: r.error ?? null };
    const { res } = r;
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("html")) {
      await res.body?.cancel();
      return { ...base, finalUrl: r.url, externalId, note: `A loja não liberou a página (${res.status}).` };
    }
    const bytes = await readCapped(res, MAX_PAGE_BYTES);
    if (!bytes) return { ...base, finalUrl: r.url, externalId, note: "Página grande demais." };
    const m = readMeta(new TextDecoder().decode(bytes));
    const image = m.image && isSafeUrl(m.image, IMAGE_HOSTS) ? m.image : null;
    return {
      finalUrl: r.url,
      title: m.title?.slice(0, 200) ?? null,
      image,
      description: m.description?.slice(0, 1000) ?? null,
      availability: m.availability,
      externalId,
      note: m.title || image ? null : "A loja não publica dados do produto nesta página.",
    };
  } catch {
    return { ...base, externalId: null, note: "A loja não respondeu a tempo." };
  }
}

const aiSchema = z.object({
  items: z.array(
    z.object({ index: z.number(), name: z.string(), category: z.string(), missing: z.array(z.string()) }),
  ),
});

/** IA só interpreta o texto colado: nome do produto e categoria entre as existentes. */
export async function interpretOffers(
  blocks: (OfferBlock & { pageTitle: string | null })[],
  categories: string[],
) {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("A IA não está configurada.");
  const provider = createOpenAI({
    baseURL: "https://ai.gateway.lovable.dev/v1",
    apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
  });
  const result = streamText({
    model: provider.responses("openai/gpt-6-astra"),
    maxRetries: 0,
    output: Output.object({ schema: aiSchema }),
    instructions:
      "Você lê mensagens de divulgação de achadinhos (WhatsApp, Mercado Livre, Shopee) para o Garimou Achou!. " +
      "Para cada item devolva: index, name (nome claro do produto em pt-BR, tirado SÓ do texto ou do título da página; vazio se não houver), " +
      `category (exatamente uma destas ou vazio: ${categories.join(" | ")}), missing (o que falta: nome, foto, preço). ` +
      "NUNCA invente nome, preço, desconto, comissão ou características que não estejam escritos.",
    prompt: blocks
      .map((b, i) => `#${i}\nTítulo da página: ${b.pageTitle ?? "(não disponível)"}\nMensagem: ${b.context || "(só o link)"}`)
      .join("\n\n"),
    providerOptions: { openai: { store: false, reasoningEffort: "low" } },
  });
  return (await result.output).items;
}

/** Baixa a imagem oficial (só CDNs das lojas, tipo e tamanho validados). */
export async function downloadImage(url: string) {
  const { IMAGE_TYPES, MAX_IMAGE_BYTES } = await import("./safe-fetch");
  const r = await safeFetch(url, IMAGE_HOSTS, "image/*", 3);
  if (!("res" in r) || !r.res) throw new Error(r.error ?? "Imagem indisponível.");
  const type = (r.res.headers.get("content-type") ?? "").split(";")[0]!.trim();
  if (!r.res.ok || !IMAGE_TYPES[type]) {
    await r.res.body?.cancel();
    throw new Error("A imagem não é JPG, PNG ou WebP.");
  }
  const bytes = await readCapped(r.res, MAX_IMAGE_BYTES);
  if (!bytes) throw new Error("A imagem passa de 5 MB.");
  return { bytes, type, ext: IMAGE_TYPES[type]! };
}
