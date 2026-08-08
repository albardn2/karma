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
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { apiRequest } from "@/lib/queryClient";
import { useLanguage } from "@/contexts/LanguageContext";

interface Group {
  period_label: string;
  period_start: string;
  revenue: number;
  gross: number;
  net: number;
}
interface Disclosure {
  uncosted_quantity: number;
  unconverted_amount: number;
  unconverted_count: number;
  salaries_backed: boolean;
}
interface Payload {
  target_currency: string;
  granularity: string;
  groups: Group[];
  disclosure: Disclosure;
}

type Gran = "year" | "quarter" | "month";
type Ccy = "USD" | "SYP";

// series colours match the app's SERIES_COLOURS order so the two clients read the same
const COLOURS = { revenue: "#5469D4", gross: "#16a34a", net: "#d97706" };

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
 * Profitability: revenue, gross and net per period as a grouped three-bar chart.
 *
 * Gross is revenue minus cost of goods; net is gross minus expenses and salaries.
 * Every figure is converted to the chosen currency by the SAME endpoint the app
 * calls — the client never does money maths, so the two clients cannot disagree, and
 * a currency switch converts other currencies at each transaction's own date rather
 * than dropping them. The disclosure line is not decoration: sales from stock of
 * unknown cost are left out of cost of goods rather than counted as free, and until
 * employee payouts exist net is "before salaries".
 */
export default function ProfitabilityDashboard() {
  const { t, te } = useLanguage();
  const [gran, setGran] = useState<Gran>("month");
  const [ccy, setCcy] = useState<Ccy>("USD");

  const { data, isLoading, error } = useQuery<Payload>({
    queryKey: ["/dashboard/profitability", gran, ccy],
    queryFn: () =>
      apiRequest(`/dashboard/profitability?granularity=${gran}&target_currency=${ccy}`),
    retry: false,
  });

  const forbidden = error && /^403/.test((error as Error).message || "");
  const rows = (data?.groups ?? []).map((g) => ({
    name: g.period_label,
    revenue: g.revenue,
    gross: g.gross,
    net: g.net,
  }));
  const hasAny = rows.some((r) => r.revenue || r.gross || r.net);
  const d = data?.disclosure;

  const GRANS: { key: Gran; label: string }[] = [
    { key: "year", label: t("dashboards.gYear") },
    { key: "quarter", label: t("dashboards.gQuarter") },
    { key: "month", label: t("dashboards.gMonth") },
  ];

  return (
    <AppLayout>
      <div className="flex-1 overflow-auto p-4 lg:p-6 space-y-6">
        <div className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{t("dashboards.profitability")}</h2>
            <p className="text-sm text-gray-600">{t("dashboards.profitabilityDesc")}</p>
          </div>
          {!forbidden && (
            <div className="flex items-center gap-2 flex-wrap">
              <PillGroup
                options={(["USD", "SYP"] as Ccy[]).map((c) => ({ key: c, label: te(c) }))}
                value={ccy}
                onChange={(k) => setCcy(k as Ccy)}
                testPrefix="prof-ccy"
              />
              <PillGroup
                options={GRANS.map((g) => ({ key: g.key, label: g.label }))}
                value={gran}
                onChange={(k) => setGran(k as Gran)}
                testPrefix="prof-gran"
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
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="name" fontSize={11} tickLine={false} />
                        <YAxis
                          tickFormatter={fmtCompact}
                          fontSize={11}
                          width={52}
                          tickLine={false}
                          axisLine={false}
                        />
                        <ReferenceLine y={0} stroke="#9ca3af" />
                        <Tooltip
                          formatter={(v: number, key: string) => [
                            `${fmtMoney(v)} ${te(ccy)}`,
                            t(`dashboards.${key}`),
                          ]}
                        />
                        <Legend
                          formatter={(key: string) => t(`dashboards.${key}`)}
                          wrapperStyle={{ fontSize: 12 }}
                        />
                        <Bar
                          dataKey="revenue"
                          fill={COLOURS.revenue}
                          radius={[2, 2, 0, 0]}
                          isAnimationActive={false}
                        />
                        <Bar
                          dataKey="gross"
                          fill={COLOURS.gross}
                          radius={[2, 2, 0, 0]}
                          isAnimationActive={false}
                        />
                        <Bar
                          dataKey="net"
                          fill={COLOURS.net}
                          radius={[2, 2, 0, 0]}
                          isAnimationActive={false}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>

                {/* what the three bars mean, spelled out */}
                <p className="text-xs text-gray-500 mt-4">{t("dashboards.grossFull")}</p>
                <p className="text-xs text-gray-500">{t("dashboards.netFull")}</p>

                {/* honest caveats, never hidden */}
                {!!d && d.uncosted_quantity > 0 && (
                  <p className="text-xs text-amber-700 mt-2">
                    {t("dashboards.uncosted", { qty: d.uncosted_quantity })}
                  </p>
                )}
                {!!d && !d.salaries_backed && (
                  <p className="text-xs text-amber-700 mt-1">{t("dashboards.beforeSalaries")}</p>
                )}
                {!!d && d.unconverted_count > 0 && (
                  <p className="text-xs text-amber-700 mt-1">
                    {t("dashboards.unconverted", {
                      amount: `${fmtMoney(d.unconverted_amount)} ${te(ccy)}`,
                    })}
                  </p>
                )}
              </CardContent>
            </Card>

            {/* the numbers behind the bars, newest first */}
            {hasAny && (
              <Card>
                <CardContent className="pt-6 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wider text-gray-500">
                        <th className="pb-2 pe-4">{te(ccy)}</th>
                        <th className="pb-2 pe-4 text-end">{t("dashboards.revenue")}</th>
                        <th className="pb-2 pe-4 text-end">{t("dashboards.gross")}</th>
                        <th className="pb-2 text-end">{t("dashboards.net")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...(data?.groups ?? [])].reverse().map((g) => (
                        <tr key={g.period_label} className="border-t border-gray-100">
                          <td className="py-2 pe-4 font-semibold text-gray-900">{g.period_label}</td>
                          <td className="py-2 pe-4 text-end tabular-nums">{fmtMoney(g.revenue)}</td>
                          <td className="py-2 pe-4 text-end tabular-nums">{fmtMoney(g.gross)}</td>
                          <td
                            className={`py-2 text-end tabular-nums ${
                              g.net < 0 ? "text-red-600" : "text-gray-700"
                            }`}
                          >
                            {fmtMoney(g.net)}
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
