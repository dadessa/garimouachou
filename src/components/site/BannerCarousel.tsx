import { useEffect, useRef, useState } from "react";
import type { Banner } from "@/lib/catalog/types";

export function BannerCarousel({ banners }: { banners: Banner[] }) {
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
  const go = (i: number) => ref.current?.scrollTo({ left: i * ref.current.clientWidth, behavior: "smooth" });
  return (
    <section aria-roledescription="carrossel" aria-label="Destaques" className="mx-auto max-w-6xl px-4 pt-5">
      <div ref={ref} className="flex items-start snap-x snap-mandatory overflow-x-auto rounded-3xl [scrollbar-width:none]">
        {banners.map((b, i) => (
          <picture key={b.id} className="w-full shrink-0 snap-center">
            {b.mobileImage && <source media="(max-width: 640px)" srcSet={b.mobileImage} />}
            {b.link ? (
              <a href={b.link}><img src={b.image} alt={b.alt} loading={i === 0 ? "eager" : "lazy"} className="h-auto w-full object-cover" /></a>
            ) : (
              <img src={b.image} alt={b.alt} loading={i === 0 ? "eager" : "lazy"} className="h-auto w-full object-cover" />
            )}
          </picture>
        ))}
      </div>
      {banners.length > 1 && (
        <div className="mt-3 flex justify-center gap-2">
          {banners.map((b, i) => (
            <button key={b.id} onClick={() => go(i)} aria-label={`Ir para destaque ${i + 1}`} aria-current={i === idx} className={`h-2.5 rounded-full transition-all ${i === idx ? "w-7 bg-navy" : "w-2.5 bg-border"}`} />
          ))}
        </div>
      )}
    </section>
  );
}
