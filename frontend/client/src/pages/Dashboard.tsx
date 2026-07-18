import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";

interface SeriesPoint {
  t: string; // "YYYY-MM-DD"
  v: number;
}
interface DashboardOverview {
  from: string;
  to: string;
  days: number;
  currencies: string[];
  totals: {
    revenue: Record<string, number>;
    collected: Record<string, number>;
    window_debt: Record<string, number>;
    new_customers: number;
    orders: number;
    trips: number;
  };
  series: {
    revenue: Record<string, SeriesPoint[]>;
    collected: Record<string, SeriesPoint[]>;
    new_customers: SeriesPoint[];
    orders: SeriesPoint[];
    trips: SeriesPoint[];
  };
}

const RANGE_PRESETS = [
  { days: 7, labelKey: "dashboard.range7" },
  { days: 30, labelKey: "dashboard.range30" },
  { days: 90, labelKey: "dashboard.range90" },
];

const fmtMoney = (n: number) =>
  n.toLocaleString(undefined, { maximumFractionDigits: 2 });
const fmtCompact = (n: number) => {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return `${n}`;
};
const fmtDay = (t: string) =>
  new Date(`${t}T00:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });

function PillGroup({
  options,
  value,
  onChange,
  testPrefix,
}: {
  options: { key: string; label: string }[];
  value: string;
  onChange: (key: string) => void;
  testPrefix: string;
}) {
  return (
    <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-gray-100 border border-gray-200">
      {options.map((o) => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          data-testid={`${testPrefix}-${o.key}`}
          className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
            value === o.key
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-500 hover:text-gray-900"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Sparkline({ data, color }: { data: SeriesPoint[]; color: string }) {
  if (!data.length) return <div className="h-10" />;
  return (
    <div className="h-10 -mx-2" dir="ltr">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
          <Area
            type="monotone"
            dataKey="v"
            stroke={color}
            fill={color}
            fillOpacity={0.12}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function StatCard({
  label,
  value,
  suffix,
  spark,
  color,
  valueClassName,
  testId,
}: {
  label: string;
  value: string;
  suffix?: string;
  spark: SeriesPoint[];
  color: string;
  valueClassName?: string;
  testId: string;
}) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
          {label}
        </p>
        <p
          className={`text-2xl font-semibold mt-1 ${valueClassName || "text-gray-900"}`}
          data-testid={testId}
        >
          {value}
          {suffix && (
            <span className="text-sm text-gray-500 font-normal"> {suffix}</span>
          )}
        </p>
        <div className="mt-2">
          <Sparkline data={spark} color={color} />
        </div>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const { t, te } = useLanguage();
  const [days, setDays] = useState(30);
  const [pickedCurrency, setPickedCurrency] = useState<string | null>(null);

  const { data: overview, isLoading, error } = useQuery<DashboardOverview>({
    queryKey: ["/dashboard/overview", days],
    queryFn: () => apiRequest(`/dashboard/overview?days=${days}`),
    retry: false,
  });

  // display currency: explicit pick → SYP → first reported
  const currency = useMemo(() => {
    const list = overview?.currencies || [];
    if (pickedCurrency && list.includes(pickedCurrency)) return pickedCurrency;
    if (list.includes("SYP")) return "SYP";
    return list[0] || "SYP";
  }, [overview, pickedCurrency]);

  const revenueSeries = overview?.series.revenue[currency] || [];
  const cumulativeRevenue = useMemo(() => {
    let acc = 0;
    return revenueSeries.map((p) => {
      acc += p.v;
      return { t: p.t, v: Math.round(acc * 100) / 100 };
    });
  }, [revenueSeries]);

  const totals = overview?.totals;
  const firstName = user?.firstName || user?.username || "";
  const forbidden = error && /^403/.test((error as Error).message || "");

  return (
    <AppLayout>
      <div className="flex-1 overflow-auto p-4 lg:p-6 space-y-6">
        {/* header */}
        <div className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{t("dashboard.title")}</h2>
            <p className="text-sm text-gray-600">
              {t("dashboard.welcome", { name: firstName ? `, ${firstName}` : "" })}
            </p>
          </div>
          {!forbidden && (
            <div className="flex items-center gap-2 flex-wrap">
              {(overview?.currencies.length || 0) > 1 && (
                <PillGroup
                  options={overview!.currencies.map((c) => ({ key: c, label: te(c) }))}
                  value={currency}
                  onChange={setPickedCurrency}
                  testPrefix="currency"
                />
              )}
              <PillGroup
                options={RANGE_PRESETS.map((r) => ({
                  key: String(r.days),
                  label: t(r.labelKey),
                }))}
                value={String(days)}
                onChange={(k) => setDays(Number(k))}
                testPrefix="range"
              />
            </div>
          )}
        </div>

        {forbidden ? (
          <Card>
            <CardContent className="pt-6 text-sm text-gray-500">
              {t("dashboard.analyticsRestricted")}
            </CardContent>
          </Card>
        ) : (
          <>
            {/* hero: cumulative revenue over the window */}
            <Card>
              <CardContent className="pt-6">
                <div className="grid lg:grid-cols-[1fr_240px] gap-6">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                      {t("dashboard.totalRevenue", { days })}
                    </p>
                    <p
                      className="text-3xl font-semibold text-gray-900 mt-1"
                      data-testid="hero-revenue"
                    >
                      {totals ? fmtMoney(totals.revenue[currency] || 0) : "—"}{" "}
                      <span className="text-base text-gray-500 font-normal">
                        {te(currency)}
                      </span>
                    </p>
                    <div className="mt-4 h-60" dir="ltr">
                      {isLoading ? (
                        <div className="h-full rounded-lg bg-gray-50 animate-pulse" />
                      ) : (
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart
                            data={cumulativeRevenue}
                            margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis
                              dataKey="t"
                              tickFormatter={fmtDay}
                              fontSize={11}
                              minTickGap={28}
                              tickLine={false}
                            />
                            <YAxis
                              tickFormatter={fmtCompact}
                              fontSize={11}
                              width={44}
                              tickLine={false}
                              axisLine={false}
                            />
                            <Tooltip
                              labelFormatter={(d) => fmtDay(d as string)}
                              formatter={(v) => [
                                `${fmtMoney(v as number)} ${te(currency)}`,
                                t("dashboard.cumulativeRevenue"),
                              ]}
                            />
                            <Area
                              type="monotone"
                              dataKey="v"
                              stroke="#5469D4"
                              fill="#5469D4"
                              fillOpacity={0.1}
                              strokeWidth={2}
                              dot={false}
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                  </div>
                  <div className="space-y-5 lg:border-s lg:border-gray-200 lg:ps-6">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                        {t("dashboard.collected")}
                      </p>
                      <p
                        className="text-2xl font-semibold text-gray-900 mt-1"
                        data-testid="hero-collected"
                      >
                        {totals ? fmtMoney(totals.collected[currency] || 0) : "—"}{" "}
                        <span className="text-sm text-gray-500 font-normal">
                          {te(currency)}
                        </span>
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                        {t("dashboard.outstandingDebt")}
                      </p>
                      <p
                        className={`text-2xl font-semibold mt-1 ${
                          (totals?.window_debt[currency] || 0) > 0
                            ? "text-red-600"
                            : "text-gray-900"
                        }`}
                        data-testid="hero-debt"
                      >
                        {totals
                          ? fmtMoney(totals.window_debt[currency] || 0)
                          : "—"}{" "}
                        <span className="text-sm text-gray-500 font-normal">
                          {te(currency)}
                        </span>
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {t("dashboard.debtWindowNote")}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                        {t("dashboard.newCustomers")}
                      </p>
                      <p
                        className="text-2xl font-semibold text-gray-900 mt-1"
                        data-testid="hero-customers"
                      >
                        {totals ? totals.new_customers : "—"}
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* stat cards with sparklines */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <StatCard
                label={t("dashboard.revenue")}
                value={totals ? fmtMoney(totals.revenue[currency] || 0) : "—"}
                suffix={te(currency)}
                spark={overview?.series.revenue[currency] || []}
                color="#5469D4"
                testId="stat-revenue"
              />
              <StatCard
                label={t("dashboard.collected")}
                value={totals ? fmtMoney(totals.collected[currency] || 0) : "—"}
                suffix={te(currency)}
                spark={overview?.series.collected[currency] || []}
                color="#16a34a"
                testId="stat-collected"
              />
              <StatCard
                label={t("dashboard.outstandingDebt")}
                value={totals ? fmtMoney(totals.window_debt[currency] || 0) : "—"}
                suffix={te(currency)}
                spark={[]}
                color="#dc2626"
                valueClassName={
                  (totals?.window_debt[currency] || 0) > 0
                    ? "text-red-600"
                    : "text-gray-900"
                }
                testId="stat-debt"
              />
              <StatCard
                label={t("dashboard.newCustomers")}
                value={totals ? String(totals.new_customers) : "—"}
                spark={overview?.series.new_customers || []}
                color="#0891b2"
                testId="stat-customers"
              />
              <StatCard
                label={t("dashboard.orders")}
                value={totals ? String(totals.orders) : "—"}
                spark={overview?.series.orders || []}
                color="#d97706"
                testId="stat-orders"
              />
              <StatCard
                label={t("dashboard.trips")}
                value={totals ? String(totals.trips) : "—"}
                spark={overview?.series.trips || []}
                color="#7c3aed"
                testId="stat-trips"
              />
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
