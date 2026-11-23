import { SITE_URL } from "@/lib/site";
import { createFileRoute } from "@tanstack/react-router";
import { InstitutionalPage } from "@/components/site/InstitutionalPage";

export const Route = createFileRoute("/afiliados")({
  head: () => ({
    meta: [
      { title: "Aviso de Afiliados — Garimou Achou!" },
      { name: "description", content: "Como funcionam os links de afiliado do Garimou Achou!." },
      { property: "og:title", content: "Aviso de Afiliados — Garimou Achou!" },
      {
        property: "og:description",
        content: "Como funcionam os links de afiliado do Garimou Achou!.",
      },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/afiliados` }],
  }),
  component: () => (
    <InstitutionalPage title="Aviso de Afiliados">
      <p>
        Alguns links deste site são de afiliado e podem gerar comissão para o Garimou Achou!, sem
        custo extra para você. Pedidos, pagamentos, entregas, trocas e devoluções seguem as regras
        do marketplace e do vendedor.
      </p>
      <p className="text-sm text-muted-foreground">Texto completo será redigido na Etapa 5.</p>
    </InstitutionalPage>
  ),
});
