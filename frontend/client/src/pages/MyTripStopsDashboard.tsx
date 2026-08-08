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
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { apiRequest } from "@/lib/queryClient";
import { useLanguage } from "@/contexts/LanguageContext";

interface Group {
  period_label: string;
  period_start: string;
  total: number;
  completed: number;
  not_completed: number;
}
interface Payload {
  granularity: string;
  groups: Group[];
}

type Gran = "day" | "week" | "month" | "quarter" | "year";

// completed reads as green (done), the rest amber (still open, not an error) —
// the same pair the materials dashboard uses for fulfilled/unfulfilled
const COMPLETED = "#16a34a";
const NOT_COMPLETED = "#d97706";

/**
 * The signed-in user's own trip stops per period: completed vs not.
 *
 * The server counts stops on trips ASSIGNED to the caller (the trips module's
 * own "Assigned To" resolution) and splits them by stop status — with a single
 * user, the per-user split of the global trip-stops dashboard is meaningless,
 * so status is the honest breakdown. Self-scoped endpoint, so any authenticated
 * user (a driver, a rep) may see their own numbers.
 */
export default function MyTripStopsDashboard() {
  const { t } = useLanguage();
  const [gran, setGran] = useState<Gran>("month");

  const { data, isLoading, error } = useQuery<Payload>({
    queryKey: ["/dashboard/my-trip-stops", gran],
    queryFn: () => apiRequest(`/dashboard/my-trip-stops?granularity=${gran}`),
    retry: false,
  });

  const forbidden = error && /^403/.test((error as Error).message || "");
  const rows = (data?.groups ?? []).map((g) => ({
    name: g.period_label,
    completed: g.completed,
    notCompleted: g.not_completed,
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
    key === "completed" ? t("dashboards.completed") : t("dashboards.notCompleted");

  return (
    <AppLayout>
      <div className="flex-1 overflow-auto p-4 lg:p-6 space-y-6">
        <div className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{t("dashboards.myTripStops")}</h2>
            <p className="text-sm text-gray-600">{t("dashboards.myTripStopsDesc")}</p>
          </div>
          {!forbidden && (
            <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-gray-100 border border-gray-200">
              {GRANS.map((g) => (
                <button
                  key={g.key}
                  onClick={() => setGran(g.key)}
                  data-testid={`mts-gran-${g.key}`}
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
                          dataKey="completed"
                          stackId="stops"
                          fill={COMPLETED}
                          isAnimationActive={false}
                        />
                        <Bar
                          dataKey="notCompleted"
                          stackId="stops"
                          fill={NOT_COMPLETED}
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
                        <th className="pb-2 pe-4 text-end">{t("dashboards.total")}</th>
                        <th className="pb-2 pe-4 text-end">{t("dashboards.completed")}</th>
                        <th className="pb-2 text-end">{t("dashboards.notCompleted")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...(data?.groups ?? [])].reverse().map((g) => (
                        <tr key={g.period_start} className="border-t border-gray-100">
                          <td className="py-2 pe-4 font-semibold text-gray-900">{g.period_label}</td>
                          <td className="py-2 pe-4 text-end tabular-nums font-medium">{g.total}</td>
                          <td className="py-2 pe-4 text-end tabular-nums text-green-700">
                            {g.completed}
                          </td>
                          <td
                            className={`py-2 text-end tabular-nums ${
                              g.not_completed > 0 ? "text-amber-700" : "text-gray-600"
                            }`}
                          >
                            {g.not_completed}
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
