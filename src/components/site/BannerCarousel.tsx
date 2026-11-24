import { useEffect, useRef, useState } from "react";
import { track } from "@/lib/analytics/track";
import type { Banner } from "@/lib/catalog/types";

/** Só banners clicáveis (comerciais). Banner sem link, como o que só repete a logo, não aparece. Sem rotação automática. */
export function promoBanners(banners: Banner[]) {
  return banners.filter((b) => !!b.link);
}

export function BannerCarousel({ banners: all }: { banners: Banner[] }) {
  const banners = promoBanners(all);
  const ref = useRef<HTMLDivElement>(null);
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const on = () => setIdx(Math.round(el.scrollLeft / el.clientWidth));
    el.addEventListener("scroll", on, { passive: true });
    return () => el.removeEventListener("scroll", on);
  }, []);
  if (banners.length === 0) return null;
  const go = (i: number) =>
    ref.current?.scrollTo({ left: i * ref.current.clientWidth, behavior: "smooth" });
  return (
    <section aria-roledescription="carrossel" aria-label="Promoções" className="mx-auto max-w-6xl px-4 pt-5">
      <div
        ref={ref}
        className="flex snap-x snap-mandatory overflow-x-auto rounded-2xl [scrollbar-width:none]"
      >
        {banners.map((b, i) => (
          <a
            key={b.id}
            href={b.link}
            onClick={() => track("banner_click", { slug: b.id })}
            className="flex w-full shrink-0 snap-center justify-center bg-muted"
          >
            <picture>
              {b.mobileImage && <source media="(max-width: 640px)" srcSet={b.mobileImage} />}
              <img
                src={b.image}
                alt={b.alt}
                loading={i === 0 ? "eager" : "lazy"}
                className="h-auto max-h-[160px] w-auto max-w-full object-contain md:max-h-[200px]"
              />
            </picture>
          </a>
        ))}
      </div>
      {banners.length > 1 && (
        <div className="mt-2 flex justify-center gap-2">
          {banners.map((b, i) => (
            <button
              key={b.id}
              onClick={() => go(i)}
              aria-label={`Ir para promoção ${i + 1}`}
              aria-current={i === idx}
              className={`h-2.5 rounded-full transition-all ${i === idx ? "w-7 bg-navy" : "w-2.5 bg-border"}`}
            />
          ))}
        </div>
      )}
    </section>
  );
}
