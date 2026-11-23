import { createFileRoute } from "@tanstack/react-router";
import { InstitutionalPage } from "@/components/site/InstitutionalPage";

export const Route = createFileRoute("/privacidade")({
  head: () => ({
    meta: [
      { title: "Política de Privacidade — Garimou Achou!" },
      { name: "description", content: "Quais dados coletamos e como os tratamos, conforme a LGPD." },
      { property: "og:title", content: "Política de Privacidade — Garimou Achou!" },
      { property: "og:description", content: "Quais dados coletamos e como os tratamos, conforme a LGPD." },
    ],
    links: [{ rel: "canonical", href: "https://garimouachou.com.br/privacidade" }],
  }),
  component: () => (
    <InstitutionalPage title="Política de Privacidade">
      <p>Registramos apenas cliques anônimos nos links de oferta (produto, origem e tipo de aparelho), sem IP, e-mail ou identificador pessoal.</p>
      <p className="text-sm text-muted-foreground">Texto completo será redigido na Etapa 5.</p>
    </InstitutionalPage>
  ),
});
