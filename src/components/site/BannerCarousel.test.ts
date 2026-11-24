import { describe, expect, it } from "vitest";
import { promoBanners } from "./BannerCarousel";

describe("promoBanners", () => {
  it("esconde banner sem link (só logo) e mantém os clicáveis", () => {
    const r = promoBanners([
      { id: "a", image: "/x.png", alt: "logo" },
      { id: "b", image: "/y.png", alt: "promo", link: "/categoria/casa" },
    ]);
    expect(r.map((b) => b.id)).toEqual(["b"]);
  });
});
