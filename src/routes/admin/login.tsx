import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import logo from "@/assets/logo-horizontal.png.asset.json";
import { supabase } from "@/integrations/supabase/client";
import { oauthReturnPath } from "@/lib/oauth-return-path";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { passwordRequirement } from "@/lib/admin/password";
import { passwordDestination } from "@/lib/admin/password-rules";

export const Route = createFileRoute("/admin/login")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    next: oauthReturnPath(s["next"] ?? "/admin"),
  }),
  head: () => ({
    meta: [
      { title: "Entrar no painel — Garimou Achou!" },
      { name: "description", content: "Acesso restrito à equipe do Garimou Achou!." },
      { property: "og:title", content: "Entrar no painel — Garimou Achou!" },
      { property: "og:description", content: "Acesso restrito à equipe do Garimou Achou!." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: Login,
});

function Login() {
  const { next } = Route.useSearch();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "forgot">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setBusy(false);
      if (error) {
        setMsg({
          ok: false,
          text: error.message.includes("Email not confirmed")
            ? "Confirme seu e-mail antes de entrar."
            : "E-mail ou senha incorretos.",
        });
        return;
      }
      try {
        const required = await passwordRequirement();
        navigate({ href: passwordDestination(required, next), replace: true });
      } catch {
        setMsg({ ok: false, text: "Não foi possível conferir o acesso. Tente novamente." });
      }
    } else {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/admin/redefinir-senha`,
      });
      setBusy(false);
      setMsg(
        error
          ? {
              ok: false,
              text: "Não foi possível enviar o e-mail agora. Tente de novo em alguns minutos.",
            }
          : {
              ok: true,
              text: "Se este e-mail tiver acesso, você vai receber um link para criar uma nova senha.",
            },
      );
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-muted px-4">
      <div className="w-full max-w-sm rounded-3xl border border-border bg-card p-6 shadow-card">
        <img src={logo.url} alt="Garimou Achou!" className="mx-auto mb-4 h-14 w-auto" />
        <h1 className="mb-5 text-center text-xl font-extrabold text-navy">
          {mode === "login" ? "Entrar no painel" : "Recuperar senha"}
        </h1>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          {mode === "login" && (
            <div className="space-y-1.5">
              <Label htmlFor="senha">Senha</Label>
              <Input
                id="senha"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          )}
          {msg && (
            <p
              role={msg.ok ? "status" : "alert"}
              className={`text-sm ${msg.ok ? "text-navy" : "text-destructive"}`}
            >
              {msg.text}
            </p>
          )}
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? "Aguarde..." : mode === "login" ? "Entrar" : "Enviar link"}
          </Button>
        </form>
        <button
          type="button"
          onClick={() => {
            setMode(mode === "login" ? "forgot" : "login");
            setMsg(null);
          }}
          className="mt-4 w-full text-center text-sm font-bold text-navy underline"
        >
          {mode === "login" ? "Esqueci minha senha" : "Voltar para o login"}
        </button>
      </div>
    </main>
  );
}
