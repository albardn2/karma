import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { apiRequest } from "@/lib/queryClient";
import { useLanguage } from "@/contexts/LanguageContext";

interface Group {
  period_label: string;
  period_start: string;
  revenue: number;
  received: number;
  debt: number;
  cumulative_revenue: number;
  cumulative_debt: number;
}
interface Disclosure {
  unconverted_amount: number;
  unconverted_count: number;
}
interface Payload {
  target_currency: string;
  granularity: string;
  groups: Group[];
  disclosure: Disclosure;
}

type Gran = "week" | "month" | "quarter" | "year";
type Ccy = "USD" | "SYP";
type Mode = "cumulative" | "bars";

// received (collected) green, debt (outstanding) red; the cumulative revenue curve
// is brand blue, its debt curve the same red as the bar's debt segment
const RECEIVED = "#16a34a";
const DEBT = "#dc2626";
const REVENUE = "#5469D4";

const fmtCompact = (n: number) => {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}k`;
  return `${Math.round(n * 100) / 100}`;
};
const fmtMoney = (n: number) =>
  n.toLocaleString(undefined, { maximumFractionDigits: 2 });

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

/**
 * Revenue over time, one dataset shown two ways (toggle):
 *   - Cumulative: running revenue and running debt as two curves.
 *   - Per period: revenue as a stacked bar of received + debt.
 *
 * Every figure is converted to the chosen currency by the SAME endpoint the app
 * calls, and the server guarantees received + debt = that period's revenue, so the
 * stacked bar's two segments always add up to the bar. A currency switch converts
 * each order at its own date rather than dropping the other currency.
 */
export default function RevenueOverTimeDashboard({ mine = false }: { mine?: boolean }) {
  const { t, te } = useLanguage();
  const [mode, setMode] = useState<Mode>("cumulative");
  const [gran, setGran] = useState<Gran>("month");
  const [ccy, setCcy] = useState<Ccy>("USD");

  // the personal variant hits the self-scoped endpoint: same maths, only the
  // caller's own orders
  const endpoint = mine ? "/dashboard/my-revenue-over-time" : "/dashboard/revenue-over-time";
  const { data, isLoading, error } = useQuery<Payload>({
    queryKey: [endpoint, gran, ccy],
    queryFn: () => apiRequest(`${endpoint}?granularity=${gran}&target_currency=${ccy}`),
    retry: false,
  });

  const forbidden = error && /^403/.test((error as Error).message || "");
  const rows = (data?.groups ?? []).map((g) => ({
    name: g.period_label,
    revenue: g.revenue,
    received: g.received,
    debt: g.debt,
    cumRevenue: g.cumulative_revenue,
    cumDebt: g.cumulative_debt,
  }));
  const hasAny = rows.some((r) => r.revenue || r.debt);
  const d = data?.disclosure;

  const GRANS: { key: Gran; label: string }[] = [
    { key: "week", label: t("dashboards.gWeek") },
    { key: "month", label: t("dashboards.gMonth") },
    { key: "quarter", label: t("dashboards.gQuarter") },
    { key: "year", label: t("dashboards.gYear") },
  ];
  const MODES: { key: Mode; label: string }[] = [
    { key: "cumulative", label: t("dashboards.modeCumulative") },
    { key: "bars", label: t("dashboards.modeBars") },
  ];

  const tip = (v: number, key: string) => {
    const labels: Record<string, string> = {
      received: t("dashboards.received"),
      debt: t("dashboards.debt"),
      cumRevenue: t("dashboards.cumulativeRevenue"),
      cumDebt: t("dashboards.cumulativeDebt"),
    };
    return [`${fmtMoney(v)} ${te(ccy)}`, labels[key] ?? key];
  };

  return (
    <AppLayout>
      <div className="flex-1 overflow-auto p-4 lg:p-6 space-y-6">
        <div className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">
              {t(mine ? "dashboards.myRevenue" : "dashboards.revenueOverTime")}
            </h2>
            <p className="text-sm text-gray-600">
              {t(mine ? "dashboards.myRevenueDesc" : "dashboards.revenueOverTimeDesc")}
            </p>
          </div>
          {!forbidden && (
            <div className="flex items-center gap-2 flex-wrap">
              <PillGroup
                options={MODES.map((m) => ({ key: m.key, label: m.label }))}
                value={mode}
                onChange={(k) => setMode(k as Mode)}
                testPrefix="rot-mode"
              />
              <PillGroup
                options={(["USD", "SYP"] as Ccy[]).map((c) => ({ key: c, label: te(c) }))}
                value={ccy}
                onChange={(k) => setCcy(k as Ccy)}
                testPrefix="rot-ccy"
              />
              <PillGroup
                options={GRANS.map((g) => ({ key: g.key, label: g.label }))}
                value={gran}
                onChange={(k) => setGran(k as Gran)}
                testPrefix="rot-gran"
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
            <Card>
              <CardContent className="pt-6">
                <div className="h-80" dir="ltr">
                  {isLoading ? (
                    <div className="h-full rounded-lg bg-gray-50 animate-pulse" />
                  ) : !hasAny ? (
                    <div className="h-full flex items-center justify-center text-sm text-gray-500">
                      {t("dashboards.noData")}
                    </div>
                  ) : mode === "cumulative" ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="name" fontSize={11} tickLine={false} minTickGap={20} />
                        <YAxis
                          tickFormatter={fmtCompact}
                          fontSize={11}
                          width={52}
                          tickLine={false}
                          axisLine={false}
                        />
                        <Tooltip formatter={(v: number, key: string) => tip(v, key)} />
                        <Legend
                          formatter={(key: string) =>
                            key === "cumRevenue"
                              ? t("dashboards.cumulativeRevenue")
                              : t("dashboards.cumulativeDebt")
                          }
                          wrapperStyle={{ fontSize: 12 }}
                        />
                        <Line
                          type="monotone"
                          dataKey="cumRevenue"
                          stroke={REVENUE}
                          strokeWidth={2}
                          dot={false}
                          isAnimationActive={false}
                        />
                        <Line
                          type="monotone"
                          dataKey="cumDebt"
                          stroke={DEBT}
                          strokeWidth={2}
                          dot={false}
                          isAnimationActive={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="name" fontSize={11} tickLine={false} minTickGap={12} />
                        <YAxis
                          tickFormatter={fmtCompact}
                          fontSize={11}
                          width={52}
                          tickLine={false}
                          axisLine={false}
                        />
                        <Tooltip formatter={(v: number, key: string) => tip(v, key)} />
                        <Legend
                          formatter={(key: string) =>
                            key === "received" ? t("dashboards.received") : t("dashboards.debt")
                          }
                          wrapperStyle={{ fontSize: 12 }}
                        />
                        <Bar
                          dataKey="received"
                          stackId="rev"
                          fill={RECEIVED}
                          isAnimationActive={false}
                        />
                        <Bar
                          dataKey="debt"
                          stackId="rev"
                          fill={DEBT}
                          radius={[2, 2, 0, 0]}
                          isAnimationActive={false}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>

                <p className="text-xs text-gray-500 mt-4">{t("dashboards.receivedDebtNote")}</p>
                {!!d && d.unconverted_count > 0 && (
                  <p className="text-xs text-amber-700 mt-2">
                    {t("dashboards.unconverted", {
                      amount: `${fmtMoney(d.unconverted_amount)} ${te(ccy)}`,
                    })}
                  </p>
                )}
              </CardContent>
            </Card>

            {hasAny && (
              <Card>
                <CardContent className="pt-6 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wider text-gray-500">
                        <th className="pb-2 pe-4">{te(ccy)}</th>
                        <th className="pb-2 pe-4 text-end">{t("dashboards.revenue")}</th>
                        <th className="pb-2 pe-4 text-end">{t("dashboards.received")}</th>
                        <th className="pb-2 text-end">{t("dashboards.debt")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...(data?.groups ?? [])].reverse().map((g) => (
                        <tr key={g.period_label} className="border-t border-gray-100">
                          <td className="py-2 pe-4 font-semibold text-gray-900">{g.period_label}</td>
                          <td className="py-2 pe-4 text-end tabular-nums">{fmtMoney(g.revenue)}</td>
                          <td className="py-2 pe-4 text-end tabular-nums text-green-700">
                            {fmtMoney(g.received)}
                          </td>
                          <td
                            className={`py-2 text-end tabular-nums ${
                              g.debt > 0 ? "text-red-600" : "text-gray-700"
                            }`}
                          >
                            {fmtMoney(g.debt)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}
