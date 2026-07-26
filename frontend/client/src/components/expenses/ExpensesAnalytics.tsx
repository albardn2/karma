import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";
import { Layers, PieChart, Wallet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiRequest } from "@/lib/queryClient";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  ModeToggle,
  MultiSelect,
  RANGES,
  RangeKey,
  fmtMoney,
  fmtPeriod,
  rangeStart,
} from "@/components/analytics/shared";

/**
 * Colour is keyed by CATEGORY NAME, not by position: the backend orders
 * categories by spend, which shifts as the window changes, so an index-based
 * palette would recolour the whole chart when you switch range.
 */
const CATEGORY_COLORS: Record<string, string> = {
  rent: "hsl(245,58%,57%)",
  electricity: "#f59e0b",
  water: "#0ea5e9",
  maintenance: "#ef4444",
  equipment: "#8b5cf6",
  supplies: "#10b981",
  travel: "#14b8a6",
  meals: "#f97316",
  other: "#6b7280",
};
const FALLBACK_COLORS = ["#64748b", "#a855f7", "#22c55e", "#eab308"];

function colorFor(category: string, idx: number) {
  return CATEGORY_COLORS[category] ?? FALLBACK_COLORS[idx % FALLBACK_COLORS.length];
}

interface OverTime {
  bucket: string;
  currency: string | null;
  currencies: Record<string, number>;
  categories: string[];
  category_totals: Record<string, number>;
  buckets: { period: string; amounts: Record<string, number>; total: number }[];
  total: number;
  paid: number;
  unpaid: number;
  count: number;
}

export function ExpensesAnalytics() {
  const { t, te } = useLanguage();
  const [range, setRange] = useState<RangeKey>("12m");
  const [currency, setCurrency] = useState<string>("");
  const [categorySel, setCategorySel] = useState<string[]>([]);
  const [mode, setMode] = useState<"bar" | "cumulative">("bar");

  const bucket = RANGES[range].bucket;
  const start = rangeStart(range);
  const qs =
    `?bucket=${bucket}` +
    (start ? `&start_date=${start}` : "") +
    (currency ? `&currency=${currency}` : "") +
    (categorySel.length ? `&categories=${categorySel.join(",")}` : "");

  const { data, isError } = useQuery<OverTime>({
    queryKey: ["/expense/analytics/over-time", qs],
    queryFn: () => apiRequest(`/expense/analytics/over-time${qs}`),
  });

  const { data: categories } = useQuery<string[]>({
    queryKey: ["/expense/categories"],
    queryFn: () => apiRequest("/expense/categories"),
  });

  // one row per period, one key per category — recharts stacks the keys, which
  // is what gives each bar its colour-coded breakdown
  const chartData = useMemo(() => {
    const buckets = data?.buckets ?? [];
    const cats = data?.categories ?? [];
    const running: Record<string, number> = {};
    cats.forEach((c) => (running[c] = 0));
    return buckets.map((b) => {
      const row: any = { label: fmtPeriod(b.period, bucket) };
      cats.forEach((c) => {
        const v = b.amounts[c] ?? 0;
        running[c] += v;
        row[c] = mode === "bar" ? v : Math.round(running[c] * 100) / 100;
      });
      row.__total = mode === "bar" ? b.total : Object.values(running).reduce((a, b2) => a + b2, 0);
      return row;
    });
  }, [data, mode, bucket]);

  const cats = data?.categories ?? [];
  const currencyList = Object.keys(data?.currencies ?? {});
  // fall back to the user's pick while the refetch is in flight, otherwise the
  // currency box blanks out for a beat on every switch
  const activeCurrency = data?.currency ?? currency ?? "";

  const categoryBars = useMemo(() => {
    const totals = data?.category_totals ?? {};
    return cats.map((c, i) => ({
      category: c,
      label: te(c),
      value: totals[c] ?? 0,
      pct: data?.total ? ((totals[c] ?? 0) / data.total) * 100 : 0,
      color: colorFor(c, i),
    }));
  }, [cats, data, te]);

  return (
    <div className="space-y-6" data-testid="expenses-analytics">
      {/* filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={range} onValueChange={(v) => setRange(v as RangeKey)}>
          <SelectTrigger className="w-36 h-9" data-testid="expenses-range">
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

        {/* Amounts never sum across currencies, so one is charted at a time. */}
        {currencyList.length > 0 && (
          <Select
            value={activeCurrency}
            onValueChange={(v) => setCurrency(v)}
          >
            <SelectTrigger className="w-28 h-9" data-testid="expenses-currency">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {currencyList.map((c) => (
                <SelectItem key={c} value={c}>
                  {te(c)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <MultiSelect
          label={t("expenses.categoriesFilter")}
          options={(categories ?? []).map((c) => ({ value: c, label: te(c) }))}
          selected={categorySel}
          onChange={setCategorySel}
          t={t}
          testId="expenses-categories"
        />
      </div>

      {/* summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 mb-1">{t("expenses.totalSpend")}</p>
            <p className="text-2xl font-semibold" data-testid="expenses-total">
              {data ? fmtMoney(data.total) : "—"}{" "}
              {data && (
                <span className="text-xs font-normal text-gray-500">
                  {te(activeCurrency)}
                </span>
              )}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 mb-1">{t("expenses.paidOut")}</p>
            <p className="text-2xl font-semibold text-green-700" data-testid="expenses-paid">
              {data ? fmtMoney(data.paid) : "—"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 mb-1">{t("expenses.stillOwed")}</p>
            <p className="text-2xl font-semibold text-amber-700" data-testid="expenses-unpaid">
              {data ? fmtMoney(data.unpaid) : "—"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 mb-1">{t("expenses.entryCount")}</p>
            <p className="text-2xl font-semibold" data-testid="expenses-count">
              {data ? data.count : "—"}
            </p>
            {currencyList.length > 1 && (
              <p className="text-xs text-gray-500">
                {t("expenses.otherCurrencies", {
                  list: currencyList
                    .filter((c) => c !== activeCurrency)
                    .map((c) => `${fmtMoney(data!.currencies[c])} ${c}`)
                    .join(", "),
                })}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* over time — stacked by category in both modes, so the colour
          breakdown survives the switch to cumulative */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Wallet className="w-4 h-4" />
              {t("expenses.overTime")}
            </CardTitle>
            <ModeToggle
              mode={mode}
              onChange={setMode}
              testPrefix="expenses"
              barLabel={t("customers.bars")}
              cumulativeLabel={t("customers.cumulative")}
            />
          </div>
          <p className="text-xs text-gray-500">
            {mode === "bar"
              ? t("expenses.barsNote")
              : t("expenses.cumulativeNote")}
          </p>
        </CardHeader>
        <CardContent>
          {isError ? (
            <p className="text-sm text-red-600 py-12 text-center">{t("common.error")}</p>
          ) : !data ? (
            <p className="text-sm text-gray-400 py-12 text-center">
              {t("common.loading")}
            </p>
          ) : chartData.length === 0 ? (
            <p className="text-sm text-gray-400 py-12 text-center">
              {t("customers.noData")}
            </p>
          ) : (
            <div className="h-80" dir="ltr" data-testid="expenses-chart">
              <ResponsiveContainer width="100%" height="100%" key={mode}>
                {mode === "bar" ? (
                  <BarChart data={chartData} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} width={72} />
                    <Tooltip formatter={(v: any) => fmtMoney(Number(v))} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    {cats.map((c, i) => (
                      <Bar
                        key={c}
                        dataKey={c}
                        name={te(c)}
                        stackId="spend"
                        fill={colorFor(c, i)}
                        isAnimationActive={false}
                      />
                    ))}
                  </BarChart>
                ) : (
                  <AreaChart data={chartData} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} width={72} />
                    <Tooltip formatter={(v: any) => fmtMoney(Number(v))} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    {cats.map((c, i) => (
                      <Area
                        key={c}
                        type="monotone"
                        dataKey={c}
                        name={te(c)}
                        stackId="spend"
                        stroke={colorFor(c, i)}
                        fill={colorFor(c, i)}
                        fillOpacity={0.75}
                        isAnimationActive={false}
                      />
                    ))}
                  </AreaChart>
                )}
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* category breakdown */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Layers className="w-4 h-4" />
            {t("expenses.byCategory")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!data || categoryBars.length === 0 ? (
            <p className="text-sm text-gray-400 py-6 text-center">
              {t("customers.noData")}
            </p>
          ) : (
            <div className="space-y-3" data-testid="expenses-by-category">
              {categoryBars.map((b) => (
                <div key={b.category} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-sm"
                        style={{ backgroundColor: b.color }}
                      />
                      {b.label}
                    </span>
                    <span className="font-medium">
                      {fmtMoney(b.value)}{" "}
                      <span className="text-xs text-gray-500">
                        {b.pct.toFixed(1)}%
                      </span>
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${b.pct}%`, backgroundColor: b.color }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
