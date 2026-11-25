import { commercialKeywords, parseTrendsRss } from "./google-trends";

const FEED = "https://trends.google.com/trending/rss?geo=BR";
const MAX_BYTES = 1_000_000;

/** Apenas fonte oficial fixa; limite de tempo/tamanho e fallback sem dados inventados. */
export async function fetchGoogleTrends() {
  const checkedAt = new Date().toISOString();
  try {
    const response = await fetch(FEED, {
      headers: { Accept: "application/rss+xml, application/xml, text/xml" },
      redirect: "manual",
      signal: AbortSignal.timeout(6000),
      cache: "no-store",
    });
    if (!response.ok || !response.body) throw new Error("Feed indisponível.");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let bytes = 0;
    let xml = "";
    try {
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > MAX_BYTES) throw new Error("Feed excedeu o limite.");
        xml += decoder.decode(chunk.value, { stream: true });
      }
      xml += decoder.decode();
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
    const trends = parseTrendsRss(xml);
    return { ok: true, checkedAt, keywords: commercialKeywords(trends), trends };
  } catch {
    return { ok: false, checkedAt, keywords: [] as string[], trends: [] };
  }
}
