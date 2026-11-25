import { createOpenAI } from "@ai-sdk/openai";
import { Output, streamText } from "ai";
import { z } from "zod";

const schema = z.object({ answer: z.string(), ids: z.array(z.string()) });

export async function askRadarAi(
  question: string,
  history: { role: "user" | "assistant"; text: string }[],
  data: unknown,
) {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("A IA não está configurada.");
  const provider = createOpenAI({
    baseURL: "https://ai.gateway.lovable.dev/v1",
    apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
  });
  const convo = history
    .map((h) => `${h.role === "user" ? "Administradora" : "Assistente"}: ${h.text}`)
    .join("\n");
  const result = streamText({
    model: provider.responses("openai/gpt-6-astra"),
    maxRetries: 0,
    output: Output.object({ schema }),
    instructions:
      "Você é analista de marketing de afiliados do Garimou Achou! (pt-BR). Responda SÓ com base nos DADOS JSON fornecidos, que vêm do sistema. " +
      "NUNCA invente produtos, preços, tendências, vendas ou comissões. Se faltar dado, diga que falta. Cliques não são vendas; comissão estimada não é confirmada. " +
      "O score, a confiança e a justificativa já foram calculados pela regra do Radar — use-os, não recalcule. Ofertas vencidas foram removidas: nunca as recomende. Diferencie vendas na loja, procura, cliques no site e conversões. " +
      "Você pode: indicar os melhores para divulgar hoje; comparar Shopee e Mercado Livre; filtrar por faixa de preço e comissão; recomendar nichos/categorias; montar um plano diário de divulgação (manhã/tarde/noite, com canal); sugerir produtos e um texto curto para Instagram e para WhatsApp (sem preço inventado); e sugerir quais produtos do catálogo com poucos cliques substituir por oportunidades melhores. " +
      "Sempre cite a fonte e a data de consulta dos dados usados. Prefira confiança alta ou média. Em 'ids' devolva os ids das oportunidades que você recomenda importar (no máximo 10, só ids existentes e que não estejam no catálogo). Resposta curta, em tópicos.",
    prompt: `DADOS:\n${JSON.stringify(data)}\n\nCONVERSA:\n${convo}\nAdministradora: ${question}`,
    providerOptions: { openai: { store: false, reasoningEffort: "low" } },
  });
  const out = await result.output;
  return { answer: out.answer.trim(), ids: out.ids.slice(0, 10) };
}
