import { publicDb } from "./catalog/public-db.server";
import { SITE_URL } from "./site";

const pageSize = 500;
const publicPages = ["/", "/ofertas", "/sobre", "/contato"];

async function catalogPaths() {
  const db = publicDb();
  const { data: categories, error } = await db
    .from("categories")
    .select("slug")
    .eq("is_active", true)
    .order("slug");
  if (error) throw error;

  const paths = (categories ?? []).map(({ slug }) => `/categoria/${encodeURIComponent(slug)}`);
  for (let offset = 0; ; offset += pageSize) {
    const { data, error: productsError } = await db
      .from("products")
      .select("slug,categories!inner(slug),marketplaces!inner(slug)")
      .eq("status", "published")
      .order("slug")
      .range(offset, offset + pageSize - 1);
    if (productsError) throw productsError;
    paths.push(...data.map(({ slug }) => `/p/${encodeURIComponent(slug)}`));
    if (data.length < pageSize) return paths;
  }
}

export async function sitemapResponse(request: Request): Promise<Response> {
  try {
    const paths = [...publicPages, ...(await catalogPaths())];
    const urls = paths.map((path) => `  <url><loc>${SITE_URL}${path}</loc></url>`).join("\n");
    const xml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      urls,
      "</urlset>",
    ].join("\n");
    return new Response(request.method === "HEAD" ? null : xml, {
      headers: {
        "content-type": "application/xml; charset=utf-8",
        "cache-control": "public, max-age=300",
      },
    });
  } catch (error) {
    console.error("Erro ao gerar o sitemap:", error);
    return new Response(null, { status: 503, headers: { "retry-after": "300" } });
  }
}
