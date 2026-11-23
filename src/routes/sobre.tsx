import { SITE_URL } from "@/lib/site";
import { createFileRoute } from "@tanstack/react-router";
import { InstitutionalPage } from "@/components/site/InstitutionalPage";

export const Route = createFileRoute("/sobre")({
  head: () => ({
    meta: [
      { title: "Sobre o Garimou Achou! — Garimou Achou!" },
      { name: "description", content: "Quem somos e como garimpamos achadinhos." },
      { property: "og:title", content: "Sobre o Garimou Achou! — Garimou Achou!" },
      { property: "og:description", content: "Quem somos e como garimpamos achadinhos." },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/sobre` }],
  }),
  component: () => (
    <InstitutionalPage title="Sobre o Garimou Achou!">
      <p>
        O Garimou Achou! garimpa produtos e ofertas nos marketplaces brasileiros. Não vendemos, não
        entregamos e não garantimos produtos: a compra acontece sempre no site do marketplace.
      </p>
      <p className="text-sm text-muted-foreground">Texto completo será redigido na Etapa 5.</p>
    </InstitutionalPage>
  ),
});
