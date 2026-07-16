import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiRequest } from "@/lib/queryClient";

interface SeriesEvent {
  t: string | null;
  quantity: number;
}

interface InventoryLot {
  uuid: string;
  lot_id?: string | null;
  warehouse_name?: string | null;
  current_quantity?: number | null;
  cost_per_unit?: number | null;
  currency?: string | null;
  unit?: string | null;
  created_at?: string | null;
  expiration_date?: string | null;
}

// backend timestamps are naive UTC — parse as UTC (same convention as the
// vehicle inventory chart)
const toMs = (s: string) => {
  const hasTz = /[zZ]|[+-]\d{2}:?\d{2}$/.test(s);
  return new Date(hasTz ? s : s + "Z").getTime();
};

const fmt = (n: number) =>
  n.toLocaleString(undefined, { maximumFractionDigits: 2 });

const DAY = 24 * 60 * 60 * 1000;

export function MaterialInventorySection({ materialUuid }: { materialUuid: string }) {
  const { data: summary } = useQuery<{ events: SeriesEvent[]; lots: InventoryLot[] }>({
    queryKey: ["/material/", materialUuid, "inventory-summary"],
    queryFn: () => apiRequest(`/material/${materialUuid}/inventory-summary`),
    enabled: !!materialUuid,
  });

  // cumulative total-stock series
  const chartRows = useMemo(() => {
    const events = (summary?.events || []).filter((e) => e.t);
    let bal = 0;
    return events.map((e) => {
      bal += e.quantity || 0;
      return { t: toMs(e.t as string), total: Math.round(bal * 100) / 100 };
    });
  }, [summary]);

  // lots come pre-filtered from the API: only lots with remaining stock
  const lots: InventoryLot[] = summary?.lots || [];

  // weighted average cost per currency over remaining stock
  const avgCost = useMemo(() => {
    const acc: Record<string, { qty: number; value: number }> = {};
    for (const l of lots) {
      if (l.cost_per_unit == null) continue;
      const cur = l.currency || "?";
      (acc[cur] ||= { qty: 0, value: 0 });
      acc[cur].qty += l.current_quantity || 0;
      acc[cur].value += (l.current_quantity || 0) * l.cost_per_unit;
    }
    return Object.entries(acc)
      .filter(([, v]) => v.qty > 0)
      .map(([cur, v]) => ({ currency: cur, avg: v.value / v.qty, qty: v.qty, value: v.value }));
  }, [lots]);

  const spanMs = chartRows.length ? chartRows[chartRows.length - 1].t - chartRows[0].t : 0;
  const tickFmt = (t: number) =>
    spanMs <= 2 * DAY
      ? new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : new Date(t).toLocaleDateString();

  const fmtDate = (s?: string | null) => (s ? new Date(s).toLocaleDateString() : "—");

  return (
    <div className="mt-6 space-y-6">
      {/* total stock over time */}
      <Card>
        <CardHeader>
          <CardTitle>Total Inventory Over Time</CardTitle>
        </CardHeader>
        <CardContent>
          {chartRows.length === 0 ? (
            <p className="text-sm text-gray-500 py-8 text-center" data-testid="material-series-empty">
              No inventory events for this material yet.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartRows} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="t"
                  type="number"
                  scale="time"
                  domain={["dataMin", "dataMax"]}
                  tickFormatter={tickFmt}
                  fontSize={12}
                />
                <YAxis allowDecimals fontSize={12} />
                <Tooltip
                  labelFormatter={(t) => new Date(t as number).toLocaleString()}
                  formatter={(v: any) => [fmt(v as number), "Total stock"]}
                />
                <Line
                  type="stepAfter"
                  dataKey="total"
                  stroke="#5469D4"
                  dot={false}
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* cost per lot */}
      <Card>
        <CardHeader>
          <CardTitle>Inventory Lots &amp; Cost</CardTitle>
        </CardHeader>
        <CardContent>
          {lots.length === 0 ? (
            <p className="text-sm text-gray-500 py-8 text-center" data-testid="material-lots-empty">
              No lots with remaining stock.
            </p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-testid="table-material-lots">
                  <thead>
                    <tr className="text-left text-gray-500 border-b">
                      <th className="py-2 pr-4 font-medium">Lot</th>
                      <th className="py-2 pr-4 font-medium">Warehouse</th>
                      <th className="py-2 pr-4 font-medium text-right">On hand</th>
                      <th className="py-2 pr-4 font-medium">Unit</th>
                      <th className="py-2 pr-4 font-medium text-right">Cost / unit</th>
                      <th className="py-2 pr-4 font-medium text-right">Stock value</th>
                      <th className="py-2 pr-4 font-medium">Received</th>
                      <th className="py-2 font-medium">Expires</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lots.map((l) => (
                      <tr key={l.uuid} className="border-b last:border-0" data-testid={`row-lot-${l.uuid}`}>
                        <td className="py-2 pr-4 font-mono text-xs">{l.lot_id || l.uuid.slice(0, 8)}</td>
                        <td className="py-2 pr-4">{l.warehouse_name || "—"}</td>
                        <td className="py-2 pr-4 text-right font-semibold tabular-nums">
                          {fmt(l.current_quantity || 0)}
                        </td>
                        <td className="py-2 pr-4 text-gray-500">{l.unit || "—"}</td>
                        <td className="py-2 pr-4 text-right tabular-nums">
                          {l.cost_per_unit != null ? `${fmt(l.cost_per_unit)} ${l.currency || ""}` : "—"}
                        </td>
                        <td className="py-2 pr-4 text-right tabular-nums">
                          {l.cost_per_unit != null
                            ? `${fmt((l.current_quantity || 0) * l.cost_per_unit)} ${l.currency || ""}`
                            : "—"}
                        </td>
                        <td className="py-2 pr-4 whitespace-nowrap">{fmtDate(l.created_at)}</td>
                        <td className="py-2 whitespace-nowrap">{fmtDate(l.expiration_date)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* weighted average cost of remaining stock */}
              <div className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-sm" data-testid="material-avg-cost">
                {avgCost.length === 0 ? (
                  <span className="text-gray-500">No cost data on remaining lots.</span>
                ) : (
                  avgCost.map((a) => (
                    <span key={a.currency} className="text-gray-600">
                      Avg cost ({a.currency}):{" "}
                      <b data-testid={`avg-cost-${a.currency}`}>{fmt(a.avg)}</b>
                      <span className="text-gray-400"> · {fmt(a.qty)} on hand · value {fmt(a.value)}</span>
                    </span>
                  ))
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
