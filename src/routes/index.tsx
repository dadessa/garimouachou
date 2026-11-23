import { createFileRoute, Link } from "@tanstack/react-router";
import achadinhos from "@/assets/destaque-achadinhos.png.asset.json";
import capa from "@/assets/destaque-capa.png.asset.json";
import ofertas from "@/assets/destaque-ofertas.png.asset.json";
import { BannerCarousel, type Banner } from "@/components/site/BannerCarousel";
import { CatIcon } from "@/components/site/icons";
import { ProductGrid } from "@/components/site/ProductCard";
import { Section } from "@/components/site/Section";
import { activeCategories, publishedProducts } from "@/lib/sample-data";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Garimou Achou! — Achadinhos e ofertas garimpadas" },
      { name: "description", content: "A gente garimpa os melhores achadinhos da Amazon, Shopee, Mercado Livre e Magalu. Você aproveita." },
      { property: "og:title", content: "Garimou Achou! — Achadinhos e ofertas garimpadas" },
      { property: "og:description", content: "A gente garimpa. Você aproveita." },
    ],
    links: [{ rel: "canonical", href: "https://garimouachou.com.br/" }],
  }),
  component: Home,
});

const banners: Banner[] = [
  { id: "capa", image: capa.url, alt: "Garimou Achou! A gente garimpa. Você aproveita.", width: 532, height: 153 },
  { id: "achadinhos", image: achadinhos.url, alt: "Achadinhos da Semana", width: 290, height: 90 },
  { id: "ofertas", image: ofertas.url, alt: "Ofertas imperdíveis", width: 268, height: 90 },
];

function Home() {
  const all = publishedProducts();
  const weekly = all.filter((p) => p.isWeeklyPick).slice(0, 4);
  const featured = all.filter((p) => p.isFeatured).slice(0, 4);
  const cats = activeCategories().filter((c) => all.some((p) => p.categorySlug === c.slug));
  return (
    <>
      <BannerCarousel banners={banners} />
      {weekly.length > 0 && <Section title="Achadinhos da Semana"><ProductGrid products={weekly} /></Section>}
      {featured.length > 0 && <Section title="Ofertas em Destaque"><ProductGrid products={featured} /></Section>}
      {cats.length > 0 && (
        <Section title="Categorias Populares">
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-7">
            {cats.map((c) => (
              <Link key={c.slug} to="/categoria/$slug" params={{ slug: c.slug }} className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-card p-3 text-center text-xs font-bold shadow-card transition hover:-translate-y-0.5 hover:bg-accent">
                <span className="grid size-12 place-items-center rounded-full bg-accent text-navy"><CatIcon icon={c.icon} className="size-6" /></span>
                {c.name}
              </Link>
            ))}
          </div>
        </Section>
      )}
      {all.length > 0 && (
        <Section title="Últimos Achadinhos" action={<Link to="/ofertas" className="text-sm font-bold text-navy underline">Ver mais</Link>}>
          <ProductGrid products={all.slice(0, 8)} />
        </Section>
      )}
    </>
  );
}
