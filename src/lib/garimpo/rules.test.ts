import { describe, expect, it } from "vitest";
import {
  blockedSearchMessage,
  buildPlan,
  deduplicateOffers,
  discardReason,
  isDue,
  isSearchBlocked,
  runStatusOf,
  searchSources,
  type GarimpoSettings,
} from "./rules";

const s: GarimpoSettings = {
  enabled: true,
  run_hour: 6,
  frequency_hours: 24,
  daily_limit: 20,
  request_limit: 12,
  marketplaces: [],
  keywords: [],
  min_price_cents: null,
  max_price_cents: null,
  min_commission_pct: null,
  min_discount_pct: null,
};

describe("garimpo", () => {
  it("roda às 06h de Brasília (09h UTC)", () => {
    expect(isDue(s, null, new Date("2026-11-25T09:05:00Z"))).toBe(true);
    expect(isDue(s, null, new Date("2026-11-25T08:55:00Z"))).toBe(false);
  });
  it("não roda duas vezes no mesmo dia", () => {
    expect(isDue(s, new Date("2026-11-25T09:00:00Z"), new Date("2026-11-25T09:40:00Z"))).toBe(
      false,
    );
  });
  it("desligado nunca roda", () => {
    expect(isDue({ ...s, enabled: false }, null, new Date("2026-11-25T09:05:00Z"))).toBe(false);
  });
  it("comissão mínima descarta quando a loja não informa comissão", () => {
    const c = {
      marketplace_slug: "kabum",
      price_cents: 10000,
      discount_pct: 30,
      commission_rate: null,
    };
    expect(discardReason(c, { ...s, min_commission_pct: 5 })).toMatch(/comissão/);
    expect(discardReason(c, s)).toBeNull();
  });
  it("faixa de preço exige preço", () => {
    const c = {
      marketplace_slug: "kabum",
      price_cents: null,
      discount_pct: null,
      commission_rate: null,
    };
    expect(discardReason(c, { ...s, max_price_cents: 5000 })).toMatch(/preço/);
  });
  it("plano respeita o limite de requisições e prioriza loja com comissão", () => {
    const p = buildPlan(
      [
        { site: "kabum", monetized: false },
        { site: "shopee", monetized: true },
      ],
      ["a", "b", "c"],
      { marketplaces: [], request_limit: 4 },
    );
    expect(p).toHaveLength(4);
    expect(p[0]!.site).toBe("shopee");
  });
});

describe("isolamento de fontes indisponíveis", () => {
  it("suspende somente a loja que sofreu bloqueio explícito", () => {
    const message = blockedSearchMessage(
      "kabum",
      "Busca da Kabum indisponível (proteção anti-bot bloqueou o servidor).",
    );
    expect(message).not.toBeNull();
    expect(isSearchBlocked("kabum", [message!])).toBe(true);
    expect(isSearchBlocked("mercadolivre", [message!])).toBe(false);
  });

  it("reconhece o histórico de uma execução anterior à atualização", () => {
    const errors = ["kabum/Presentes: proteção anti-bot bloqueou o servidor"];
    expect(isSearchBlocked("kabum", errors)).toBe(true);
    expect(isSearchBlocked("shopee", errors)).toBe(false);
  });

  it("não suspende a loja por uma falha genérica", () => {
    expect(blockedSearchMessage("kabum", "Tempo de consulta excedido")).toBeNull();
  });

  it("mantém as outras consultas e respeita a seleção de lojas", () => {
    const sites = [
      { site: "kabum", monetized: false },
      { site: "mercadolivre", monetized: true },
    ];
    const plan = buildPlan(sites, ["fone", "smartwatch"], s);
    const errors = [blockedSearchMessage("kabum", "HTTP 403")!];
    expect(plan.filter((p) => !isSearchBlocked(p.site, errors))).toHaveLength(2);
    expect(buildPlan(sites, ["fone"], { ...s, marketplaces: ["shopee"] })).toEqual([]);
  });
});

describe("fontes independentes e conclusão do garimpo", () => {
  it("permite planejar pela API Shopee sem MCP configurado", () => {
    const sources = searchSources([], true);
    expect(buildPlan(sources, ["fone"], s)).toEqual([
      { site: "shopee", monetized: true, provider: "shopee_api", keyword: "fone" },
    ]);
  });

  it("não duplica Shopee quando existem duas integrações", () => {
    expect(searchSources([{ site: "Shopee", monetized: false }], true)).toEqual([
      { site: "shopee", monetized: true, provider: "shopee_api" },
    ]);
  });

  it("distingue consulta vazia válida de todas as fontes com erro", () => {
    expect(runStatusOf(1, 0, 0, 1)).toBe("partial");
    expect(runStatusOf(1, 0, 0, 0)).toBe("failed");
    expect(runStatusOf(0, 0, 0, 1)).toBe("ok");
  });

  it("reconhece respostas de acesso limitado da API oficial", () => {
    expect(blockedSearchMessage("shopee", "Shopee [403]: acesso negado")).not.toBeNull();
    expect(blockedSearchMessage("kabum", "HTTP 429: limite")).not.toBeNull();
  });
});

describe("persistência do garimpo", () => {
  it("remove chaves repetidas do lote sem misturar lojas", () => {
    const a = { marketplace_slug: "shopee", external_id: "1" };
    const b = { marketplace_slug: "magalu", external_id: "1" };
    expect(deduplicateOffers([a, a, b])).toEqual([a, b]);
  });

  it("não considera sucesso quando encontrou produtos mas todas as gravações falharam", () => {
    expect(runStatusOf(1, 0, 8, 0)).toBe("failed");
    expect(runStatusOf(1, 1, 8, 0)).toBe("partial");
  });
});
