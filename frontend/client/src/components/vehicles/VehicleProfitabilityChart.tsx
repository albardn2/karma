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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { useLanguage } from "@/contexts/LanguageContext";

// revenue / gross / net — same order and colours as the dashboard profitability
// chart, so the two read identically.
const COLOURS = { revenue: "#5469D4", gross: "#16a34a", net: "#d97706" } as const;

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
}
interface Payload {
  target_currency: string;
  granularity: string;
  groups: Group[];
  disclosure: Disclosure;
}

const fmtCompact = (n: number) => {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return `${n}`;
};
const fmtMoney = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });

type Gran = "year" | "quarter" | "month";
type Ccy = "USD" | "SYP";

function PillGroup<T extends string>({
  value,
  options,
  onChange,
  testIdPrefix,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  testIdPrefix: string;
}) {
  return (
    <div className="inline-flex rounded-lg bg-gray-100 dark:bg-gray-800 p-1 gap-1">
      {options.map((o) => (
        <Button
          key={o.value}
          type="button"
          size="sm"
          variant={value === o.value ? "default" : "ghost"}
          className={value === o.value ? "brand-gradient h-7 px-3" : "h-7 px-3"}
          onClick={() => onChange(o.value)}
          data-testid={`${testIdPrefix}-${o.value}`}
        >
          {o.label}
        </Button>
      ))}
    </div>
  );
}

export function VehicleProfitabilityChart({ vehicleUuid }: { vehicleUuid: string }) {
  const { t, te } = useLanguage();
  const [gran, setGran] = useState<Gran>("month");
  const [ccy, setCcy] = useState<Ccy>("USD");

  const { data, isLoading, error } = useQuery<Payload>({
    queryKey: ["/dashboard/vehicle-profitability", vehicleUuid, gran, ccy],
    queryFn: () =>
      apiRequest(
        `/dashboard/vehicle-profitability?vehicle_uuid=${vehicleUuid}&granularity=${gran}&target_currency=${ccy}`,
      ),
    retry: false,
  });

  // A role without financial access 403s here — the whole card is hidden rather
  // than shown broken, matching how the dashboard profitability screen behaves.
  const forbidden = error != null && /^403/.test((error as Error).message || "");
  if (forbidden) return null;

  const rows = (data?.groups ?? []).map((g) => ({
    name: g.period_label,
    revenue: g.revenue,
    gross: g.gross,
    net: g.net,
  }));
  const hasAny = rows.some((r) => r.revenue || r.gross || r.net);
  const d = data?.disclosure;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <CardTitle>{t("vehicles.profitability")}</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <PillGroup<Gran>
              value={gran}
              onChange={setGran}
              testIdPrefix="veh-prof-gran"
              options={[
                { value: "month", label: t("dashboards.gMonth") },
                { value: "quarter", label: t("dashboards.gQuarter") },
                { value: "year", label: t("dashboards.gYear") },
              ]}
            />
            <PillGroup<Ccy>
              value={ccy}
              onChange={setCcy}
              testIdPrefix="veh-prof-ccy"
              options={[
                { value: "USD", label: "USD" },
                { value: "SYP", label: "SYP" },
              ]}
            />
          </div>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          {t("vehicles.profitabilityHint")}
        </p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-80 flex items-center justify-center text-sm text-gray-500">
            {t("common.loading")}
          </div>
        ) : !hasAny ? (
          <div className="h-80 flex items-center justify-center text-sm text-gray-500">
            {t("dashboards.noData")}
          </div>
        ) : (
          <div className="h-80" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={fmtCompact} tick={{ fontSize: 12 }} width={48} />
                <ReferenceLine y={0} stroke="#9ca3af" />
                <Tooltip
                  formatter={(v: number, key: string) => [
                    `${fmtMoney(v)} ${te(ccy)}`,
                    t(`dashboards.${key}`),
                  ]}
                />
                <Legend formatter={(key: string) => t(`dashboards.${key}`)} />
                <Bar dataKey="revenue" fill={COLOURS.revenue} radius={[2, 2, 0, 0]} isAnimationActive={false} />
                <Bar dataKey="gross" fill={COLOURS.gross} radius={[2, 2, 0, 0]} isAnimationActive={false} />
                <Bar dataKey="net" fill={COLOURS.net} radius={[2, 2, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        <div className="mt-3 space-y-1 text-xs text-gray-500 dark:text-gray-400">
          <p>{t("vehicles.profitGrossFull")}</p>
          <p>{t("vehicles.profitNetFull")}</p>
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
      </CardContent>
    </Card>
  );
}
