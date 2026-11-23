import type { ReactNode } from "react";

export function InstitutionalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <article className="mx-auto max-w-3xl px-4 py-10">
      <span className="inline-block rounded-full bg-accent px-3 py-1 text-xs font-extrabold text-accent-foreground">EM REVISÃO</span>
      <h1 className="mt-3 text-3xl">{title}</h1>
      <div className="mt-6 space-y-4 leading-relaxed">{children}</div>
    </article>
  );
}
