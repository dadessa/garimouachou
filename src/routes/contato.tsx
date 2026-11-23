import { SITE_URL } from "@/lib/site";
import { createFileRoute } from "@tanstack/react-router";
import { InstitutionalPage } from "@/components/site/InstitutionalPage";

export const Route = createFileRoute("/contato")({
  head: () => ({
    meta: [
      { title: "Contato — Garimou Achou!" },
      { name: "description", content: "Fale com o Garimou Achou!." },
      { property: "og:title", content: "Contato — Garimou Achou!" },
      { property: "og:description", content: "Fale com o Garimou Achou!." },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/contato` }],
  }),
  component: () => (
    <InstitutionalPage title="Contato">
      <p>Escreva para contato@garimouachou.com.br.</p>
      <p className="text-sm text-muted-foreground">Texto completo será redigido na Etapa 5.</p>
    </InstitutionalPage>
  ),
});
