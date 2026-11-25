import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { stepGarimpo } from "./run.server";

const mocks = vi.hoisted(() => ({
  searchProducts: vi.fn(),
  convertLinks: vi.fn(),
  importOneWith: vi.fn(),
}));

vi.mock("@/lib/discovery/mcp-afiliado.server", () => ({
  searchProducts: mocks.searchProducts,
  convertLinks: mocks.convertLinks,
}));
vi.mock("@/lib/import/importer-core", () => ({ importOneWith: mocks.importOneWith }));

type Row = Record<string, unknown>;

function database() {
  const original = "https://shopee.com.br/produto";
  const affiliate = "https://s.shopee.com.br/teste";
  const tables: Record<string, Row[]> = {
    garimpo_runs: [
      {
        id: "run-1",
        status: "running",
        phase: "search",
        updated_at: new Date(Date.now() - 1000).toISOString(),
        cursor: 0,
        plan: [
          { site: "kabum", keyword: "fone", monetized: false },
          { site: "shopee", keyword: "fone", monetized: true },
          { site: "kabum", keyword: "smartwatch", monetized: false },
        ],
        errors: [],
        sources: [
          { fonte: "MCP do Afiliado · kabum", status: "sem comissão" },
          { fonte: "MCP do Afiliado · shopee", status: "com comissão" },
        ],
        candidates: [],
        created_ids: [],
        found: 0,
        discarded: 0,
        discard_reasons: {},
        requests: 0,
        queued: 0,
        duplicates: 0,
        unmonetized: 0,
      },
    ],
    garimpo_settings: [
      {
        id: 1,
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
      },
    ],
    radar_opportunities: [],
    products: [],
    marketplaces: [
      { id: "mk-1", slug: "shopee", is_active: true, allowed_domains: ["shopee.com.br"] },
    ],
    categories: [],
  };

  const from = (name: string) => {
    const table = tables[name];
    if (!table) throw new Error("Tabela inesperada: " + name);
    const predicates: ((row: Row) => boolean)[] = [];
    let patch: Row | undefined;
    let incoming: Row[] | undefined;

    const execute = () => {
      if (incoming) {
        const saved = incoming.map((row) => {
          const existing = table.find(
            (r) =>
              r["marketplace_slug"] === row["marketplace_slug"] &&
              r["external_id"] === row["external_id"],
          );
          if (existing) {
            Object.assign(existing, row);
            return { ...existing };
          }
          const inserted = { ...row, id: "radar-" + (table.length + 1) };
          table.push(inserted);
          return { ...inserted };
        });
        return { data: saved, error: null };
      }
      const selected = table.filter((row) => predicates.every((p) => p(row)));
      if (patch) selected.forEach((row) => Object.assign(row, patch));
      return { data: selected.map((row) => ({ ...row })), error: null };
    };

    const query = {
      select: () => query,
      eq: (key: string, value: unknown) => {
        predicates.push((row) => row[key] === value);
        return query;
      },
      in: (key: string, values: unknown[]) => {
        predicates.push((row) => values.includes(row[key]));
        return query;
      },
      order: () => query,
      update: (value: Row) => {
        patch = value;
        return query;
      },
      upsert: (rows: Row[]) => {
        incoming = rows;
        return query;
      },
      maybeSingle: async () => {
        const result = execute();
        return { data: result.data[0] ?? null, error: null };
      },
      then: (resolve: (value: ReturnType<typeof execute>) => unknown) =>
        Promise.resolve(execute()).then(resolve),
    };
    return query;
  };
  return {
    sb: { from } as unknown as SupabaseClient<Database>,
    tables,
    original,
    affiliate,
  };
}

describe("fluxo integrado do garimpo com serviços simulados", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("isola bloqueio, converte o link correto, cria rascunho e não repete a execução", async () => {
    const { sb, tables, original, affiliate } = database();
    mocks.searchProducts.mockImplementation(async ({ site }: { site: string }) => {
      if (site === "kabum") throw new Error("Proteção anti-bot bloqueou o servidor.");
      const offer = { title: "Fone bluetooth", price_number: 99, url: original, site: "shopee" };
      return [offer, offer];
    });
    mocks.convertLinks.mockResolvedValue(new Map([[original, affiliate]]));
    mocks.importOneWith.mockResolvedValue({ status: "created", productId: "product-1" });

    const result = await stepGarimpo(sb, "run-1", 5000);

    expect(result.busy).toBe(false);
    expect(result.run.status).toBe("partial");
    expect(result.run.phase).toBe("done");
    expect(result.run.queued).toBe(1);
    expect(result.run.found).toBe(1);
    expect(result.run.requests).toBe(3);
    expect(mocks.searchProducts).toHaveBeenCalledTimes(2);
    expect(mocks.convertLinks).toHaveBeenCalledWith([original]);
    expect(mocks.importOneWith).toHaveBeenCalledTimes(1);
    expect(mocks.importOneWith.mock.calls[0]?.[1]).toMatchObject({
      affiliateUrl: affiliate,
      externalId: original,
    });
    expect(mocks.importOneWith.mock.calls[0]?.[2]).toMatchObject({
      publish: false,
      useAi: false,
      garimpoRunId: "run-1",
    });
    expect(tables["radar_opportunities"]).toHaveLength(1);
    await stepGarimpo(sb, "run-1", 5000);
    expect(mocks.importOneWith).toHaveBeenCalledTimes(1);
  });

  it("não cria rascunho quando o link convertido pertence a outra loja", async () => {
    const { sb, original } = database();
    mocks.searchProducts.mockImplementation(async ({ site }: { site: string }) => {
      if (site === "kabum") throw new Error("HTTP 403");
      return [{ title: "Fone", price_number: 99, url: original, site: "shopee" }];
    });
    mocks.convertLinks.mockResolvedValue(new Map([[original, "https://evil.example/produto"]]));

    const result = await stepGarimpo(sb, "run-1", 5000);

    expect(result.run.queued).toBe(0);
    expect(result.run.unmonetized).toBe(1);
    expect(mocks.importOneWith).not.toHaveBeenCalled();
  });
});
