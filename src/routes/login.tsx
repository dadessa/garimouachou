import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { oauthReturnPath } from "@/lib/oauth-return-path";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/login")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({ next: oauthReturnPath(s["next"]) }),
  head: () => ({
    meta: [
      { title: "Entrar — Garimou Achou!" },
      { name: "description", content: "Acesso restrito à equipe do Garimou Achou!." },
      { property: "og:title", content: "Entrar — Garimou Achou!" },
      { property: "og:description", content: "Acesso restrito à equipe do Garimou Achou!." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Login,
});

function Login() {
  const { next } = Route.useSearch();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) { setError("E-mail ou senha incorretos."); return; }
    navigate({ href: next });
  }

  return (
    <main id="conteudo" className="mx-auto max-w-sm px-4 py-16">
      <h1 className="mb-6 text-2xl font-extrabold text-primary">Entrar</h1>
      <form onSubmit={submit} className="space-y-4">
        <Input type="email" required placeholder="E-mail" aria-label="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Input type="password" required placeholder="Senha" aria-label="Senha" value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={busy} className="w-full">{busy ? "Entrando..." : "Entrar"}</Button>
      </form>
    </main>
  );
}
