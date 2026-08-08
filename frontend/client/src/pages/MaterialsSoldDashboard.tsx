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
import { ChevronLeft, ChevronRight } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { apiRequest } from "@/lib/queryClient";
import { useLanguage } from "@/contexts/LanguageContext";

interface MaterialRow {
  material_uuid: string;
  name: string;
  unit: string;
  total: number;
  fulfilled: number;
  unfulfilled: number;
}
interface Payload {
  granularity: string;
  offset: number;
  period_label: string;
  period_start: string;
  materials: MaterialRow[];
  disclosure: { materials_omitted: number };
}

type Gran = "day" | "week" | "month" | "quarter" | "year";

// fulfilled reads as green (delivered), unfulfilled as amber (still pending, not an
// error) — the app uses the same pair so a segment means the same in both clients
const FULFILLED = "#16a34a";
const UNFULFILLED = "#d97706";

const short = (s: string, n = 12) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/**
 * Quantities of materials sold in ONE period — each bar is a MATERIAL, stacked
 * into fulfilled vs unfulfilled quantity.
 *
 * Unlike the time-series dashboards, the x-axis here is materials, so the
 * granularity picks a window and ‹ › steps it back and forth (offset periods from
 * the current one). Quantities are in each material's own unit — the server groups
 * by (material, unit) and never sums across materials, so the bars are honest even
 * though the y-axis mixes units.
 */
export default function MaterialsSoldDashboard() {
  const { t } = useLanguage();
  const [gran, setGranRaw] = useState<Gran>("month");
  const [offset, setOffset] = useState(0);

  // switching granularity re-anchors to the current period — an offset of 3
  // months means nothing in weeks
  const setGran = (g: Gran) => {
    setGranRaw(g);
    setOffset(0);
  };

  const { data, isLoading, error } = useQuery<Payload>({
    queryKey: ["/dashboard/materials-sold", gran, offset],
    queryFn: () =>
      apiRequest(`/dashboard/materials-sold?granularity=${gran}&offset=${offset}`),
    retry: false,
  });

  const forbidden = error && /^403/.test((error as Error).message || "");
  const rows = (data?.materials ?? []).map((m) => ({
    name: short(m.name),
    fullName: `${m.name} (${m.unit})`,
    fulfilled: m.fulfilled,
    unfulfilled: m.unfulfilled,
  }));
  const hasAny = rows.length > 0;
  const omitted = data?.disclosure.materials_omitted ?? 0;

  const GRANS: { key: Gran; label: string }[] = [
    { key: "day", label: t("dashboards.gDay") },
    { key: "week", label: t("dashboards.gWeek") },
    { key: "month", label: t("dashboards.gMonth") },
    { key: "quarter", label: t("dashboards.gQuarter") },
    { key: "year", label: t("dashboards.gYear") },
  ];

  const segLabel = (key: string) =>
    key === "fulfilled" ? t("dashboards.fulfilled") : t("dashboards.unfulfilled");

  return (
    <AppLayout>
      <div className="flex-1 overflow-auto p-4 lg:p-6 space-y-6">
        <div className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{t("dashboards.materialsSold")}</h2>
            <p className="text-sm text-gray-600">{t("dashboards.materialsSoldDesc")}</p>
          </div>
          {!forbidden && (
            <div className="flex items-center gap-2 flex-wrap">
              {/* period navigator: ‹ steps back one period, › returns toward now */}
              <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-gray-100 border border-gray-200">
                <button
                  onClick={() => setOffset(offset + 1)}
                  data-testid="ms-prev"
                  className="px-2 py-1 rounded-md text-gray-500 hover:text-gray-900"
                  aria-label="previous period"
                >
                  <ChevronLeft className="w-4 h-4 rtl:rotate-180" />
                </button>
                <span
                  className="px-2 text-xs font-medium text-gray-900 tabular-nums"
                  data-testid="ms-period"
                >
                  {data?.period_label ?? "…"}
                </span>
                <button
                  onClick={() => setOffset(Math.max(0, offset - 1))}
                  disabled={offset === 0}
                  data-testid="ms-next"
                  className="px-2 py-1 rounded-md text-gray-500 hover:text-gray-900 disabled:opacity-30"
                  aria-label="next period"
                >
                  <ChevronRight className="w-4 h-4 rtl:rotate-180" />
                </button>
              </div>
              <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-gray-100 border border-gray-200">
                {GRANS.map((g) => (
                  <button
                    key={g.key}
                    onClick={() => setGran(g.key)}
                    data-testid={`ms-gran-${g.key}`}
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
                        <XAxis
                          dataKey="name"
                          fontSize={10}
                          tickLine={false}
                          interval={0}
                          angle={-25}
                          textAnchor="end"
                          height={54}
                        />
                        <YAxis
                          allowDecimals={false}
                          fontSize={11}
                          width={46}
                          tickLine={false}
                          axisLine={false}
                        />
                        <Tooltip
                          formatter={(v: number, key: string) => [v.toLocaleString(), segLabel(key)]}
                          labelFormatter={(_l, payload) =>
                            payload?.[0]?.payload?.fullName ?? String(_l)
                          }
                        />
                        <Legend formatter={segLabel} wrapperStyle={{ fontSize: 12 }} />
                        <Bar
                          dataKey="fulfilled"
                          stackId="qty"
                          fill={FULFILLED}
                          isAnimationActive={false}
                        />
                        <Bar
                          dataKey="unfulfilled"
                          stackId="qty"
                          fill={UNFULFILLED}
                          radius={[2, 2, 0, 0]}
                          isAnimationActive={false}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>

                <p className="text-xs text-gray-500 mt-4">{t("dashboards.materialUnitsNote")}</p>
                {omitted > 0 && (
                  <p className="text-xs text-amber-700 mt-1">
                    {t("dashboards.materialsOmitted", { count: omitted })}
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
                        <th className="pb-2 pe-4" />
                        <th className="pb-2 pe-4">{t("dashboards.unit")}</th>
                        <th className="pb-2 pe-4 text-end">{t("dashboards.total")}</th>
                        <th className="pb-2 pe-4 text-end">{t("dashboards.fulfilled")}</th>
                        <th className="pb-2 text-end">{t("dashboards.unfulfilled")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data?.materials ?? []).map((m) => (
                        <tr key={`${m.material_uuid}-${m.unit}`} className="border-t border-gray-100">
                          <td className="py-2 pe-4 font-semibold text-gray-900">{m.name}</td>
                          <td className="py-2 pe-4 text-gray-500">{m.unit}</td>
                          <td className="py-2 pe-4 text-end tabular-nums font-medium">
                            {m.total.toLocaleString()}
                          </td>
                          <td className="py-2 pe-4 text-end tabular-nums text-green-700">
                            {m.fulfilled.toLocaleString()}
                          </td>
                          <td
                            className={`py-2 text-end tabular-nums ${
                              m.unfulfilled > 0 ? "text-amber-700" : "text-gray-600"
                            }`}
                          >
                            {m.unfulfilled.toLocaleString()}
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
