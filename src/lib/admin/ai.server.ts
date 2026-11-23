import { createOpenAI } from "@ai-sdk/openai";
import { Output, streamText } from "ai";
import { z } from "zod";

export interface CopyInput {
  name: string;
  category: string;
  affiliateUrl: string;
  details: string;
}

const schema = z.object({
  description: z.string(),
  tags: z.array(z.string()),
});

/** Gera descrição curta e etiquetas via Lovable AI Gateway. Sem preços, descontos ou avaliações. */
export async function generateProductCopy(input: CopyInput) {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("A IA não está configurada.");
  let runId: string | undefined;
  const provider = createOpenAI({
    baseURL: "https://ai.gateway.lovable.dev/v1",
    apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: async (url, init) => {
      const h = new Headers(init?.headers);
      if (runId) h.set("X-Lovable-AIG-Run-ID", runId);
      const r = await fetch(url, { ...init, headers: h });
      runId ??= r.headers.get("X-Lovable-AIG-Run-ID") ?? undefined;
      return r;
    },
  });
  const result = streamText({
    model: provider.responses("openai/gpt-6-astra"),
    maxRetries: 0,
    output: Output.object({ schema }),
    instructions:
      "Você escreve para o Garimou Achou!, um site brasileiro de achadinhos de afiliados. Escreva em pt-BR, tom simpático e direto. " +
      "Gere: description (2 a 3 frases, até 300 caracteres, explicando para que serve e por que vale a pena) e tags (4 a 8 etiquetas curtas, minúsculas, úteis para busca). " +
      "Use só as informações fornecidas. NUNCA invente preço, desconto, frete, avaliação, nota, quantidade vendida ou garantia.",
    prompt: `Produto: ${input.name}\nCategoria: ${input.category}\nLink: ${input.affiliateUrl}\nDetalhes: ${input.details || "(nenhum)"}`,
    providerOptions: {
      openai: {
        store: false,
        forceReasoning: true,
        reasoningEffort: "low",
        reasoningSummary: "auto",
        include: ["reasoning.encrypted_content"],
      },
    },
  });
  const out = await result.output;
  const tags = [...new Set(out.tags.map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 8);
  return { description: out.description.trim().slice(0, 400), tags };
}
