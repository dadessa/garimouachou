import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/admin/redefinir-senha")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Nova senha — Garimou Achou!" },
      { name: "description", content: "Defina uma nova senha para o painel." },
      { property: "og:title", content: "Nova senha — Garimou Achou!" },
      { property: "og:description", content: "Defina uma nova senha para o painel." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ResetPassword,
});

function ResetPassword() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) setReady(true);
    });
    supabase.auth.getSession().then(({ data: s }) => { if (s.session) setReady(true); });
    const t = setTimeout(() => setReady((r) => { if (!r) setMsg("Link inválido ou expirado. Peça um novo na tela de login."); return r; }), 4000);
    return () => { data.subscription.unsubscribe(); clearTimeout(t); };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) return setMsg("A senha precisa ter pelo menos 8 caracteres.");
    if (password !== confirm) return setMsg("As senhas não são iguais.");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return setMsg(error.message.toLowerCase().includes("pwned") || error.message.toLowerCase().includes("weak") ? "Essa senha é fraca ou já vazou em outros sites. Escolha outra." : "Não foi possível salvar a nova senha. Peça um novo link.");
    navigate({ to: "/admin", replace: true });
  }

  return (
    <main className="grid min-h-screen place-items-center bg-muted px-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-3xl border border-border bg-card p-6 shadow-card">
        <h1 className="text-xl font-extrabold text-navy">Criar nova senha</h1>
        <div className="space-y-1.5"><Label htmlFor="nova">Nova senha</Label><Input id="nova" type="password" autoComplete="new-password" required disabled={!ready} value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        <div className="space-y-1.5"><Label htmlFor="conf">Repita a nova senha</Label><Input id="conf" type="password" autoComplete="new-password" required disabled={!ready} value={confirm} onChange={(e) => setConfirm(e.target.value)} /></div>
        {msg && <p role="alert" className="text-sm text-destructive">{msg}</p>}
        <Button type="submit" disabled={!ready || busy} className="w-full">{busy ? "Salvando..." : "Salvar nova senha"}</Button>
      </form>
    </main>
  );
}
