import { SITE_URL } from "@/lib/site";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { BannerCarousel } from "@/components/site/BannerCarousel";
import { ComingSoon, LoadError } from "@/components/site/EmptyState";
import { CatIcon } from "@/components/site/icons";
import { ProductGrid, ProductGridSkeleton } from "@/components/site/ProductCard";
import { SearchForm } from "@/components/site/SiteHeader";
import { Section } from "@/components/site/Section";
import { InstagramCta } from "@/components/site/InstagramCta";
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
  const shown = new Set(weekly.map((p) => p.slug));
  const featured = all.filter((p) => p.isFeatured && !shown.has(p.slug)).slice(0, 4);
  featured.forEach((p) => shown.add(p.slug));
  const latest = all.filter((p) => !shown.has(p.slug)).slice(0, 8);
  const cats = categories.filter((c) => all.some((p) => p.categorySlug === c.slug));
  return (
    <>
      <section className="bg-yellow">
        <div className="mx-auto max-w-6xl px-4 py-5 md:py-7">
          <h1 className="max-w-[20ch] text-2xl leading-[1.1] text-navy sm:max-w-[26ch] md:text-[40px] lg:text-[44px]">
            A gente garimpa os melhores achadinhos. Você aproveita.
          </h1>
          <p className="mt-2 max-w-[62ch] text-sm font-semibold leading-snug text-navy md:text-lg lg:text-xl">
            Produtos escolhidos no Mercado Livre, Shopee e outras lojas. Você compra direto no site
            da loja.
          </p>
          <div className="mt-4 max-w-[760px]">
            <SearchForm id="busca-home" large />
          </div>
        </div>
      </section>
      {cats.length > 0 && (
        <nav aria-label="Categorias" className="border-b border-border bg-card">
          <div className="mx-auto max-w-6xl px-4 py-3">
            <h2 className="sr-only">Categorias</h2>
            <ul className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:grid md:grid-cols-[repeat(auto-fit,minmax(120px,1fr))] md:overflow-visible md:px-0 md:pb-0">
              {cats.map((c) => (
                <li key={c.slug} className="shrink-0 snap-start">
                  <Link
                    to="/categoria/$slug"
                    params={{ slug: c.slug }}
                    className="flex min-h-11 items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm font-bold text-navy transition hover:-translate-y-0.5 hover:border-navy hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy focus-visible:ring-offset-2 active:translate-y-0 active:bg-yellow"
                  >
                    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent">
                      <CatIcon icon={c.icon} className="size-4" />
                    </span>
                    <span className="whitespace-nowrap">{c.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </nav>
      )}
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
      {latest.length > 0 && (
        <Section
          title="Novidades"
          action={
            <Link to="/busca" search={{}} className="text-sm font-bold text-navy underline">
              Ver mais
            </Link>
          }
        >
          <ProductGrid products={latest} />
        </Section>
      )}
      <BannerCarousel banners={banners} />
      <InstagramCta />
    </>
  );
}
