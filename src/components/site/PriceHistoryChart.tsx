import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatBRL } from "@/lib/price";
import { buildHistoryChart, type HistoryPoint } from "@/lib/price-history-chart";

const dateLabel = (day: string) => day.split("-").reverse().join("/");

/** Componente visual puro; não consulta banco nem concede acesso ao histórico. */
export function PriceHistoryChart({ points }: { points: HistoryPoint[] }) {
  const data = buildHistoryChart(points);
  const count = data.filter((p) => p.cents !== null).length;
  if (count < 2) {
    return (
      <p className="mt-3 rounded-xl border border-border p-3 text-sm text-muted-foreground">
        {count === 0
          ? "Ainda não há amostras válidas para o gráfico."
          : "Uma amostra registrada. A evolução será exibida a partir da segunda observação."}
      </p>
    );
  }
  return (
    <figure className="my-4 rounded-xl border border-border p-3">
      <h3 className="text-sm font-extrabold text-navy">Evolução dos preços observados</h3>
      <div className="mt-3 h-64 min-w-0" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="day"
              tickFormatter={(day: string) => dateLabel(day).slice(0, 5)}
              minTickGap={30}
              fontSize={11}
            />
            <YAxis
              domain={[0, "auto"]}
              tickFormatter={(value: number) => formatBRL(value)}
              width={94}
              fontSize={10}
            />
            <Tooltip
              labelFormatter={(day) => dateLabel(String(day))}
              formatter={(value) => [formatBRL(Number(value)), "Preço observado"]}
            />
            <Line
              type="linear"
              dataKey="cents"
              name="Preço observado"
              stroke="var(--color-primary, #08163F)"
              strokeWidth={2}
              dot={{ r: 3 }}
              connectNulls={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="mt-2 text-xs text-muted-foreground">
        {count} dias com coleta. Lacunas indicam ausência de amostras, não ausência de estoque.
        Confira os valores e as datas na tabela abaixo.
      </figcaption>
    </figure>
  );
}
