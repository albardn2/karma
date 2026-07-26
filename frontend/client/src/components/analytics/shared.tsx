/**
 * Pieces shared by the analytics sections (customers, warehouse, user).
 *
 * The range/bucket helpers and the per-currency stat tile were duplicated in
 * CustomersAnalytics, WarehouseInventory and TripAnalytics; new analytics UI
 * should import them from here instead of adding another copy.
 */
import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const BRAND = "hsl(245,58%,57%)";
export const SERIES_COLORS = [
  BRAND,
  "#10b981",
  "#f59e0b",
  "#0ea5e9",
  "#ef4444",
  "#8b5cf6",
];

export type RangeKey = "30d" | "90d" | "6m" | "12m" | "all";

export const RANGES: Record<
  RangeKey,
  { days?: number; bucket: "day" | "week" | "month" }
> = {
  "30d": { days: 30, bucket: "day" },
  "90d": { days: 90, bucket: "day" },
  "6m": { days: 182, bucket: "week" },
  "12m": { days: 365, bucket: "month" },
  all: { bucket: "month" },
};

export function rangeStart(range: RangeKey): string | undefined {
  const days = RANGES[range].days;
  if (!days) return undefined;
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export function fmtPeriod(iso: string, bucket: string) {
  const d = new Date(iso);
  if (bucket === "month")
    return d.toLocaleDateString(undefined, { month: "short", year: "2-digit" });
  return d.toLocaleDateString(undefined, { month: "numeric", day: "numeric" });
}

export function fmtDate(v?: string | null) {
  return v ? new Date(v).toLocaleDateString() : "—";
}

export function fmtMoney(v: number) {
  return v.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function useDebounced<T>(value: T, ms = 350): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

/** bar | cumulative segmented toggle */
export function ModeToggle({
  mode,
  onChange,
  testPrefix,
  barLabel,
  cumulativeLabel,
}: {
  mode: "bar" | "cumulative";
  onChange: (m: "bar" | "cumulative") => void;
  testPrefix: string;
  barLabel: string;
  cumulativeLabel: string;
}) {
  return (
    <div className="flex rounded-lg bg-gray-100 p-0.5">
      {(["bar", "cumulative"] as const).map((m) => (
        <button
          key={m}
          onClick={() => onChange(m)}
          data-testid={`${testPrefix}-mode-${m}`}
          className={`px-2.5 py-1 text-xs rounded-md ${
            mode === m
              ? "bg-white shadow font-medium text-gray-900"
              : "text-gray-500"
          }`}
        >
          {m === "bar" ? barLabel : cumulativeLabel}
        </button>
      ))}
    </div>
  );
}

/** Money never sums across currencies, so a tile shows one figure per currency. */
export function CurrencyStat({
  title,
  byCurrency,
  testId,
  te,
  accent,
  pending,
}: {
  title: string;
  byCurrency: Record<string, number>;
  testId: string;
  te: (k: string) => string;
  accent?: string;
  /** data not in yet — show a dash instead of asserting a zero balance */
  pending?: boolean;
}) {
  const entries = Object.entries(byCurrency || {}).filter(([, v]) => v !== 0);
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-gray-500 mb-1">{title}</p>
        {pending ? (
          <p className="text-2xl font-semibold text-gray-300" data-testid={testId}>
            —
          </p>
        ) : entries.length === 0 ? (
          <p className="text-2xl font-semibold" data-testid={testId}>
            0
          </p>
        ) : (
          entries.map(([cur, amount]) => (
            <p
              key={cur}
              className={`text-2xl font-semibold ${accent ?? ""}`}
              data-testid={`${testId}-${cur}`}
            >
              {fmtMoney(amount)}{" "}
              <span className="text-xs font-normal text-gray-500">{te(cur)}</span>
            </p>
          ))
        )}
      </CardContent>
    </Card>
  );
}

export function MultiSelect({
  label,
  options,
  selected,
  onChange,
  searchable,
  t,
  testId,
  align = "start",
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (next: string[]) => void;
  searchable?: boolean;
  t: (k: string) => string;
  testId?: string;
  align?: "start" | "end";
}) {
  const [search, setSearch] = useState("");
  const visible = search
    ? options.filter((o) =>
        o.label.toLowerCase().includes(search.toLowerCase())
      )
    : options;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1" data-testid={testId}>
          {label}
          {selected.length > 0 && (
            <Badge variant="secondary" className="ms-1 px-1.5">
              {selected.length}
            </Badge>
          )}
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align={align} className="w-64 p-2">
        {searchable && (
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("common.search")}
            className="mb-2 h-8"
          />
        )}
        <div className="max-h-56 overflow-y-auto space-y-1">
          {visible.map((o) => (
            <label
              key={o.value}
              className="flex items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-gray-50 cursor-pointer"
            >
              <Checkbox
                checked={selected.includes(o.value)}
                onCheckedChange={(c) =>
                  onChange(
                    c
                      ? [...selected, o.value]
                      : selected.filter((v) => v !== o.value)
                  )
                }
              />
              <span className="truncate">{o.label}</span>
            </label>
          ))}
          {visible.length === 0 && (
            <p className="px-1.5 py-2 text-xs text-gray-400">—</p>
          )}
        </div>
        {selected.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-1 w-full h-7 text-xs"
            onClick={() => onChange([])}
          >
            {t("common.clear")}
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
