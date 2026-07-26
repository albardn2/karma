import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";
import { Boxes, ChevronDown, LineChart as LineChartIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/queryClient";
import { useLanguage } from "@/contexts/LanguageContext";
import { AddInventoryToWarehouseDialog } from "@/components/warehouses/AddInventoryToWarehouseDialog";

type RangeKey = "30d" | "90d" | "6m" | "12m" | "all";

const RANGES: Record<RangeKey, { days?: number; bucket: "day" | "week" | "month" }> = {
  "30d": { days: 30, bucket: "day" },
  "90d": { days: 90, bucket: "day" },
  "6m": { days: 182, bucket: "week" },
  "12m": { days: 365, bucket: "month" },
  all: { bucket: "month" },
};

// distinct hues so several materials stay readable on one chart
const COLORS = [
  "hsl(245,58%,57%)",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#0ea5e9",
  "#8b5cf6",
  "#14b8a6",
  "#f97316",
];

interface StateItem {
  material_uuid: string;
  material_name: string;
  sku?: string;
  unit?: string;
  quantity: number;
  lots: number;
  last_event_at?: string | null;
}

function rangeStart(range: RangeKey): string | undefined {
  const days = RANGES[range].days;
  if (!days) return undefined;
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function fmtPeriod(iso: string, bucket: string) {
  const d = new Date(iso);
  if (bucket === "month")
    return d.toLocaleDateString(undefined, { month: "short", year: "2-digit" });
  return d.toLocaleDateString(undefined, { month: "numeric", day: "numeric" });
}

function fmtQty(v: number) {
  return v.toLocaleString(undefined, { maximumFractionDigits: 3 });
}

export function WarehouseInventory({
  warehouseUuid,
  warehouseName,
}: {
  warehouseUuid: string;
  warehouseName?: string;
}) {
  const { t, te } = useLanguage();
  const [range, setRange] = useState<RangeKey>("12m");
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState("");

  const bucket = RANGES[range].bucket;
  const start = rangeStart(range);

  const {
    data: state,
    isError: stateError,
    error: stateErrorObj,
  } = useQuery<{
    items: StateItem[];
    total_count: number;
  }>({
    // keyed under "/inventory/" on purpose: the app's inventory and
    // inventory-event mutations invalidate that prefix, so posting a movement
    // refreshes these numbers instead of leaving them stale for staleTime
    queryKey: ["/inventory/", "analytics/warehouse-state", warehouseUuid],
    queryFn: () =>
      apiRequest(
        `/inventory/analytics/warehouse-state?warehouse_uuid=${warehouseUuid}`
      ),
  });

  // With nothing selected, chart only the largest-stock material: units AND
  // magnitudes differ per material (18,660 pcs next to 20 kg), so stacking
  // several on one axis flattens the smaller ones into the floor.
  const overTimeQs =
    `?warehouse_uuid=${warehouseUuid}&bucket=${bucket}` +
    (start ? `&start_date=${start}` : "") +
    (selected.length ? `&material_uuids=${selected.join(",")}` : "&top_n=1");
  const { data: overTime, isError: chartError } = useQuery<any>({
    queryKey: ["/inventory/", "analytics/warehouse-over-time", overTimeQs],
    queryFn: () => apiRequest(`/inventory/analytics/warehouse-over-time${overTimeQs}`),
  });

  // accumulate each material's signed deltas onto its pre-window baseline, then
  // pivot to one row per period for recharts
  const { chartData, lines } = useMemo(() => {
    const series = overTime?.series ?? [];
    const periods = new Set<string>();
    series.forEach((s: any) =>
      (s.buckets ?? []).forEach((b: any) => periods.add(b.period))
    );
    // A stock LEVEL persists whether or not anything moved. Extend the line to
    // now, and when nothing moved at all in the window anchor it at the window
    // start so it still draws a flat line at the real level instead of nothing.
    // (The start anchor is only added when there are no buckets: date_trunc
    // snaps a real bucket to the START of its period, which can precede the
    // window start and would sort ahead of the anchor.)
    if (series.length > 0) {
      if (periods.size === 0 && start) periods.add(`${start}T00:00:00`);
      periods.add(new Date().toISOString());
    }
    const ordered = Array.from(periods).sort();
    const rows = ordered.map((p) => ({ period: p, label: fmtPeriod(p, bucket) }));
    const seriesLines: { key: string; name: string; unit?: string }[] = [];
    series.forEach((s: any, idx: number) => {
      const key = `m${idx}`;
      seriesLines.push({ key, name: s.material_name ?? "?", unit: s.unit });
      const deltas = new Map<string, number>(
        (s.buckets ?? []).map((b: any) => [b.period, b.delta])
      );
      let level = s.baseline ?? 0;
      rows.forEach((row: any) => {
        level += deltas.get(row.period) ?? 0;
        row[key] = Math.round(level * 1000) / 1000;
      });
    });
    return { chartData: rows, lines: seriesLines };
  }, [overTime, bucket]);

  // These endpoints require inventory read access, which a warehouse-only user
  // may not have. Hide the sections rather than parking two red error cards on
  // their warehouse page.
  const forbidden = /^403/.test((stateErrorObj as any)?.message ?? "");
  if (forbidden) return null;

  const items = state?.items ?? [];
  const visibleOptions = search
    ? items.filter((i) =>
        i.material_name?.toLowerCase().includes(search.toLowerCase())
      )
    : items;

  return (
    <div className="mt-6 space-y-6" data-testid="warehouse-inventory">
      {/* current stock */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2">
              <Boxes className="h-5 w-5" />
              {t("warehouses.currentInventory")}
              {state && (
                <Badge variant="secondary" className="ms-1">
                  {state.total_count}
                </Badge>
              )}
            </CardTitle>
            <AddInventoryToWarehouseDialog
              warehouseUuid={warehouseUuid}
              warehouseName={warehouseName}
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table data-testid="warehouse-inventory-table">
              <TableHeader>
                <TableRow>
                  <TableHead>{t("materials.materialName")}</TableHead>
                  <TableHead>{t("materials.sku")}</TableHead>
                  <TableHead className="text-end">{t("warehouses.quantity")}</TableHead>
                  <TableHead>{t("warehouses.unit")}</TableHead>
                  <TableHead className="text-end">{t("warehouses.lots")}</TableHead>
                  <TableHead>{t("warehouses.lastMovement")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stateError ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-red-600 py-8">
                      {t("common.error")}
                    </TableCell>
                  </TableRow>
                ) : !state ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-gray-400 py-8">
                      {t("common.loading")}
                    </TableCell>
                  </TableRow>
                ) : items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-gray-400 py-8">
                      {t("warehouses.noInventory")}
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((i) => (
                    <TableRow key={i.material_uuid} className="hover:bg-gray-50">
                      <TableCell className="font-medium">{i.material_name}</TableCell>
                      <TableCell className="text-xs text-gray-500">
                        {i.sku || "—"}
                      </TableCell>
                      <TableCell
                        className={`text-end font-medium ${
                          i.quantity < 0 ? "text-red-600" : ""
                        }`}
                      >
                        {fmtQty(i.quantity)}
                      </TableCell>
                      <TableCell className="text-xs text-gray-500">
                        {i.unit ? te(i.unit) : "—"}
                      </TableCell>
                      <TableCell className="text-end">{i.lots}</TableCell>
                      <TableCell className="text-xs text-gray-500">
                        {i.last_event_at
                          ? new Date(i.last_event_at).toLocaleDateString()
                          : "—"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* stock over time */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2">
              <LineChartIcon className="h-5 w-5" />
              {t("warehouses.inventoryOverTime")}
            </CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1"
                    data-testid="inventory-material-filter"
                  >
                    {t("customers.materialsFilter")}
                    {selected.length > 0 && (
                      <Badge variant="secondary" className="ms-1 px-1.5">
                        {selected.length}
                      </Badge>
                    )}
                    <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-64 p-2">
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={t("common.search")}
                    className="mb-2 h-8"
                  />
                  <div className="max-h-56 overflow-y-auto space-y-1">
                    {visibleOptions.map((i) => (
                      <label
                        key={i.material_uuid}
                        className="flex items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-gray-50 cursor-pointer"
                      >
                        <Checkbox
                          checked={selected.includes(i.material_uuid)}
                          onCheckedChange={(c) =>
                            setSelected(
                              c
                                ? [...selected, i.material_uuid]
                                : selected.filter((v) => v !== i.material_uuid)
                            )
                          }
                        />
                        <span className="truncate">{i.material_name}</span>
                      </label>
                    ))}
                    {visibleOptions.length === 0 && (
                      <p className="px-1.5 py-2 text-xs text-gray-400">—</p>
                    )}
                  </div>
                  {selected.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-1 w-full h-7 text-xs"
                      onClick={() => setSelected([])}
                    >
                      {t("common.clear")}
                    </Button>
                  )}
                </PopoverContent>
              </Popover>
              <Select value={range} onValueChange={(v) => setRange(v as RangeKey)}>
                <SelectTrigger className="w-32 h-9" data-testid="inventory-range">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="30d">{t("dashboard.range30")}</SelectItem>
                  <SelectItem value="90d">{t("dashboard.range90")}</SelectItem>
                  <SelectItem value="6m">{t("customers.range6m")}</SelectItem>
                  <SelectItem value="12m">{t("customers.range12m")}</SelectItem>
                  <SelectItem value="all">{t("customers.rangeAll")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-xs text-gray-500">
            {selected.length === 0
              ? t("warehouses.topMaterialsNote")
              : t("warehouses.perMaterialNote")}
          </p>
        </CardHeader>
        <CardContent>
          {chartError ? (
            <p className="text-sm text-red-600 py-8 text-center">{t("common.error")}</p>
          ) : !overTime ? (
            <p className="text-sm text-gray-400 py-8 text-center">
              {t("common.loading")}
            </p>
          ) : chartData.length === 0 ? (
            <p className="text-sm text-gray-400 py-8 text-center">
              {t("customers.noData")}
            </p>
          ) : (
            <div className="h-80" dir="ltr" data-testid="inventory-chart">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {lines.map((l, idx) => (
                    <Line
                      key={l.key}
                      type="monotone"
                      dataKey={l.key}
                      // units differ per material, so label each line with its own
                      name={l.unit ? `${l.name} (${l.unit})` : l.name}
                      stroke={COLORS[idx % COLORS.length]}
                      strokeWidth={2}
                      dot={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
