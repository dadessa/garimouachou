import { Instagram } from "lucide-react";
import { INSTAGRAM_HANDLE, INSTAGRAM_URL } from "@/lib/site";

/** Chamada para seguir o Instagram oficial. Some do site se o endereço não estiver preenchido. */
export function InstagramCta() {
  if (!INSTAGRAM_URL) return null;
  return (
    <section className="mx-auto max-w-6xl px-4 pt-12">
      <div className="flex flex-col items-start gap-4 rounded-3xl bg-navy p-6 text-secondary-foreground sm:flex-row sm:items-center sm:justify-between md:p-8">
        <div>
          <h2 className="text-xl font-extrabold md:text-2xl">
            Siga o Garimou Achou! no Instagram
          </h2>
          <p className="mt-1 text-sm opacity-90">
            Novos achadinhos toda semana, direto no seu feed.
          </p>
        </div>
        <a
          href={INSTAGRAM_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full bg-yellow px-5 text-sm font-extrabold text-navy transition hover:brightness-110"
        >
          <Instagram className="size-4" aria-hidden />
          {INSTAGRAM_HANDLE}
        </a>
      </div>
    </section>
  );
}
