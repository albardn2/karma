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
  breakdown: Record<string, number>;
}
interface Payload {
  granularity: string;
  users: string[];
  groups: Group[];
  disclosure: { users_grouped: number };
}

type Gran = "day" | "week" | "month" | "quarter" | "year";

// same palette as the app's SERIES_COLOURS so a user keeps their colour in both
// clients; the reserved __unassigned__ segment is always the neutral gray
const PALETTE = [
  "#5469D4", "#16a34a", "#d97706", "#dc2626", "#0891b2",
  "#7c3aed", "#be185d", "#0f766e", "#b45309", "#4338ca",
];
const UNASSIGNED_COLOUR = "#9ca3af";
const UNASSIGNED = "__unassigned__";
const OTHERS = "__others__";

/**
 * Trip-stop counts per period as a stacked bar, one colour per assigned user.
 *
 * The server attributes each stop to its trip's assignee (the same "Assigned To"
 * the trips screens show), folds users beyond the top 8 into a reserved
 * "__others__" segment so bars keep their true height, and puts stops of
 * unassigned trips into "__unassigned__" (drawn gray). Counts, not money — no
 * currency toggle.
 */
export default function TripStopsDashboard() {
  const { t } = useLanguage();
  const [gran, setGran] = useState<Gran>("month");

  const { data, isLoading, error } = useQuery<Payload>({
    queryKey: ["/dashboard/trip-stops", gran],
    queryFn: () => apiRequest(`/dashboard/trip-stops?granularity=${gran}`),
    retry: false,
  });

  const forbidden = error && /^403/.test((error as Error).message || "");
  const users = data?.users ?? [];
  const label = (key: string) =>
    key === UNASSIGNED
      ? t("dashboards.unassigned")
      : key === OTHERS
        ? t("dashboards.othersSeg")
        : key;
  const colour = (key: string, i: number) =>
    key === UNASSIGNED ? UNASSIGNED_COLOUR : PALETTE[i % PALETTE.length];

  const rows = (data?.groups ?? []).map((g) => ({
    name: g.period_label,
    ...g.breakdown,
  }));
  const hasAny = (data?.groups ?? []).some((g) => g.total !== 0);

  const GRANS: { key: Gran; label: string }[] = [
    { key: "day", label: t("dashboards.gDay") },
    { key: "week", label: t("dashboards.gWeek") },
    { key: "month", label: t("dashboards.gMonth") },
    { key: "quarter", label: t("dashboards.gQuarter") },
    { key: "year", label: t("dashboards.gYear") },
  ];

  return (
    <AppLayout>
      <div className="flex-1 overflow-auto p-4 lg:p-6 space-y-6">
        <div className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{t("dashboards.tripStops")}</h2>
            <p className="text-sm text-gray-600">{t("dashboards.tripStopsDesc")}</p>
          </div>
          {!forbidden && (
            <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-gray-100 border border-gray-200">
              {GRANS.map((g) => (
                <button
                  key={g.key}
                  onClick={() => setGran(g.key)}
                  data-testid={`ts-gran-${g.key}`}
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
                          formatter={(v: number, key: string) => [v.toLocaleString(), label(key)]}
                        />
                        <Legend formatter={(key: string) => label(key)} wrapperStyle={{ fontSize: 12 }} />
                        {users.map((u, i) => (
                          <Bar
                            key={u}
                            dataKey={u}
                            stackId="stops"
                            fill={colour(u, i)}
                            radius={i === users.length - 1 ? [2, 2, 0, 0] : undefined}
                            isAnimationActive={false}
                          />
                        ))}
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>

                {/* the attribution rule, spelled out */}
                <p className="text-xs text-gray-500 mt-4">{t("dashboards.tripStopsNote")}</p>
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
                        {users.map((u) => (
                          <th key={u} className="pb-2 pe-4 text-end">{label(u)}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[...(data?.groups ?? [])].reverse().map((g) => (
                        <tr key={g.period_start} className="border-t border-gray-100">
                          <td className="py-2 pe-4 font-semibold text-gray-900">{g.period_label}</td>
                          <td className="py-2 pe-4 text-end tabular-nums font-medium">{g.total}</td>
                          {users.map((u) => (
                            <td key={u} className="py-2 pe-4 text-end tabular-nums text-gray-600">
                              {g.breakdown[u] ?? 0}
                            </td>
                          ))}
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
