import { createFileRoute, Link, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Menu } from "lucide-react";
import { useState } from "react";
import logo from "@/assets/logo-horizontal.png.asset.json";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { passwordRequirement, signOutAdmin } from "@/lib/admin/password";

export const Route = createFileRoute("/admin/_painel")({
  // A sessão fica no navegador; a proteção real dos dados é feita pelo RLS e pelo storage.
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/admin/login", search: { next: location.href } });
    const { data: role, error: roleError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (roleError) throw new Error("Não foi possível conferir o acesso ao painel.");
    if (role && (await passwordRequirement())) throw redirect({ to: "/admin/trocar-senha" });
    return { email: data.user.email ?? "", isAdmin: !!role };
  },
  head: () => ({
    meta: [{ title: "Painel — Garimou Achou!" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: Painel,
});

const NAV = [
  { to: "/admin", label: "Visão geral", exact: true },
  { to: "/admin/desempenho", label: "Desempenho" },
  { to: "/admin/produtos", label: "Produtos" },
  { to: "/admin/importar", label: "Importar" },
  { to: "/admin/radar", label: "Radar" },
  { to: "/admin/integracoes", label: "Integrações" },
  { to: "/admin/categorias", label: "Categorias" },
  { to: "/admin/banners", label: "Banners" },
  { to: "/admin/marketplaces", label: "Marketplaces" },
  { to: "/admin/trocar-senha", label: "Senha" },
] as const;

function useSignOut() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  return async () => {
    await signOutAdmin(qc);
    navigate({ to: "/admin/login", search: { next: "/admin" }, replace: true });
  };
}

function Painel() {
  const { isAdmin, email } = Route.useRouteContext();
  const signOut = useSignOut();
  const [open, setOpen] = useState(false);
  if (!isAdmin) {
    return (
      <main className="grid min-h-screen place-items-center bg-muted px-4">
        <div className="max-w-sm rounded-3xl border border-border bg-card p-6 text-center shadow-card">
          <h1 className="text-xl font-extrabold text-navy">Acesso negado</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Esta conta não tem permissão para usar o painel.
          </p>
          <Button className="mt-5" onClick={signOut}>
            Sair
          </Button>
        </div>
      </main>
    );
  }
  const links = NAV.map((n) => (
    <Link
      key={n.to}
      to={n.to}
      onClick={() => setOpen(false)}
      activeOptions={{ exact: "exact" in n }}
      className="rounded-full px-4 py-2 text-sm font-bold text-background/80 hover:bg-background/10 data-[status=active]:bg-yellow data-[status=active]:text-navy"
    >
      {n.label}
    </Link>
  ));
  return (
    <div className="min-h-screen bg-muted">
      <header className="sticky top-0 z-40 bg-navy text-background">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2">
          <img
            src={logo.url}
            alt="Garimou Achou!"
            className="h-10 w-auto rounded-lg bg-background px-1"
          />
          <span className="text-sm font-extrabold">Painel</span>
          <nav className="ml-4 hidden gap-1 md:flex" aria-label="Painel">
            {links}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <a
              href="/"
              target="_blank"
              rel="noopener"
              className="hidden text-xs font-bold underline sm:inline"
            >
              Ver site
            </a>
            <button
              onClick={signOut}
              className="rounded-full border border-background/40 px-3 py-1.5 text-xs font-bold"
              title={email}
            >
              Sair
            </button>
            <button
              className="grid size-9 place-items-center md:hidden"
              aria-label="Abrir menu do painel"
              aria-expanded={open}
              onClick={() => setOpen(!open)}
            >
              <Menu className="size-5" />
            </button>
          </div>
        </div>
        {open && (
          <nav className="flex flex-col gap-1 px-4 pb-3 md:hidden" aria-label="Painel">
            {links}
          </nav>
        )}
      </header>
      <main id="conteudo" className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
