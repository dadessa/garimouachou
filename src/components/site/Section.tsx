import type { ReactNode } from "react";

export function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="mx-auto max-w-6xl px-4 pt-6 md:pt-8">
      <div className="mb-3 flex items-end justify-between gap-4">
        <h2 className="text-lg md:text-xl">
          <span className="bg-[linear-gradient(transparent_62%,var(--yellow)_62%)] px-0.5">
            {title}
          </span>
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}
