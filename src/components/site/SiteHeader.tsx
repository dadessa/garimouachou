import { Link, useNavigate } from "@tanstack/react-router";
import { Grid2x2, House, Menu, Search, Tag, X } from "lucide-react";
import { useEffect, useState } from "react";
import logo from "@/assets/logo-horizontal.png.asset.json";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useQuery } from "@tanstack/react-query";
import { categoriesQuery } from "@/lib/catalog/queries";
import type { Category } from "@/lib/catalog/types";
import { CatIcon } from "./icons";

function SearchForm({ autoFocus, onDone }: { autoFocus?: boolean; onDone?: () => void }) {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  return (
    <form
      role="search"
      className="relative w-full"
      onSubmit={(e) => {
        e.preventDefault();
        navigate({ to: "/busca", search: { q } });
        onDone?.();
      }}
    >
      <label htmlFor="busca-site" className="sr-only">
        Buscar achadinhos
      </label>
      <input
        id="busca-site"
        autoFocus={autoFocus}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="O que você procura?"
        className="h-11 w-full rounded-full border-2 border-input bg-background pl-4 pr-12 text-sm font-medium placeholder:text-muted-foreground focus:border-navy focus:outline-none"
      />
      <button
        type="submit"
        aria-label="Buscar"
        className="absolute right-1 top-1 grid size-9 place-items-center rounded-full bg-navy text-secondary-foreground"
      >
        <Search className="size-4" />
      </button>
    </form>
  );
}

export function SiteHeader({ categories: initial }: { categories: Category[] }) {
  const [scrolled, setScrolled] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 24);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  const { data: cats = initial } = useQuery({ ...categoriesQuery, initialData: initial });

  return (
    <header
      className={`sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur transition-shadow ${scrolled ? "shadow-card" : ""}`}
    >
      <div
        className={`mx-auto flex max-w-6xl items-center gap-3 px-4 transition-all ${scrolled ? "h-14" : "h-16 md:h-20"}`}
      >
        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetTrigger
            aria-label="Abrir menu de categorias"
            className="grid size-10 place-items-center rounded-full text-navy hover:bg-muted md:hidden"
          >
            <Menu className="size-6" />
          </SheetTrigger>
          <SheetContent side="left" className="w-72 bg-background">
            <SheetTitle className="font-extrabold text-navy">Categorias</SheetTitle>
            <nav className="mt-4 flex flex-col gap-1" aria-label="Categorias">
              <Link
                to="/"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-3 rounded-xl px-3 py-3 font-semibold hover:bg-muted"
              >
                <House className="size-5" />
                Início
              </Link>
              <Link
                to="/ofertas"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-3 rounded-xl px-3 py-3 font-semibold hover:bg-muted"
              >
                <Tag className="size-5" />
                Ofertas
              </Link>
              <hr className="my-2" />
              {cats.map((c) => (
                <Link
                  key={c.slug}
                  to="/categoria/$slug"
                  params={{ slug: c.slug }}
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-3 rounded-xl px-3 py-3 font-semibold hover:bg-muted"
                >
                  <CatIcon icon={c.icon} className="size-5" />
                  {c.name}
                </Link>
              ))}
            </nav>
          </SheetContent>
        </Sheet>

        <Link to="/" aria-label="Garimou Achou! — página inicial" className="shrink-0">
          <img
            src={logo.url}
            alt="Garimou Achou!"
            width={383}
            height={155}
            className={`w-auto transition-all ${scrolled ? "h-10" : "h-12 md:h-16"}`}
          />
        </Link>

        <div className="mx-4 hidden flex-1 md:block">
          <SearchForm />
        </div>

        <nav className="ml-auto hidden items-center gap-1 md:flex" aria-label="Principal">
          <div className="group relative">
            <button
              className="flex items-center gap-2 rounded-full px-4 py-2 font-semibold hover:bg-muted"
              aria-haspopup="true"
            >
              <Grid2x2 className="size-5" />
              Categorias
            </button>
            <div className="invisible absolute right-0 top-full w-64 rounded-2xl border border-border bg-popover p-2 opacity-0 shadow-lift transition group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
              {cats.map((c) => (
                <Link
                  key={c.slug}
                  to="/categoria/$slug"
                  params={{ slug: c.slug }}
                  className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold hover:bg-muted"
                >
                  <CatIcon icon={c.icon} className="size-4" />
                  {c.name}
                </Link>
              ))}
            </div>
          </div>
          <Link
            to="/ofertas"
            className="flex items-center gap-2 rounded-full px-4 py-2 font-semibold hover:bg-muted"
          >
            <Tag className="size-5" />
            Ofertas
          </Link>
        </nav>

        <button
          onClick={() => setSearchOpen((v) => !v)}
          aria-label={searchOpen ? "Fechar busca" : "Abrir busca"}
          aria-expanded={searchOpen}
          className="ml-auto grid size-10 place-items-center rounded-full text-navy hover:bg-muted md:hidden"
        >
          {searchOpen ? <X className="size-6" /> : <Search className="size-6" />}
        </button>
      </div>
      {searchOpen && (
        <div className="px-4 pb-3 md:hidden">
          <SearchForm autoFocus onDone={() => setSearchOpen(false)} />
        </div>
      )}
    </header>
  );
}
