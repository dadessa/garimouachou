import { describe, expect, it } from "vitest";
import { buildHistoryChart } from "./price-history-chart";

const point = (day: string, cents: number, hour = "12") => ({
  day,
  cents,
  at: day + "T" + hour + ":00:00Z",
});

describe("gráfico de histórico de preços", () => {
  it("preserva datas e não inventa preço nos dias sem amostras", () => {
    expect(buildHistoryChart([point("2026-11-25", 10000), point("2026-11-23", 12000)])).toEqual([
      { day: "2026-11-23", cents: 12000 },
      { day: "2026-11-24", cents: null },
      { day: "2026-11-25", cents: 10000 },
    ]);
  });

  it("usa somente a última observação de cada dia", () => {
    const series = buildHistoryChart([
      point("2026-11-25", 10000, "12"),
      point("2026-11-25", 9000, "13"),
    ]);
    expect(series).toEqual([{ day: "2026-11-25", cents: 9000 }]);
  });

  it("descarta preços e datas inválidos", () => {
    expect(
      buildHistoryChart([point("2026-02-30", 100), point("2026-11-25", 0)]),
    ).toEqual([]);
  });

  it("limita o eixo a 180 dias", () => {
    const series = buildHistoryChart([point("2025-01-01", 100), point("2026-11-25", 200)]);
    expect(series).toHaveLength(180);
    expect(series.at(-1)).toEqual({ day: "2026-11-25", cents: 200 });
  });
});
