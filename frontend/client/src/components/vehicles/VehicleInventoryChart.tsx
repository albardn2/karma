import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest } from "@/lib/queryClient";

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const PRESETS: { value: string; label: string; ms?: number }[] = [
  { value: "all", label: "All time" },
  { value: "15m", label: "Last 15 minutes", ms: 15 * MIN },
  { value: "30m", label: "Last 30 minutes", ms: 30 * MIN },
  { value: "1h", label: "Last 1 hour", ms: HOUR },
  { value: "6h", label: "Last 6 hours", ms: 6 * HOUR },
  { value: "12h", label: "Last 12 hours", ms: 12 * HOUR },
  { value: "24h", label: "Last 24 hours", ms: DAY },
  { value: "7d", label: "Last 7 days", ms: 7 * DAY },
  { value: "30d", label: "Last 30 days", ms: 30 * DAY },
  { value: "90d", label: "Last 90 days", ms: 90 * DAY },
  { value: "custom", label: "Custom range" },
];
const PRESET_MS: Record<string, number> = Object.fromEntries(
  PRESETS.filter((p) => p.ms).map((p) => [p.value, p.ms as number])
);

interface VehicleInventory {
  uuid: string;
  material_uuid: string;
  material_name?: string | null;
  unit?: string | null;
}

interface VInvEvent {
  created_at: string;
  quantity: number;
}

const PALETTE = [
  "#5469D4", "#16a34a", "#dc2626", "#d97706", "#7c3aed",
  "#0891b2", "#db2777", "#65a30d", "#0ea5e9", "#9333ea",
];

// Backend timestamps are naive UTC ("2026-06-30T11:01:10.9"); parse them as UTC,
// not local time, so they don't drift relative to Date.now().
const toMs = (s: string) => {
  const hasTz = /[zZ]|[+-]\d{2}:?\d{2}$/.test(s);
  return new Date(hasTz ? s : s + "Z").getTime();
};

export function VehicleInventoryChart({ vehicleUuid }: { vehicleUuid: string }) {
  const [preset, setPreset] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data: invData } = useQuery({
    queryKey: ["/vehicle-inventory/", vehicleUuid, "chart"],
    queryFn: async () => apiRequest(`/vehicle-inventory/?vehicle_uuid=${vehicleUuid}&per_page=100`),
  });
  const inventories: VehicleInventory[] = invData?.vehicle_inventories || [];

  // default: all materials selected (once they load)
  useEffect(() => {
    if (inventories.length && selected.size === 0) {
      setSelected(new Set(inventories.map((i) => i.uuid)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invData]);

  const invUuids = inventories.map((i) => i.uuid).sort().join(",");
  const { data: eventsByInv } = useQuery<Record<string, VInvEvent[]>>({
    queryKey: ["/vehicle-inventory-event/series", vehicleUuid, invUuids],
    queryFn: async () => {
      const entries = await Promise.all(
        inventories.map(async (inv) => {
          const res = await apiRequest(
            `/vehicle-inventory-event/?vehicle_inventory_uuid=${inv.uuid}&per_page=100`
          );
          const events: VInvEvent[] = (res?.events || [])
            .slice()
            .sort((a: VInvEvent, b: VInvEvent) => toMs(a.created_at) - toMs(b.created_at));
          return [inv.uuid, events] as const;
        })
      );
      return Object.fromEntries(entries);
    },
    enabled: inventories.length > 0,
  });

  const { rows, lines } = useMemo(() => {
    if (!inventories.length || !eventsByInv) return { rows: [] as any[], lines: [] as any[] };

    const now = Date.now();
    let startMs: number;
    let endMs: number;
    if (preset === "custom") {
      startMs = startDate ? new Date(startDate + "T00:00:00Z").getTime() : -Infinity;
      endMs = endDate ? new Date(endDate + "T23:59:59Z").getTime() : now;
    } else if (preset === "all") {
      startMs = -Infinity;
      endMs = now;
    } else {
      startMs = now - (PRESET_MS[preset] || 0);
      endMs = now;
    }

    const shown = inventories.filter((i) => selected.has(i.uuid));

    // running balance points per material
    const cum: Record<string, { t: number; bal: number }[]> = {};
    const times = new Set<number>();
    for (const inv of shown) {
      const evs = eventsByInv[inv.uuid] || [];
      let bal = 0;
      const pts: { t: number; bal: number }[] = [];
      for (const e of evs) {
        bal += e.quantity;
        const t = toMs(e.created_at);
        pts.push({ t, bal });
        if (t >= startMs && t <= endMs) times.add(t);
      }
      cum[inv.uuid] = pts;
    }

    const sortedTimes = Array.from(times).sort((a, b) => a - b);
    const lo = isFinite(startMs) ? startMs : sortedTimes[0];
    const axis =
      lo === undefined
        ? []
        : Array.from(new Set([lo, ...sortedTimes.filter((t) => t >= lo && t <= endMs), endMs])).sort(
            (a, b) => a - b
          );

    const balAt = (pts: { t: number; bal: number }[], t: number) => {
      let b = 0;
      for (const p of pts) {
        if (p.t <= t) b = p.bal;
        else break;
      }
      return b;
    };

    const rows = axis.map((t) => {
      const row: Record<string, number> = { t };
      for (const inv of shown) row[inv.uuid] = balAt(cum[inv.uuid] || [], t);
      return row;
    });

    const lines = shown.map((inv, i) => ({
      key: inv.uuid,
      name: inv.material_name || inv.material_uuid,
      color: PALETTE[i % PALETTE.length],
    }));

    return { rows, lines };
  }, [inventories, eventsByInv, selected, preset, startDate, endDate]);

  const toggle = (uuid: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(uuid) ? next.delete(uuid) : next.add(uuid);
      return next;
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Inventory Over Time</CardTitle>
      </CardHeader>
      <CardContent>
        {/* Filters */}
        <div className="flex flex-wrap items-end gap-4 mb-4">
          <div>
            <label className="text-sm font-medium text-gray-500 mb-1 block">Range</label>
            <Select value={preset} onValueChange={setPreset}>
              <SelectTrigger className="w-48" data-testid="select-vinv-chart-range">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRESETS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {preset === "custom" && (
            <>
              <div>
                <label className="text-sm font-medium text-gray-500 mb-1 block">From</label>
                <Input
                  type="date"
                  className="w-44"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  data-testid="input-vinv-chart-start"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500 mb-1 block">To</label>
                <Input
                  type="date"
                  className="w-44"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  data-testid="input-vinv-chart-end"
                />
              </div>
            </>
          )}
        </div>

        {/* Material toggles */}
        {inventories.length > 0 && (
          <div className="flex flex-wrap gap-3 mb-4">
            {inventories.map((inv, i) => (
              <label key={inv.uuid} className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={selected.has(inv.uuid)}
                  onChange={() => toggle(inv.uuid)}
                />
                <span
                  className="inline-block w-3 h-3 rounded-sm"
                  style={{ backgroundColor: PALETTE[i % PALETTE.length] }}
                />
                {inv.material_name || inv.material_uuid}
              </label>
            ))}
          </div>
        )}

        {/* Chart */}
        {inventories.length === 0 ? (
          <div className="text-sm text-gray-500 py-12 text-center">
            No inventory on this vehicle yet.
          </div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-gray-500 py-12 text-center">
            No inventory events in this range.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={340}>
            <LineChart data={rows} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="t"
                type="number"
                scale="time"
                domain={["dataMin", "dataMax"]}
                tickFormatter={(t) => new Date(t).toLocaleDateString()}
                fontSize={12}
              />
              <YAxis allowDecimals fontSize={12} />
              <Tooltip
                labelFormatter={(t) => new Date(t as number).toLocaleString()}
                formatter={(value: any, name: any) => [value, name]}
              />
              <Legend />
              {lines.map((l) => (
                <Line
                  key={l.key}
                  type="stepAfter"
                  dataKey={l.key}
                  name={l.name}
                  stroke={l.color}
                  dot={false}
                  strokeWidth={2}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
