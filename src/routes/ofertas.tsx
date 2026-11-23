import { createFileRoute } from "@tanstack/react-router";
import { ProductGrid } from "@/components/site/ProductCard";
import { publishedProducts } from "@/lib/sample-data";

export const Route = createFileRoute("/ofertas")({
  head: () => ({
    meta: [
      { title: "Ofertas — Garimou Achou!" },
      { name: "description", content: "Todos os achadinhos garimpados, dos mais recentes aos mais antigos." },
      { property: "og:title", content: "Ofertas — Garimou Achou!" },
      { property: "og:description", content: "Todos os achadinhos garimpados." },
    ],
    links: [{ rel: "canonical", href: "https://garimouachou.com.br/ofertas" }],
  }),
  component: () => (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="mb-6 text-2xl md:text-3xl">Ofertas</h1>
      <ProductGrid products={publishedProducts()} />
    </div>
  ),
});
