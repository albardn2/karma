// Renders a chart spec produced by the assistant's `show_chart` tool
// (backend/assistant/charts.py) with recharts, the library the dashboards use.
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ChartSpec, MapSpec } from "@/lib/assistant";
import { AssistantMap } from "./AssistantMap";

const COLORS = ["#2563eb", "#16a34a", "#f59e0b", "#dc2626", "#7c3aed", "#0891b2", "#db2777", "#65a30d"];

const compact = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 });
const full = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
const fmt = (v: unknown) => (typeof v === "number" ? full.format(v) : String(v ?? "—"));

function Footer({ spec }: { spec: ChartSpec }) {
  const src = spec.source;
  return (
    <div className="px-1 pt-1 text-[10px] text-muted-foreground space-y-0.5">
      {spec.note && <div dir="auto">{spec.note}</div>}
      <div>
        {src.kind === "query"
          ? `From Karma: ${src.endpoint?.replace("__", " · ").replace(/_/g, " ")} — ${src.rows_matched} records${src.truncated ? " (fetch limit reached)" : ""}`
          : "Figures combined by the assistant from the results above"}
        {spec.truncated ? " · showing part of the data" : ""}
      </div>
    </div>
  );
}

// Two-dimensional grid: rows = series, columns = labels, colour = value.
function Heatmap({ spec }: { spec: ChartSpec }) {
  const all = spec.series.flatMap((s) => s.values).filter((v): v is number => typeof v === "number");
  const max = all.length ? Math.max(...all) : 0;
  const min = all.length ? Math.min(0, ...all) : 0;
  const unit = spec.unit ? ` ${spec.unit}` : "";
  const shade = (v: number | null) => {
    if (v === null || v === undefined || max === min) return "transparent";
    const t = (v - min) / (max - min);
    return `rgba(37, 99, 235, ${0.08 + 0.87 * t})`;
  };
  return (
    <figure data-testid="assistant-heatmap" className="my-2 rounded-lg border bg-card p-2">
      <figcaption className="px-1 pb-1 text-xs font-semibold" dir="auto">
        {spec.title}
        {spec.unit ? <span className="font-normal text-muted-foreground"> · {spec.unit}</span> : null}
      </figcaption>
      <div className="overflow-x-auto" dir="ltr">
        <table className="border-separate border-spacing-[2px] text-[10px]">
          <thead>
            <tr>
              <th />
              {spec.labels.map((l) => (
                <th key={l} className="px-0.5 font-normal text-muted-foreground whitespace-nowrap" style={{ writingMode: spec.labels.length > 12 ? "vertical-rl" : undefined }}>
                  {l}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {spec.series.map((s) => (
              <tr key={s.name}>
                <th className="pe-1.5 text-end font-normal text-muted-foreground whitespace-nowrap max-w-[110px] truncate" dir="auto" title={s.name}>
                  {s.name}
                </th>
                {s.values.map((v, i) => (
                  <td
                    key={i}
                    title={`${s.name} × ${spec.labels[i]}: ${v === null ? "—" : fmt(v)}${unit}`}
                    className="h-6 min-w-[22px] rounded-sm text-center tabular-nums"
                    style={{ background: shade(v), color: v !== null && max !== min && (v - min) / (max - min) > 0.55 ? "white" : undefined }}
                  >
                    {v ? compact.format(v) : ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Footer spec={spec} />
    </figure>
  );
}

export function AssistantChart({ spec, tall }: { spec: ChartSpec; tall?: boolean }) {
  if (spec.type === "map") return <AssistantMap spec={spec as unknown as MapSpec} tall={tall} />;
  if (spec.type === "heatmap") return <Heatmap spec={spec} />;
  // recharts wants rows: { label, [series]: value }
  const rows = spec.labels.map((label, i) => {
    const row: Record<string, string | number | null> = { label };
    spec.series.forEach((s) => (row[s.name] = s.values[i] ?? null));
    return row;
  });
  const horizontal = spec.type === "horizontal_bar";
  const height = tall ? 340 : horizontal ? Math.min(420, 40 + spec.labels.length * 26) : 230;
  const multi = spec.series.length > 1;
  const unit = spec.unit ? ` ${spec.unit}` : "";
  const tooltip = (
    <Tooltip
      formatter={(v: unknown, name: string) => [`${fmt(v)}${unit}`, name]}
      contentStyle={{ fontSize: 12, borderRadius: 8 }}
    />
  );
  const axisTick = { fontSize: 11 };
  const xAxis = <XAxis dataKey="label" tick={axisTick} interval="preserveStartEnd" minTickGap={8} />;
  const yAxis = <YAxis tick={axisTick} tickFormatter={(v) => compact.format(v)} width={44} />;
  const grid = <CartesianGrid strokeDasharray="3 3" opacity={0.4} />;
  const legend = multi ? <Legend wrapperStyle={{ fontSize: 11 }} /> : null;

  let chart: JSX.Element;
  switch (spec.type) {
    case "line":
      chart = (
        <LineChart data={rows}>
          {grid}
          {xAxis}
          {yAxis}
          {tooltip}
          {legend}
          {spec.series.map((s, i) => (
            <Line key={s.name} type="monotone" dataKey={s.name} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={rows.length <= 24} connectNulls />
          ))}
        </LineChart>
      );
      break;
    case "area":
      chart = (
        <AreaChart data={rows}>
          {grid}
          {xAxis}
          {yAxis}
          {tooltip}
          {legend}
          {spec.series.map((s, i) => (
            <Area key={s.name} type="monotone" dataKey={s.name} stroke={COLORS[i % COLORS.length]} fill={COLORS[i % COLORS.length]} fillOpacity={0.25} connectNulls />
          ))}
        </AreaChart>
      );
      break;
    case "pie": {
      const s = spec.series[0];
      const data = spec.labels.map((label, i) => ({ name: label, value: s.values[i] ?? 0 }));
      chart = (
        <PieChart>
          {tooltip}
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Pie data={data} dataKey="value" nameKey="name" outerRadius="75%" innerRadius="40%" paddingAngle={1}>
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
        </PieChart>
      );
      break;
    }
    case "horizontal_bar":
      chart = (
        <BarChart data={rows} layout="vertical" margin={{ left: 8 }}>
          {grid}
          <XAxis type="number" tick={axisTick} tickFormatter={(v) => compact.format(v)} />
          <YAxis type="category" dataKey="label" tick={axisTick} width={110} interval={0} />
          {tooltip}
          {legend}
          {spec.series.map((s, i) => (
            <Bar key={s.name} dataKey={s.name} fill={COLORS[i % COLORS.length]} radius={[0, 3, 3, 0]} />
          ))}
        </BarChart>
      );
      break;
    default: // bar, stacked_bar
      chart = (
        <BarChart data={rows}>
          {grid}
          {xAxis}
          {yAxis}
          {tooltip}
          {legend}
          {spec.series.map((s, i) => (
            <Bar
              key={s.name}
              dataKey={s.name}
              fill={COLORS[i % COLORS.length]}
              stackId={spec.type === "stacked_bar" ? "a" : undefined}
              radius={spec.type === "stacked_bar" ? undefined : [3, 3, 0, 0]}
            />
          ))}
        </BarChart>
      );
  }

  const src = spec.source;
  return (
    <figure data-testid="assistant-chart" className="my-2 rounded-lg border bg-card p-2">
      <figcaption className="px-1 pb-1 text-xs font-semibold" dir="auto">
        {spec.title}
        {spec.unit ? <span className="font-normal text-muted-foreground"> · {spec.unit}</span> : null}
      </figcaption>
      <div style={{ height }} dir="ltr">
        <ResponsiveContainer width="100%" height="100%">
          {chart}
        </ResponsiveContainer>
      </div>
      <div className="px-1 pt-1 text-[10px] text-muted-foreground space-y-0.5">
        {spec.note && <div dir="auto">{spec.note}</div>}
        <div>
          {src.kind === "query"
            ? `From Karma: ${src.endpoint?.replace("__", " · ").replace(/_/g, " ")} — ${src.rows_matched} records${src.truncated ? " (fetch limit reached)" : ""}`
            : "Figures combined by the assistant from the results above"}
          {spec.truncated ? " · showing the first 60 points" : ""}
        </div>
      </div>
    </figure>
  );
}
