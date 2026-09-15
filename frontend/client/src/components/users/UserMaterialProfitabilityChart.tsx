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
  ReferenceLine,
} from "recharts";
import { ChevronLeft, ChevronRight, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiRequest } from "@/lib/queryClient";
import { useLanguage } from "@/contexts/LanguageContext";

// Deliberately NOT the green/amber of the materials-sold chart this sits next
// to: the two share an x-axis, so same colours would read as the same measure.
const COLOURS = { revenue: "#5469D4", gross: "#0891b2" } as const;

type Gran = "day" | "week" | "month" | "quarter" | "year";
type Ccy = "USD" | "SYP";

interface Row {
  material_uuid: string;
  name: string;
  revenue: number;
  cogs: number;
  gross: number;
}
interface Payload {
  target_currency: string;
  granularity: string;
  offset: number;
  period_label: string;
  period_start: string;
  materials: Row[];
  disclosure: {
    materials_omitted: number;
    uncosted_quantity: number;
    unconverted_amount: number;
    unconverted_count: number;
  };
}

const short = (s: string, n = 12) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const fmtCompact = (n: number) => {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return `${n}`;
};
const fmtMoney = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });

/**
 * Margin per material for the orders THIS user created, in one period.
 *
 * A bar per material, like the materials-sold chart above it — so granularity
 * picks a window and ‹ › steps it, rather than the x-axis being time.
 *
 * Two bars, not three: revenue and gross. Cost is the gap between them and is
 * carried exactly in the table, where twelve materials x three bars would only
 * have been a smear at phone width.
 *
 * There is no `net` because the server does not offer one — expenses and
 * salaries carry no material, so subtracting them per material would be an
 * invented allocation. The hint says "before expenses" rather than implying it.
 */
export function UserMaterialProfitabilityChart({ userUuid }: { userUuid: string }) {
  const { t, te } = useLanguage();
  const [gran, setGranRaw] = useState<Gran>("month");
  const [offset, setOffset] = useState(0);
  const [ccy, setCcy] = useState<Ccy>("USD");

  // changing the window size makes the old step meaningless — 3 months back is
  // not 3 years back, so the navigator returns to the current period
  const setGran = (g: Gran) => {
    setGranRaw(g);
    setOffset(0);
  };

  const { data, isLoading, error } = useQuery<Payload>({
    queryKey: ["/dashboard/user-material-profitability", userUuid, gran, offset, ccy],
    queryFn: () =>
      apiRequest(
        `/dashboard/user-material-profitability?user_uuid=${userUuid}` +
          `&granularity=${gran}&offset=${offset}&target_currency=${ccy}`,
      ),
    retry: false,
  });

  // Per-user analytics are supervisory-only and the money needs financial
  // access; a role without either 403s. Hide the card rather than show it
  // broken — same idiom as VehicleProfitabilityChart.
  const forbidden = error != null && /^403/.test((error as Error).message || "");
  if (forbidden) return null;

  const rows = (data?.materials ?? []).map((m) => ({
    name: short(m.name),
    fullName: m.name,
    revenue: m.revenue,
    gross: m.gross,
  }));
  const hasAny = rows.length > 0;
  const d = data?.disclosure;

  const GRANS: { key: Gran; label: string }[] = [
    { key: "day", label: t("dashboards.gDay") },
    { key: "week", label: t("dashboards.gWeek") },
    { key: "month", label: t("dashboards.gMonth") },
    { key: "quarter", label: t("dashboards.gQuarter") },
    { key: "year", label: t("dashboards.gYear") },
  ];

  const pill = (on: boolean) =>
    `px-3 py-1 rounded-md text-xs font-medium transition-colors ${
      on
        ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm"
        : "text-gray-500 hover:text-gray-900 dark:hover:text-gray-200"
    }`;

  return (
    <Card data-testid="user-material-profitability">
      <CardHeader className="pb-3">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
          <div>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-[#5469D4]" />
              {t("users.materialProfitability")}
            </CardTitle>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {t("users.materialProfitabilityHint")}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* period navigator: ‹ steps back one period, › returns toward now */}
            <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
              <button
                type="button"
                onClick={() => setOffset(offset + 1)}
                data-testid="ump-prev"
                className="px-2 py-1 rounded-md text-gray-500 hover:text-gray-900 dark:hover:text-gray-200"
                aria-label="previous period"
              >
                <ChevronLeft className="w-4 h-4 rtl:rotate-180" />
              </button>
              <span
                className="px-2 text-xs font-medium text-gray-900 dark:text-gray-100 tabular-nums"
                data-testid="ump-period"
              >
                {data?.period_label ?? "…"}
              </span>
              <button
                type="button"
                onClick={() => setOffset(Math.max(0, offset - 1))}
                disabled={offset === 0}
                data-testid="ump-next"
                className="px-2 py-1 rounded-md text-gray-500 hover:text-gray-900 dark:hover:text-gray-200 disabled:opacity-30"
                aria-label="next period"
              >
                <ChevronRight className="w-4 h-4 rtl:rotate-180" />
              </button>
            </div>

            <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
              {GRANS.map((g) => (
                <button
                  key={g.key}
                  type="button"
                  onClick={() => setGran(g.key)}
                  data-testid={`ump-gran-${g.key}`}
                  className={pill(gran === g.key)}
                >
                  {g.label}
                </button>
              ))}
            </div>

            <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
              {(["USD", "SYP"] as Ccy[]).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCcy(c)}
                  data-testid={`ump-ccy-${c}`}
                  className={pill(ccy === c)}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <div className="h-72 flex items-center justify-center text-sm text-gray-500">
            {t("common.loading")}
          </div>
        ) : !hasAny ? (
          <div
            className="h-72 flex items-center justify-center text-sm text-gray-500"
            data-testid="ump-empty"
          >
            {t("dashboards.noData")}
          </div>
        ) : (
          <div className="h-72" dir="ltr" data-testid="ump-chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={54} />
                <YAxis tickFormatter={fmtCompact} tick={{ fontSize: 12 }} width={52} />
                {/* a material can lose money — the baseline has to be visible */}
                <ReferenceLine y={0} stroke="#9ca3af" />
                <Tooltip
                  formatter={(v: number, key: string) => [
                    `${fmtMoney(v)} ${te(ccy)}`,
                    t(`dashboards.${key}`),
                  ]}
                  labelFormatter={(_l, p) => p?.[0]?.payload?.fullName ?? ""}
                />
                <Legend formatter={(key: string) => t(`dashboards.${key}`)} />
                <Bar dataKey="revenue" fill={COLOURS.revenue} radius={[2, 2, 0, 0]} isAnimationActive={false} />
                <Bar dataKey="gross" fill={COLOURS.gross} radius={[2, 2, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        <div className="mt-3 space-y-1 text-xs text-gray-500 dark:text-gray-400">
          <p>{t("users.materialProfitabilityGross")}</p>
          {d && d.materials_omitted > 0 && (
            <p>{t("users.materialProfitabilityOmitted", { count: d.materials_omitted })}</p>
          )}
          {d && d.uncosted_quantity > 0 && (
            <p className="text-amber-600 dark:text-amber-500">
              {t("dashboards.uncosted", { qty: fmtMoney(d.uncosted_quantity) })}
            </p>
          )}
          {d && d.unconverted_count > 0 && (
            <p className="text-amber-600 dark:text-amber-500">
              {t("dashboards.unconverted", { amount: fmtMoney(d.unconverted_amount) })}
            </p>
          )}
        </div>

        {/* the numbers behind the bars, including the cost the chart only implies */}
        {hasAny && (
          <div
            className="mt-4 overflow-x-auto border-t border-gray-100 dark:border-gray-800 pt-3"
            data-testid="ump-table"
          >
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-gray-500">
                  <th className="pb-2 pe-4">{t("inventory.material")}</th>
                  <th className="pb-2 pe-4 text-end">{t("dashboards.revenue")}</th>
                  <th className="pb-2 pe-4 text-end">{t("users.materialCost")}</th>
                  <th className="pb-2 pe-4 text-end">{t("dashboards.gross")}</th>
                  <th className="pb-2 text-end">{t("users.materialMargin")}</th>
                </tr>
              </thead>
              <tbody>
                {(data?.materials ?? []).map((m) => (
                  <tr
                    key={m.material_uuid}
                    className="border-t border-gray-100 dark:border-gray-800"
                  >
                    <td className="py-2 pe-4 font-medium text-gray-900 dark:text-gray-100">
                      {m.name}
                    </td>
                    <td className="py-2 pe-4 text-end tabular-nums">{fmtMoney(m.revenue)}</td>
                    <td className="py-2 pe-4 text-end tabular-nums">{fmtMoney(m.cogs)}</td>
                    <td
                      className={`py-2 pe-4 text-end tabular-nums ${
                        m.gross < 0 ? "text-red-600" : "text-gray-700 dark:text-gray-300"
                      }`}
                    >
                      {fmtMoney(m.gross)}
                    </td>
                    <td
                      className={`py-2 text-end tabular-nums ${
                        m.gross < 0 ? "text-red-600" : "text-gray-500"
                      }`}
                    >
                      {/* needs POSITIVE revenue to divide by: a line whose
                          credit notes exceed it goes negative, and dividing a
                          negative gross by it would print a healthy-looking
                          positive margin on a loss */}
                      {m.revenue > 0 ? `${((m.gross / m.revenue) * 100).toFixed(1)}%` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
