import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import mascote from "@/assets/logo-mascote.png.asset.json";
import { categoriesQuery } from "@/lib/catalog/queries";

export function EmptyState({
  title = "Nenhum achadinho por aqui ainda.",
  onClear,
}: {
  title?: string | undefined;
  onClear?: (() => void) | undefined;
}) {
  const { data: cats = [] } = useQuery(categoriesQuery);
  return (
    <div className="flex flex-col items-center py-10 text-center">
      <img src={mascote.url} alt="" width={210} height={197} className="w-24" />
      <p className="mt-3 font-bold">{title}</p>
      <p className="text-sm text-muted-foreground">
        Tente outra palavra, tire algum filtro ou dê uma olhada nestas categorias:
      </p>
      {onClear && (
        <button
          type="button"
          onClick={onClear}
          className="mt-4 h-11 rounded-full bg-navy px-6 text-sm font-bold text-secondary-foreground"
        >
          Limpar filtros
        </button>
      )}
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {cats.map((c) => (
          <Link
            key={c.slug}
            to="/categoria/$slug"
            params={{ slug: c.slug }}
            className="rounded-full bg-accent px-4 py-2 text-sm font-bold text-accent-foreground"
          >
            {c.name}
          </Link>
        ))}
      </div>
    </div>
  );
}

export function ComingSoon() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-14 text-center">
      <img src={mascote.url} alt="" width={210} height={197} className="w-32" />
      <h2 className="mt-4 text-2xl">Novos achadinhos chegando em breve</h2>
      <p className="mt-2 text-muted-foreground">
        A gente está garimpando. Volte logo para conferir!
      </p>
    </div>
  );
}

export function LoadError() {
  return (
    <p role="alert" className="py-10 text-center font-semibold">
      Não foi possível carregar os achadinhos agora. Tente de novo em instantes.
    </p>
  );
}
