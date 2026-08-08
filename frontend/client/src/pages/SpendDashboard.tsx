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
interface Disclosure {
  unconverted_amount: number;
  unconverted_count: number;
  salaries_backed: boolean;
}
interface Payload {
  target_currency: string;
  granularity: string;
  categories: string[];
  groups: Group[];
  disclosure: Disclosure;
}

type Gran = "week" | "month" | "quarter" | "year";
type Ccy = "USD" | "SYP";

// same palette as the app's SERIES_COLOURS, so a segment reads the same colour in
// both clients; index is by position in `categories` (stable within a response)
const PALETTE = [
  "#5469D4", "#16a34a", "#d97706", "#dc2626", "#0891b2",
  "#7c3aed", "#be185d", "#0f766e", "#b45309", "#4338ca",
];

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
 * Expenses & salaries per period as a colour-coded stacked bar.
 *
 * One segment per expense category plus a salaries segment (employee payouts — the
 * same definition profitability uses; salaries are not an expense category). The
 * server returns the ordered `categories` that actually have spend and each period's
 * breakdown converted to the chosen currency, so the client just stacks what it is
 * given and a currency switch converts rather than drops the other currency.
 */
export default function SpendDashboard() {
  const { t, te } = useLanguage();
  const [gran, setGran] = useState<Gran>("month");
  const [ccy, setCcy] = useState<Ccy>("USD");

  const { data, isLoading, error } = useQuery<Payload>({
    queryKey: ["/dashboard/expenses-breakdown", gran, ccy],
    queryFn: () =>
      apiRequest(`/dashboard/expenses-breakdown?granularity=${gran}&target_currency=${ccy}`),
    retry: false,
  });

  const forbidden = error && /^403/.test((error as Error).message || "");
  const categories = data?.categories ?? [];
  // localised segment label — salaries has its own key, categories reuse the
  // expenses module's enum labels
  const label = (cat: string) => (cat === "salaries" ? t("dashboards.salaries") : te(cat));

  const rows = (data?.groups ?? []).map((g) => ({
    name: g.period_label,
    ...g.breakdown,
  }));
  const hasAny = (data?.groups ?? []).some((g) => g.total !== 0);

  const GRANS: { key: Gran; label: string }[] = [
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
            <h2 className="text-2xl font-bold text-gray-900">{t("dashboards.spend")}</h2>
            <p className="text-sm text-gray-600">{t("dashboards.spendDesc")}</p>
          </div>
          {!forbidden && (
            <div className="flex items-center gap-2 flex-wrap">
              <PillGroup
                options={(["USD", "SYP"] as Ccy[]).map((c) => ({ key: c, label: te(c) }))}
                value={ccy}
                onChange={(k) => setCcy(k as Ccy)}
                testPrefix="spend-ccy"
              />
              <PillGroup
                options={GRANS.map((g) => ({ key: g.key, label: g.label }))}
                value={gran}
                onChange={(k) => setGran(k as Gran)}
                testPrefix="spend-gran"
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
                        <XAxis dataKey="name" fontSize={11} tickLine={false} minTickGap={12} />
                        <YAxis
                          tickFormatter={fmtCompact}
                          fontSize={11}
                          width={52}
                          tickLine={false}
                          axisLine={false}
                        />
                        <Tooltip
                          formatter={(v: number, key: string) => [
                            `${fmtMoney(v)} ${te(ccy)}`,
                            label(key),
                          ]}
                        />
                        <Legend formatter={(key: string) => label(key)} wrapperStyle={{ fontSize: 12 }} />
                        {categories.map((cat, i) => (
                          <Bar
                            key={cat}
                            dataKey={cat}
                            stackId="spend"
                            fill={PALETTE[i % PALETTE.length]}
                            radius={i === categories.length - 1 ? [2, 2, 0, 0] : undefined}
                            isAnimationActive={false}
                          />
                        ))}
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>

                {!!data && !data.disclosure.salaries_backed && (
                  <p className="text-xs text-amber-700 mt-4">{t("dashboards.beforeSalaries")}</p>
                )}
                {!!data && data.disclosure.unconverted_count > 0 && (
                  <p className="text-xs text-amber-700 mt-1">
                    {t("dashboards.unconverted", {
                      amount: `${fmtMoney(data.disclosure.unconverted_amount)} ${te(ccy)}`,
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
                        <th className="pb-2 pe-4 text-end">{t("dashboards.total")}</th>
                        {categories.map((cat) => (
                          <th key={cat} className="pb-2 pe-4 text-end">{label(cat)}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[...(data?.groups ?? [])].reverse().map((g) => (
                        <tr key={g.period_label} className="border-t border-gray-100">
                          <td className="py-2 pe-4 font-semibold text-gray-900">{g.period_label}</td>
                          <td className="py-2 pe-4 text-end tabular-nums font-medium">
                            {fmtMoney(g.total)}
                          </td>
                          {categories.map((cat) => (
                            <td key={cat} className="py-2 pe-4 text-end tabular-nums text-gray-600">
                              {fmtMoney(g.breakdown[cat] ?? 0)}
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
