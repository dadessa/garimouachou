import { describe, expect, it } from "vitest";
import { applyView, buildRadar, classifyCategory, type Opp } from "./engine";
import { MAX_REQUESTS_PER_RUN, pagePlan, runStatus, shopeeToRow } from "./collect";
import { DEFAULT_WEIGHTS, coveragePenalty, growthFromHistory, totalRate } from "./score";
import { cleanTerm } from "@/lib/analytics/search-log";

const now = new Date("2026-11-24T12:00:00Z");
const op = (o: Partial<Opp>): Opp => ({
  id: "a",
  marketplace_slug: "shopee",
  external_id: "1",
  name: "Produto",
  image_url: null,
  affiliate_url: "https://s.shopee.com.br/x",
  category: "casa",
  price_cents: 10000,
  original_price_cents: null,
  commission_rate: 10,
  extra_commission_rate: null,
  discount_pct: null,
  sales: 100,
  search_volume: null,
  growth_pct: 5,
  rating: 4.5,
  seasonal_dates: [],
  source: "manual",
  fetched_at: now.toISOString(),
  valid_until: null,
  ...o,
});
const run = (ops: Opp[]) =>
  buildRadar(ops, DEFAULT_WEIGHTS, { catalog: [], clicks: new Map(), snaps: [], now });

describe("motor do radar", () => {
  it("comissão extra soma ao percentual base", () => {
    expect(totalRate(10, 5)).toBe(15);
    expect(totalRate(null, null)).toBeNull();
    expect(run([op({ extra_commission_rate: 5 })])[0]!.s.commissionCents).toBe(1500);
  });
  it("poucos dados reduzem o score", () => {
    expect(coveragePenalty(100, 0.3)).toBe(58);
    expect(coveragePenalty(100, 1)).toBe(100);
  });
  it("produto com poucos indicadores não passa à frente de um completo", () => {
    const rows = run([
      op({ id: "full", sales: 50 }),
      op({
        id: "poor",
        external_id: "2",
        sales: null,
        growth_pct: null,
        rating: null,
        commission_rate: null,
        price_cents: null,
        category: "outra",
      }),
    ]);
    const best = applyView(rows, "melhores");
    expect(best[0]!.o.id).toBe("full");
  });
  it("ofertas vencidas nunca aparecem como oportunidade atual", () => {
    const rows = run([
      op({ id: "v", valid_until: "2026-11-20T00:00:00Z" }),
      op({ id: "ok", external_id: "2" }),
    ]);
    expect(applyView(rows, "melhores").map((r) => r.o.id)).toEqual(["ok"]);
    expect(rows.find((r) => r.o.id === "v")!.s.expired).toBe(true);
  });
  it("crescimento vem do histórico quando a loja não informa", () => {
    expect(growthFromHistory(100, 150)).toBe(50);
    const rows = buildRadar([op({ growth_pct: null, sales: 150 })], DEFAULT_WEIGHTS, {
      catalog: [],
      clicks: new Map(),
      now,
      snaps: [{ opportunity_id: "a", day: "2026-11-10", sales: 100, search_volume: null }],
    });
    expect(rows[0]!.growth).toBe(50);
    expect(rows[0]!.growthFromHistory).toBe(true);
  });
  it("classifica categoria pelo nome do produto", () => {
    const cats = [
      { id: "1", name: "Festas" },
      { id: "2", name: "Cozinha" },
    ];
    expect(classifyCategory("Balão de festa metalizado", null, cats)?.id).toBe("1");
    expect(classifyCategory("Kit qualquer", "cozinha", cats)?.id).toBe("2");
    expect(classifyCategory("Item genérico", null, cats)).toBeNull();
  });
});

describe("coleta", () => {
  it("paginação respeita o limite de requisições", () => {
    expect(pagePlan(100, 2)).toBe(1);
    expect(pagePlan(500, 2)).toBe(5);
    expect(pagePlan(5000, 2) * 2).toBeLessThanOrEqual(MAX_REQUESTS_PER_RUN);
  });
  it("oferta da Shopee vira linha sem inventar dados", () => {
    const r = shopeeToRow(
      {
        itemId: 9,
        shopId: 8,
        productName: "X",
        imageUrl: null,
        price: null,
        priceMin: "20.00",
        priceMax: null,
        priceDiscountRate: 20,
        commissionRate: "0.08",
        sellerCommissionRate: "0.03",
        shopeeCommissionRate: "0.05",
        sales: null,
        offerLink: "https://s.shopee.com.br/a",
        productLink: "",
      },
      now,
    );
    expect(r.price_cents).toBe(2000);
    expect(r.original_price_cents).toBe(2500);
    expect(r.commission_rate).toBe(5);
    expect(r.extra_commission_rate).toBe(3);
    expect(r.sales).toBeNull();
    expect(new Date(r.valid_until).getTime() - now.getTime()).toBe(24 * 3600_000);
  });
  it("status da execução", () => {
    expect(runStatus(0, 0, 0)).toBe("skipped");
    expect(runStatus(10, 0, 1)).toBe("ok");
    expect(runStatus(10, 1, 2)).toBe("partial");
    expect(runStatus(0, 1, 1)).toBe("failed");
  });
  it("busca registrada sem dados pessoais", () => {
    expect(cleanTerm("  Balão  Festa ")).toBe("balão festa");
    expect(cleanTerm("ana@email.com")).toBeNull();
    expect(cleanTerm("11987654321")).toBeNull();
  });
});
