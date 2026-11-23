import { Link } from "@tanstack/react-router";
import mascote from "@/assets/logo-mascote.png.asset.json";
import { activeCategories } from "@/lib/sample-data";

export function EmptyState() {
  return (
    <div className="flex flex-col items-center py-10 text-center">
      <img src={mascote.url} alt="" width={210} height={197} className="w-24" />
      <p className="mt-3 font-bold">Nenhum achadinho por aqui ainda.</p>
      <p className="text-sm text-muted-foreground">Dá uma olhada nestas categorias:</p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {activeCategories().map((c) => (
          <Link key={c.slug} to="/categoria/$slug" params={{ slug: c.slug }} className="rounded-full bg-accent px-4 py-2 text-sm font-bold text-accent-foreground">{c.name}</Link>
        ))}
      </div>
    </div>
  );
}
