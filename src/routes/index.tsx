import { SITE_URL } from "@/lib/site";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { BannerCarousel } from "@/components/site/BannerCarousel";
import { ComingSoon, LoadError } from "@/components/site/EmptyState";
import { CatIcon } from "@/components/site/icons";
import { ProductGrid, ProductGridSkeleton } from "@/components/site/ProductCard";
import { Section } from "@/components/site/Section";
import { categoriesQuery, homeQuery } from "@/lib/catalog/queries";

export const Route = createFileRoute("/")({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(homeQuery),
      context.queryClient.ensureQueryData(categoriesQuery),
    ]),
  head: () => ({
    meta: [
      { title: "Garimou Achou! — Achadinhos e ofertas garimpadas" },
      {
        name: "description",
        content:
          "A gente garimpa os melhores achadinhos da Amazon, Shopee, Mercado Livre e Magalu. Você aproveita.",
      },
      { property: "og:title", content: "Garimou Achou! — Achadinhos e ofertas garimpadas" },
      { property: "og:description", content: "A gente garimpa. Você aproveita." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/` }],
  }),
  pendingComponent: () => (
    <div className="mx-auto max-w-6xl px-4 pt-10">
      <ProductGridSkeleton />
    </div>
  ),
  errorComponent: LoadError,
  component: Home,
});

function Home() {
  const {
    data: { banners, products: all },
  } = useSuspenseQuery(homeQuery);
  const { data: categories } = useSuspenseQuery(categoriesQuery);
  const weekly = all.filter((p) => p.isWeeklyPick).slice(0, 4);
  const featured = all.filter((p) => p.isFeatured).slice(0, 4);
  const cats = categories.filter((c) => all.some((p) => p.categorySlug === c.slug));
  return (
    <>
      <BannerCarousel banners={banners} />
      {all.length === 0 && <ComingSoon />}
      {weekly.length > 0 && (
        <Section title="Achadinhos da Semana">
          <ProductGrid products={weekly} />
        </Section>
      )}
      {featured.length > 0 && (
        <Section title="Ofertas em Destaque">
          <ProductGrid products={featured} />
        </Section>
      )}
      {cats.length > 0 && (
        <Section title="Categorias Populares">
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-7">
            {cats.map((c) => (
              <Link
                key={c.slug}
                to="/categoria/$slug"
                params={{ slug: c.slug }}
                className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-card p-3 text-center text-xs font-bold shadow-card transition hover:-translate-y-0.5 hover:bg-accent"
              >
                <span className="grid size-12 place-items-center rounded-full bg-accent text-navy">
                  <CatIcon icon={c.icon} className="size-6" />
                </span>
                {c.name}
              </Link>
            ))}
          </div>
        </Section>
      )}
      {all.length > 0 && (
        <Section
          title="Últimos Achadinhos"
          action={
            <Link to="/busca" search={{}} className="text-sm font-bold text-navy underline">
              Ver mais
            </Link>
          }
        >
          <ProductGrid products={all.slice(0, 8)} />
        </Section>
      )}
    </>
  );
}
