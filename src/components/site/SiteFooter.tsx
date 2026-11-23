import { Link } from "@tanstack/react-router";
import { Instagram, Mail } from "lucide-react";
import logo from "@/assets/logo-negativa.png.asset.json";

const links = [
  { to: "/sobre", label: "Sobre o Garimou Achou!" },
  { to: "/afiliados", label: "Aviso de Afiliados" },
  { to: "/privacidade", label: "Política de Privacidade" },
  { to: "/cookies", label: "Política de Cookies" },
  { to: "/contato", label: "Contato" },
] as const;

export function SiteFooter() {
  return (
    <footer className="mt-16 bg-navy text-secondary-foreground">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 md:grid-cols-3">
        <div>
          <img
            src={logo.url}
            alt="Garimou Achou!"
            width={322}
            height={140}
            loading="lazy"
            className="h-20 w-auto rounded-2xl"
          />
          <p className="mt-4 font-semibold">A gente garimpa. Você aproveita.</p>
        </div>
        <nav aria-label="Institucional">
          <h2 className="mb-3 text-sm uppercase tracking-wider text-yellow">Institucional</h2>
          <ul className="space-y-2 text-sm">
            {links.map((l) => (
              <li key={l.to}>
                <Link to={l.to} className="hover:underline">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div>
          <h2 className="mb-3 text-sm uppercase tracking-wider text-yellow">Fale com a gente</h2>
          <a
            href="mailto:contato@garimouachou.com.br"
            className="flex items-center gap-2 text-sm hover:underline"
          >
            <Mail className="size-4" />
            contato@garimouachou.com.br
          </a>
          <a
            href="https://instagram.com"
            rel="noopener"
            target="_blank"
            className="mt-2 flex items-center gap-2 text-sm hover:underline"
          >
            <Instagram className="size-4" />
            Instagram
          </a>
        </div>
      </div>
      <div className="border-t border-secondary-foreground/15">
        <p className="mx-auto max-w-6xl px-4 py-5 text-xs leading-relaxed opacity-85">
          O Garimou Achou! participa de programas de afiliados. Alguns links podem gerar comissão,
          sem custo extra para você. Não vendemos, não entregamos e não garantimos produtos:
          pedidos, pagamentos, entregas e trocas seguem as regras de cada marketplace.
        </p>
      </div>
    </footer>
  );
}
