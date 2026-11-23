import { SITE_URL } from "@/lib/site";
import { createFileRoute } from "@tanstack/react-router";
import { InstitutionalPage } from "@/components/site/InstitutionalPage";

export const Route = createFileRoute("/cookies")({
  head: () => ({
    meta: [
      { title: "Política de Cookies — Garimou Achou!" },
      { name: "description", content: "Como o Garimou Achou! usa armazenamento no navegador." },
      { property: "og:title", content: "Política de Cookies — Garimou Achou!" },
      {
        property: "og:description",
        content: "Como o Garimou Achou! usa armazenamento no navegador.",
      },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/cookies` }],
  }),
  component: () => (
    <InstitutionalPage title="Política de Cookies">
      <p>
        Usamos apenas armazenamento técnico de sessão para saber de qual rede social você veio. Não
        usamos pixels nem ferramentas de análise de terceiros.
      </p>
      <p className="text-sm text-muted-foreground">Texto completo será redigido na Etapa 5.</p>
    </InstitutionalPage>
  ),
});
