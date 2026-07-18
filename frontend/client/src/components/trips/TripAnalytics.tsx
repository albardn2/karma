import { useMemo } from "react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLanguage } from "@/contexts/LanguageContext";

interface ActivityStop {
  status?: string | null;
  outcome?: string | null;
}
interface ActivityOrderItem {
  material_name?: string | null;
  quantity?: number | null;
  amount?: number | null;
}
interface ActivityOrder {
  total?: number | null;
  amount_due?: number | null;
  amount_paid?: number | null;
  currency?: string | null;
  is_paid?: boolean;
  items?: ActivityOrderItem[];
}
interface ActivityFulfillment {
  material_name?: string | null;
  quantity?: number | null;
}
export interface TripActivityData {
  stops?: ActivityStop[];
  orders?: ActivityOrder[];
  fulfillments?: ActivityFulfillment[];
  payments?: { amount?: number | null; currency?: string | null }[];
}

const PALETTE = [
  "#16a34a", "#5469D4", "#d97706", "#dc2626", "#7c3aed",
  "#0891b2", "#db2777", "#65a30d", "#0ea5e9", "#9333ea",
];

// outcomes are stored as "sale - تم البيع" / "skipped:no_time - تم التخطي: ..."
// show the human part, keep the raw prefix for grouping
const outcomeLabel = (outcome: string) => {
  const i = outcome.indexOf(" - ");
  return i === -1 ? outcome : outcome.slice(i + 3);
};

const fmt = (n: number) =>
  n.toLocaleString(undefined, { maximumFractionDigits: 2 });

function StatCard({ title, byCurrency, testId }: {
  title: string;
  byCurrency: Record<string, number>;
  testId: string;
}) {
  const { te } = useLanguage();
  const entries = Object.entries(byCurrency).filter(([, v]) => v !== 0);
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-sm font-medium text-gray-500">{title}</p>
        {entries.length === 0 ? (
          <p className="text-2xl font-semibold mt-1" data-testid={testId}>0</p>
        ) : (
          entries.map(([cur, v]) => (
            <p key={cur} className="text-2xl font-semibold mt-1" data-testid={`${testId}-${cur}`}>
              {fmt(v)} <span className="text-sm text-gray-500 font-normal">{te(cur)}</span>
            </p>
          ))
        )}
      </CardContent>
    </Card>
  );
}

/** Full-picture analytics for one trip, computed from /trip/<uuid>/activity. */
export function TripAnalytics({ activity }: { activity?: TripActivityData | null }) {
  const { t, te } = useLanguage();
  const stops = activity?.stops || [];
  const orders = activity?.orders || [];
  const fulfillments = activity?.fulfillments || [];

  const { outcomes, revenue, collected, debt, revenueByMaterial, qtyByMaterial, counts } =
    useMemo(() => {
      // --- stop outcomes pie ---
      const outcomeCounts: Record<string, number> = {};
      for (const s of stops) {
        const key = s.outcome ? outcomeLabel(s.outcome) : t("trips.noOutcomeYet");
        outcomeCounts[key] = (outcomeCounts[key] || 0) + 1;
      }
      const outcomes = Object.entries(outcomeCounts).map(([name, value]) => ({ name, value }));

      // --- money, per currency ---
      const revenue: Record<string, number> = {};
      const collected: Record<string, number> = {};
      const debt: Record<string, number> = {};
      // --- revenue + quantity per material, per currency ---
      const revenueByMaterial: Record<string, Record<string, number>> = {};
      for (const o of orders) {
        const cur = o.currency || "?";
        revenue[cur] = (revenue[cur] || 0) + (o.total || 0);
        collected[cur] = (collected[cur] || 0) + (o.amount_paid || 0);
        debt[cur] = (debt[cur] || 0) + (o.amount_due || 0);
        for (const item of o.items || []) {
          if (item.amount == null) continue;
          const mat = item.material_name || "?";
          (revenueByMaterial[cur] ||= {})[mat] =
            (revenueByMaterial[cur][mat] || 0) + item.amount;
        }
      }

      // --- delivered quantity per material (vehicle sale events) ---
      const qtyByMaterial: Record<string, number> = {};
      for (const f of fulfillments) {
        const mat = f.material_name || "?";
        qtyByMaterial[mat] = (qtyByMaterial[mat] || 0) + (f.quantity || 0);
      }

      const counts = {
        stops: stops.length,
        completed: stops.filter((s) => s.status === "completed").length,
        sales: stops.filter((s) => s.outcome?.startsWith("sale")).length,
        orders: orders.length,
        unpaidOrders: orders.filter((o) => !o.is_paid).length,
      };

      return { outcomes, revenue, collected, debt, revenueByMaterial, qtyByMaterial, counts };
    }, [stops, orders, fulfillments, t]);

  const materialCharts = Object.entries(revenueByMaterial).map(([cur, byMat]) => ({
    currency: cur,
    rows: Object.entries(byMat)
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount),
  }));

  if (!stops.length && !orders.length) {
    return (
      <p className="text-sm text-gray-500 py-6 text-center" data-testid="trip-analytics-empty">
        {t("trips.noActivityRecorded")}
      </p>
    );
  }

  return (
    <div className="space-y-6" data-testid="trip-analytics">
      {/* headline numbers */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard title={t("trips.totalRevenue")} byCurrency={revenue} testId="analytics-revenue" />
        <StatCard title={t("trips.collected")} byCurrency={collected} testId="analytics-collected" />
        <StatCard title={t("trips.outstandingDebt")} byCurrency={debt} testId="analytics-debt" />
      </div>

      {/* counters */}
      <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm text-gray-600" data-testid="analytics-counters">
        <span>{t("trips.labelStops")}: <b>{counts.stops}</b></span>
        <span>{t("trips.labelCompleted")}: <b>{counts.completed}</b></span>
        <span>{t("trips.labelSales")}: <b>{counts.sales}</b></span>
        <span>{t("trips.labelOrders")}: <b>{counts.orders}</b></span>
        <span>{t("trips.labelUnpaidOrders")}: <b className={counts.unpaidOrders ? "text-red-600" : ""}>{counts.unpaidOrders}</b></span>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* stop outcomes */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("trips.stopOutcomes")}</CardTitle>
          </CardHeader>
          <CardContent>
            {outcomes.length === 0 ? (
              <p className="text-sm text-gray-500 py-6 text-center">{t("trips.noStops")}</p>
            ) : (
              <div dir="ltr">
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={outcomes}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={55}
                    outerRadius={90}
                    paddingAngle={2}
                    label={(e: any) => `${e.value}`}
                  >
                    {outcomes.map((_, i) => (
                      <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* revenue per material */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("trips.revenuePerMaterial")}</CardTitle>
          </CardHeader>
          <CardContent>
            {materialCharts.length === 0 ? (
              <p className="text-sm text-gray-500 py-6 text-center">
                {t("trips.noPricedItems")}
              </p>
            ) : (
              materialCharts.map(({ currency, rows }) => (
                <div key={currency} className="mb-4 last:mb-0" dir="ltr">
                  {materialCharts.length > 1 && (
                    <p className="text-xs font-medium text-gray-500 mb-1">{te(currency)}</p>
                  )}
                  <ResponsiveContainer width="100%" height={Math.max(120, rows.length * 44)}>
                    <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 40 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" fontSize={12} tickFormatter={(v) => fmt(v as number)} />
                      <YAxis type="category" dataKey="name" width={170} fontSize={12} />
                      <Tooltip formatter={(v: any) => [`${fmt(v)} ${te(currency)}`, t("trips.revenueLabel")]} />
                      <Bar dataKey="amount" fill="#5469D4" radius={[0, 4, 4, 0]} barSize={22} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* delivered quantities */}
      {Object.keys(qtyByMaterial).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("trips.deliveredQty")}</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm" data-testid="analytics-qty-table">
              <thead>
                <tr className="text-start text-gray-500 border-b">
                  <th className="py-2 pe-4 font-medium">{t("trips.material")}</th>
                  <th className="py-2 font-medium text-end">{t("common.quantity")}</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(qtyByMaterial)
                  .sort(([, a], [, b]) => b - a)
                  .map(([name, qty]) => (
                    <tr key={name} className="border-b last:border-0">
                      <td className="py-2 pe-4">{name}</td>
                      <td className="py-2 text-end font-semibold tabular-nums">{fmt(qty)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
