import { createFileRoute, redirect, useNavigate, useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { KeyRound, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { passwordRequirement, signOutAdmin } from "@/lib/admin/password";
import {
  MIN_PASSWORD_LENGTH,
  PASSWORD_REQUIREMENTS,
  passwordValidation,
} from "@/lib/admin/password-rules";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import logo from "@/assets/logo-horizontal.png.asset.json";

export const Route = createFileRoute("/admin/trocar-senha")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user)
      throw redirect({ to: "/admin/login", search: { next: "/admin/trocar-senha" } });
    const { data: role, error: roleError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (roleError) throw new Error("Não foi possível conferir o acesso.");
    if (!role) throw redirect({ to: "/admin" });
    const required = await passwordRequirement();
    const { data: requirement, error: requirementError } = await supabase
      .from("admin_password_requirements")
      .select("required")
      .eq("user_id", data.user.id)
      .maybeSingle();
    if (requirementError) throw new Error("Não foi possível conferir a exigência de senha.");
    return { required, scheduled: requirement?.required === true };
  },
  head: () => ({
    meta: [
      { title: "Trocar senha — Painel Garimou Achou!" },
      {
        name: "description",
        content: "Troca segura de senha da conta administrativa do Garimou Achou!.",
      },
      { property: "og:title", content: "Trocar senha — Painel Garimou Achou!" },
      {
        property: "og:description",
        content: "Troca segura de senha da conta administrativa do Garimou Achou!.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ChangePassword,
});

function ChangePassword() {
  const { required, scheduled } = Route.useRouteContext();
  const navigate = useNavigate();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function exit() {
    setBusy(true);
    try {
      await signOutAdmin(queryClient);
      await navigate({ to: "/admin/login", search: { next: "/admin" }, replace: true });
    } catch {
      setMessage({ ok: false, text: "Não foi possível sair. Tente novamente." });
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const invalid = passwordValidation(current, password, confirmation);
    if (invalid) return setMessage({ ok: false, text: invalid });
    setBusy(true);
    setMessage(null);
    try {
      const { error } = await supabase.auth.updateUser({ password, current_password: current });
      if (error) {
        const text = error.message.toLowerCase();
        setMessage({
          ok: false,
          text:
            text.includes("weak") || text.includes("pwned")
              ? "Essa senha é fraca ou já vazou. Escolha outra."
              : "Não foi possível trocar a senha. Confira a senha atual e tente novamente.",
        });
        return;
      }
      setCurrent("");
      setPassword("");
      setConfirmation("");
      if (await passwordRequirement()) throw new Error("Senha pendente");
      await queryClient.cancelQueries();
      queryClient.clear();
      await router.invalidate();
      setMessage({ ok: true, text: "Senha alterada. Seu acesso ao painel está liberado." });
    } catch {
      setMessage({
        ok: false,
        text: "Não foi possível confirmar a troca. Confira sua conexão e tente novamente.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function schedule() {
    setBusy(true);
    setMessage(null);
    try {
      const { error } = await supabase.rpc("request_password_change");
      if (error) throw error;
      await router.invalidate();
      setMessage({
        ok: true,
        text: "No próximo acesso, será obrigatório criar uma nova senha antes de abrir o painel.",
      });
    } catch {
      setMessage({ ok: false, text: "Não foi possível agendar a troca. Tente novamente." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-muted px-4 py-10 sm:py-16">
      <div className="mx-auto w-full max-w-md">
        <img src={logo.url} alt="Garimou Achou!" className="mx-auto mb-8 h-14 w-auto max-w-full" />
        <div className="rounded-lg border border-border bg-card p-5 shadow-card sm:p-6">
          <div className="mb-3 flex items-center gap-2 text-navy">
            <KeyRound className="size-5 shrink-0" />
            <h1 className="text-xl font-extrabold">
              {required ? "Crie uma nova senha" : "Trocar senha"}
            </h1>
          </div>
          {required && (
            <p className="mb-5 text-sm text-muted-foreground">
              A troca de senha é obrigatória para continuar no painel.
            </p>
          )}
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="senha-atual">Senha atual</Label>
              <Input
                id="senha-atual"
                type="password"
                autoComplete="current-password"
                required
                disabled={busy}
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nova-senha">Nova senha</Label>
              <Input
                id="nova-senha"
                type="password"
                autoComplete="new-password"
                required
                minLength={MIN_PASSWORD_LENGTH}
                aria-describedby="regras-senha"
                disabled={busy}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <p id="regras-senha" className="text-sm text-muted-foreground">
                {PASSWORD_REQUIREMENTS}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirmar-senha">Confirme a nova senha</Label>
              <Input
                id="confirmar-senha"
                type="password"
                autoComplete="new-password"
                required
                minLength={MIN_PASSWORD_LENGTH}
                disabled={busy}
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              <KeyRound />
              {busy ? "Aguarde..." : "Salvar nova senha"}
            </Button>
          </form>
          {message && (
            <p
              className={`mt-4 text-sm ${message.ok ? "text-navy" : "text-destructive"}`}
              role={message.ok ? "status" : "alert"}
            >
              {message.text}
            </p>
          )}
          {required && (
            <Button
              variant="link"
              className="mt-2 px-0"
              onClick={() =>
                navigate({ to: "/admin/login", search: { next: "/admin/trocar-senha" } })
              }
            >
              Esqueci minha senha
            </Button>
          )}
          {!required && (
            <div className="mt-6 border-t border-border pt-5">
              {scheduled ? (
                <p className="text-sm font-semibold text-navy">
                  Troca obrigatória agendada para o próximo acesso.
                </p>
              ) : (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={schedule}
                  className="h-auto min-h-10 w-full whitespace-normal py-2"
                >
                  <KeyRound />
                  Exigir nova senha no próximo acesso
                </Button>
              )}
              <Button
                variant="link"
                disabled={busy}
                className="mt-2 px-0"
                onClick={() => navigate({ to: "/admin", replace: true })}
              >
                Voltar ao painel
              </Button>
            </div>
          )}
          <Button variant="ghost" disabled={busy} className="mt-3 w-full" onClick={exit}>
            <LogOut />
            Sair
          </Button>
        </div>
      </div>
    </main>
  );
}
