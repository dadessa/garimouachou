import { Instagram } from "lucide-react";
import { track } from "@/lib/analytics/track";
import { INSTAGRAM_HANDLE, INSTAGRAM_URL } from "@/lib/site";

/** Chamada para seguir o Instagram oficial. Some do site se o endereço não estiver preenchido. */
export function InstagramCta() {
  if (!INSTAGRAM_URL) return null;
  return (
    <section className="mx-auto max-w-6xl px-4 pt-8 pb-2">
      <div className="flex flex-col items-start gap-3 rounded-2xl bg-navy px-5 py-4 text-secondary-foreground sm:flex-row sm:items-center sm:justify-between md:px-6">
        <div>
          <h2 className="text-lg font-extrabold md:text-xl">Siga o Garimou Achou! no Instagram</h2>
          <p className="mt-0.5 text-sm opacity-90">
            Novos achadinhos toda semana, direto no seu feed.
          </p>
        </div>
        <a
          href={INSTAGRAM_URL}
          onClick={() => track("instagram_click")}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full bg-yellow px-5 text-sm font-extrabold text-navy transition hover:brightness-110"
        >
          <Instagram className="size-4" aria-hidden />
          {INSTAGRAM_HANDLE}
        </a>
      </div>
    </section>
  );
}
