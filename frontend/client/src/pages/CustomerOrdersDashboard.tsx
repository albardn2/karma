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
  Legend,
} from "recharts";
import { DashboardShell } from "@/components/DashboardShell";
import { Card, CardContent } from "@/components/ui/card";
import { apiRequest } from "@/lib/queryClient";
import { useLanguage } from "@/contexts/LanguageContext";

interface Group {
  period_label: string;
  period_start: string;
  total: number;
  new_customer_orders: number;
  repeat_customer_orders: number;
}
interface Payload {
  granularity: string;
  groups: Group[];
}

type Gran = "day" | "week" | "month" | "quarter" | "year";

// new customers read as green (growth), returning as the brand blue (retention) —
// the app uses the same pair so a segment means the same thing in both clients
const NEW = "#16a34a";
const REPEAT = "#5469D4";

/**
 * Customer order counts per period, split into new vs returning customers.
 *
 * The server classifies each order against its customer's first-ever order AT THE
 * CHART'S OWN GRANULARITY: an order is "new" when it falls in the customer's first
 * period, so repeat purchases inside that same period still count as new, and the
 * same customer reads as new in July and returning in August on a monthly chart —
 * while a yearly chart counts their whole first year as new. Counts, not money, so
 * there is no currency here.
 */
export default function CustomerOrdersDashboard({ embedded = false }: { embedded?: boolean }) {
  const { t } = useLanguage();
  const [gran, setGran] = useState<Gran>("month");

  const { data, isLoading, error } = useQuery<Payload>({
    queryKey: ["/dashboard/customer-orders", gran],
    queryFn: () => apiRequest(`/dashboard/customer-orders?granularity=${gran}`),
    retry: false,
  });

  const forbidden = error && /^403/.test((error as Error).message || "");
  const rows = (data?.groups ?? []).map((g) => ({
    name: g.period_label,
    newOrders: g.new_customer_orders,
    repeatOrders: g.repeat_customer_orders,
  }));
  const hasAny = (data?.groups ?? []).some((g) => g.total !== 0);

  const GRANS: { key: Gran; label: string }[] = [
    { key: "day", label: t("dashboards.gDay") },
    { key: "week", label: t("dashboards.gWeek") },
    { key: "month", label: t("dashboards.gMonth") },
    { key: "quarter", label: t("dashboards.gQuarter") },
    { key: "year", label: t("dashboards.gYear") },
  ];

  const segLabel = (key: string) =>
    key === "newOrders" ? t("dashboards.newCustomers") : t("dashboards.repeatCustomers");

  return (
    <DashboardShell embedded={embedded}>
        <div className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{t("dashboards.customerOrders")}</h2>
            <p className="text-sm text-gray-600">{t("dashboards.customerOrdersDesc")}</p>
          </div>
          {!forbidden && (
            <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-gray-100 border border-gray-200">
              {GRANS.map((g) => (
                <button
                  key={g.key}
                  onClick={() => setGran(g.key)}
                  data-testid={`co-gran-${g.key}`}
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
                          formatter={(v: number, key: string) => [v.toLocaleString(), segLabel(key)]}
                        />
                        <Legend formatter={segLabel} wrapperStyle={{ fontSize: 12 }} />
                        <Bar
                          dataKey="newOrders"
                          stackId="orders"
                          fill={NEW}
                          isAnimationActive={false}
                        />
                        <Bar
                          dataKey="repeatOrders"
                          stackId="orders"
                          fill={REPEAT}
                          radius={[2, 2, 0, 0]}
                          isAnimationActive={false}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>

                {/* what "new" means here, spelled out — the rule is subtle */}
                <p className="text-xs text-gray-500 mt-4">{t("dashboards.newRepeatNote")}</p>
              </CardContent>
            </Card>

            {hasAny && (
              <Card>
                <CardContent className="pt-6 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wider text-gray-500">
                        <th className="pb-2 pe-4" />
                        <th className="pb-2 pe-4 text-end">{t("dashboards.total")}</th>
                        <th className="pb-2 pe-4 text-end">{t("dashboards.newCustomers")}</th>
                        <th className="pb-2 text-end">{t("dashboards.repeatCustomers")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...(data?.groups ?? [])].reverse().map((g) => (
                        <tr key={g.period_start} className="border-t border-gray-100">
                          <td className="py-2 pe-4 font-semibold text-gray-900">{g.period_label}</td>
                          <td className="py-2 pe-4 text-end tabular-nums font-medium">{g.total}</td>
                          <td className="py-2 pe-4 text-end tabular-nums text-green-700">
                            {g.new_customer_orders}
                          </td>
                          <td className="py-2 text-end tabular-nums text-indigo-700">
                            {g.repeat_customer_orders}
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
