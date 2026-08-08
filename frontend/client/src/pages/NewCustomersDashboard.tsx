import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { DashboardShell } from "@/components/DashboardShell";
import { Card, CardContent } from "@/components/ui/card";
import { apiRequest } from "@/lib/queryClient";
import { useLanguage } from "@/contexts/LanguageContext";

interface Group {
  period_label: string;
  period_start: string;
  count: number;
}
interface Payload {
  granularity: string;
  groups: Group[];
}

type Gran = "day" | "week" | "month" | "quarter" | "year";

// the same green the customer-orders dashboard uses for its "new customers"
// segment — one colour for one concept across the whole dashboard set
const NEW = "#16a34a";

/**
 * Newly created customers per period, as a plain bar chart.
 *
 * Counts of customer records created (soft-deletes excluded) — who joined the
 * book, not what they bought; the customer-orders dashboard answers the
 * purchasing side. One series, so the bars are unstacked and there is no
 * currency involved.
 */
export default function NewCustomersDashboard({ mine = false, embedded = false }: { mine?: boolean; embedded?: boolean }) {
  const { t } = useLanguage();
  const [gran, setGran] = useState<Gran>("month");

  // the personal variant hits the self-scoped endpoint: customers the caller
  // created only
  const endpoint = mine ? "/dashboard/my-new-customers" : "/dashboard/new-customers";
  const { data, isLoading, error } = useQuery<Payload>({
    queryKey: [endpoint, gran],
    queryFn: () => apiRequest(`${endpoint}?granularity=${gran}`),
    retry: false,
  });

  const forbidden = error && /^403/.test((error as Error).message || "");
  const rows = (data?.groups ?? []).map((g) => ({ name: g.period_label, count: g.count }));
  const hasAny = rows.some((r) => r.count !== 0);

  const GRANS: { key: Gran; label: string }[] = [
    { key: "day", label: t("dashboards.gDay") },
    { key: "week", label: t("dashboards.gWeek") },
    { key: "month", label: t("dashboards.gMonth") },
    { key: "quarter", label: t("dashboards.gQuarter") },
    { key: "year", label: t("dashboards.gYear") },
  ];

  return (
    <DashboardShell embedded={embedded}>
        <div className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">
              {t(mine ? "dashboards.myNewCustomers" : "dashboards.newCustomers")}
            </h2>
            <p className="text-sm text-gray-600">
              {t(mine ? "dashboards.myNewCustomersDesc" : "dashboards.newCustomersDesc")}
            </p>
          </div>
          {!forbidden && (
            <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-gray-100 border border-gray-200">
              {GRANS.map((g) => (
                <button
                  key={g.key}
                  onClick={() => setGran(g.key)}
                  data-testid={`nc-gran-${g.key}`}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                    gran === g.key
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-500 hover:text-gray-900"
                  }`}
                >
                  {g.label}
                </button>
              ))}
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
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="name" fontSize={11} tickLine={false} minTickGap={12} />
                        <YAxis
                          allowDecimals={false}
                          fontSize={11}
                          width={40}
                          tickLine={false}
                          axisLine={false}
                        />
                        <Tooltip
                          formatter={(v: number) => [v.toLocaleString(), t("dashboards.newCustomers")]}
                        />
                        <Bar
                          dataKey="count"
                          fill={NEW}
                          radius={[2, 2, 0, 0]}
                          isAnimationActive={false}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </CardContent>
            </Card>

            {hasAny && (
              <Card>
                <CardContent className="pt-6 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wider text-gray-500">
                        <th className="pb-2 pe-4" />
                        <th className="pb-2 text-end">{t("dashboards.newCustomers")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...(data?.groups ?? [])].reverse().map((g) => (
                        <tr key={g.period_start} className="border-t border-gray-100">
                          <td className="py-2 pe-4 font-semibold text-gray-900">{g.period_label}</td>
                          <td
                            className={`py-2 text-end tabular-nums ${
                              g.count > 0 ? "text-green-700 font-medium" : "text-gray-500"
                            }`}
                          >
                            {g.count.toLocaleString()}
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
    </DashboardShell>
  );
}
