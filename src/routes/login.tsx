import { createFileRoute, redirect } from "@tanstack/react-router";
import { oauthReturnPath } from "@/lib/oauth-return-path";

/** Endereço antigo: o login fica em /admin/login (mantém o retorno do OAuth). */
export const Route = createFileRoute("/login")({
  beforeLoad: ({ search }) => {
    throw redirect({
      to: "/admin/login",
      search: { next: oauthReturnPath((search as Record<string, unknown>)["next"]) },
    });
  },
});
