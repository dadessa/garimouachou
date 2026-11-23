import type { ReactNode } from "react";

export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="mx-auto max-w-6xl px-4 pt-10">
      <div className="mb-4 flex items-end justify-between gap-4">
        <h2 className="text-xl md:text-2xl"><span className="bg-[linear-gradient(transparent_62%,var(--yellow)_62%)] px-0.5">{title}</span></h2>
        {action}
      </div>
      {children}
    </section>
  );
}
