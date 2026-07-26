import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";
import {
  ChevronLeft,
  ChevronRight,
  MapPin,
  TrendingUp,
  Receipt,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  BRAND,
  CurrencyStat,
  ModeToggle,
  MultiSelect,
  RANGES,
  RangeKey,
  SERIES_COLORS,
  fmtDate,
  fmtMoney,
  fmtPeriod,
  rangeStart,
} from "@/components/analytics/shared";

const PER_PAGE = 20;

export function UserAnalytics({ userUuid }: { userUuid: string }) {
  const { t, te } = useLanguage();
  const [range, setRange] = useState<RangeKey>("12m");
  const [materialSel, setMaterialSel] = useState<string[]>([]);
  const [salesMode, setSalesMode] = useState<"bar" | "cumulative">("bar");
  const [stopsMode, setStopsMode] = useState<"bar" | "cumulative">("bar");
  const [page, setPage] = useState(1);

  const bucket = RANGES[range].bucket;
  const start = rangeStart(range);
  const baseQs =
    `?user_uuid=${userUuid}` +
    (start ? `&start_date=${start}` : "") +
    (materialSel.length ? `&material_uuids=${materialSel.join(",")}` : "");

  const { data: materials } = useQuery<any>({
    queryKey: ["/material/", "user-analytics"],
    queryFn: () => apiRequest("/material/?per_page=100"),
  });

  const { data: summary, isError: summaryError } = useQuery<any>({
    queryKey: ["/trip-stop/analytics/user-summary", baseQs],
    queryFn: () => apiRequest(`/trip-stop/analytics/user-summary${baseQs}`),
  });
  const { data: sales, isError: salesError } = useQuery<any>({
    queryKey: ["/trip-stop/analytics/user-sales-over-time", baseQs, bucket],
    queryFn: () =>
      apiRequest(`/trip-stop/analytics/user-sales-over-time${baseQs}&bucket=${bucket}`),
  });
  const { data: stops, isError: stopsError } = useQuery<any>({
    queryKey: ["/trip-stop/analytics/user-stops-over-time", userUuid, start, bucket],
    queryFn: () =>
      apiRequest(
        `/trip-stop/analytics/user-stops-over-time?user_uuid=${userUuid}` +
          (start ? `&start_date=${start}` : "") +
          `&bucket=${bucket}`
      ),
  });
  const tableQs = `${baseQs}&page=${page}&per_page=${PER_PAGE}`;
  const {
    data: table,
    isError: tableError,
    error: tableErrorObj,
  } = useQuery<any>({
    queryKey: ["/trip-stop/analytics/user-sales", tableQs],
    queryFn: () => apiRequest(`/trip-stop/analytics/user-sales${tableQs}`),
  });

  // Revenue is per-currency and currencies never add up, so each currency gets
  // its own series rather than being folded into one misleading total.
  const { salesData, currencies } = useMemo(() => {
    const buckets = sales?.buckets ?? [];
    const seen = new Set<string>();
    buckets.forEach((b: any) =>
      Object.keys(b.revenue ?? {}).forEach((c) => seen.add(c))
    );
    const curs = Array.from(seen);
    // Cumulative starts at zero INSIDE the window, so the last point equals the
    // revenue tile. Seeding it with pre-window revenue (as a stock chart does)
    // would make the curve permanently disagree with the summary above it.
    const running: Record<string, number> = {};
    curs.forEach((c) => (running[c] = 0));
    const rows = buckets.map((b: any) => {
      const row: any = { label: fmtPeriod(b.period, bucket) };
      curs.forEach((c) => {
        const v = b.revenue?.[c] ?? 0;
        running[c] += v;
        row[c] = salesMode === "bar" ? v : Math.round(running[c] * 100) / 100;
      });
      return row;
    });
    return { salesData: rows, currencies: curs };
  }, [sales, salesMode, bucket]);

  const stopsData = useMemo(() => {
    const buckets = stops?.buckets ?? [];
    let running = stops?.baseline ?? 0;
    return buckets.map((b: any) => {
      running += b.count;
      return {
        label: fmtPeriod(b.period, bucket),
        value: stopsMode === "bar" ? b.count : running,
      };
    });
  }, [stops, stopsMode, bucket]);

  const materialOptions = (materials?.materials ?? []).map((m: any) => ({
    value: m.uuid,
    label: m.name,
  }));

  return (
    <div className="space-y-6" data-testid="user-analytics">
      {/* filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={range}
          onValueChange={(v) => {
            setRange(v as RangeKey);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-36 h-9" data-testid="user-analytics-range">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="30d">{t("dashboard.range30")}</SelectItem>
            <SelectItem value="90d">{t("dashboard.range90")}</SelectItem>
            <SelectItem value="6m">{t("customers.range6m")}</SelectItem>
            <SelectItem value="12m">{t("customers.range12m")}</SelectItem>
            <SelectItem value="all">{t("customers.rangeAll")}</SelectItem>
          </SelectContent>
        </Select>
        <MultiSelect
          label={t("customers.materialsFilter")}
          options={materialOptions}
          selected={materialSel}
          onChange={(next) => {
            setMaterialSel(next);
            setPage(1);
          }}
          searchable
          t={t}
          testId="user-analytics-materials"
        />
      </div>

      {/* summary: revenue / collected / outstanding + activity counts */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <CurrencyStat
          title={t("users.salesRevenue")}
          byCurrency={summary?.revenue ?? {}}
          pending={!summary}
          testId="user-revenue"
          te={te}
        />
        <CurrencyStat
          title={t("users.collected")}
          byCurrency={summary?.paid ?? {}}
          pending={!summary}
          testId="user-collected"
          te={te}
          accent="text-green-700"
        />
        <CurrencyStat
          title={t("users.outstanding")}
          byCurrency={summary?.unpaid ?? {}}
          pending={!summary}
          testId="user-outstanding"
          te={te}
          accent="text-amber-700"
        />
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 mb-1">{t("users.tripStops")}</p>
            <p className="text-2xl font-semibold" data-testid="user-stop-count">
              {summary?.stops ?? "—"}
            </p>
            <p className="text-xs text-gray-500">
              {t("users.stopsWithSale", { count: summary?.stops_with_sale ?? 0 })}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 mb-1">{t("users.ordersCount")}</p>
            <p className="text-2xl font-semibold" data-testid="user-order-count">
              {summary?.orders ?? "—"}
            </p>
            {summary && summary.orders !== summary.orders_invoiced && (
              <p className="text-xs text-gray-500">
                {t("users.ordersUninvoiced", {
                  count: summary.orders - summary.orders_invoiced,
                })}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
      {summaryError && (
        <p className="text-sm text-red-600">{t("common.error")}</p>
      )}

      {/* charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              {t("users.salesOverTime")}
            </CardTitle>
            <ModeToggle
              mode={salesMode}
              onChange={setSalesMode}
              testPrefix="user-sales"
              barLabel={t("customers.bars")}
              cumulativeLabel={t("customers.cumulative")}
            />
          </CardHeader>
          <CardContent>
            {salesError ? (
              <p className="text-sm text-red-600 py-12 text-center">
                {t("common.error")}
              </p>
            ) : !sales ? (
              <p className="text-sm text-gray-400 py-12 text-center">
                {t("common.loading")}
              </p>
            ) : salesData.length === 0 ? (
              <p className="text-sm text-gray-400 py-12 text-center">
                {t("customers.noData")}
              </p>
            ) : (
              <div className="h-64" dir="ltr" data-testid="user-sales-chart">
                <ResponsiveContainer width="100%" height="100%">
                  {salesMode === "bar" ? (
                    <BarChart data={salesData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      {currencies.map((c, i) => (
                        <Bar
                          key={c}
                          dataKey={c}
                          name={te(c)}
                          fill={SERIES_COLORS[i % SERIES_COLORS.length]}
                          radius={[4, 4, 0, 0]}
                        />
                      ))}
                    </BarChart>
                  ) : (
                    <AreaChart data={salesData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                      <defs>
                        <linearGradient id="userSalesGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={BRAND} stopOpacity={0.3} />
                          <stop offset="95%" stopColor={BRAND} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      {currencies.map((c, i) => (
                        <Area
                          key={c}
                          type="monotone"
                          dataKey={c}
                          name={te(c)}
                          stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
                          fill={i === 0 ? "url(#userSalesGrad)" : "transparent"}
                          strokeWidth={2}
                        />
                      ))}
                    </AreaChart>
                  )}
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <MapPin className="w-4 h-4" />
              {t("users.stopsOverTime")}
            </CardTitle>
            <ModeToggle
              mode={stopsMode}
              onChange={setStopsMode}
              testPrefix="user-stops"
              barLabel={t("customers.bars")}
              cumulativeLabel={t("customers.cumulative")}
            />
          </CardHeader>
          <CardContent>
            {stopsError ? (
              <p className="text-sm text-red-600 py-12 text-center">
                {t("common.error")}
              </p>
            ) : !stops ? (
              <p className="text-sm text-gray-400 py-12 text-center">
                {t("common.loading")}
              </p>
            ) : stopsData.length === 0 ? (
              <p className="text-sm text-gray-400 py-12 text-center">
                {t("customers.noData")}
              </p>
            ) : (
              <div className="h-64" dir="ltr" data-testid="user-stops-chart">
                <ResponsiveContainer width="100%" height="100%">
                  {stopsMode === "bar" ? (
                    <BarChart data={stopsData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                      <Tooltip />
                      <Bar
                        dataKey="value"
                        name={t("users.tripStops")}
                        fill="#10b981"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  ) : (
                    <AreaChart data={stopsData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                      <defs>
                        <linearGradient id="userStopsGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                      <Tooltip />
                      <Area
                        type="monotone"
                        dataKey="value"
                        name={t("users.tripStops")}
                        stroke="#10b981"
                        fill="url(#userStopsGrad)"
                        strokeWidth={2}
                      />
                    </AreaChart>
                  )}
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* sales table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Receipt className="w-4 h-4" />
            {t("users.stopSalesTable")}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table data-testid="user-sales-table">
              <TableHeader>
                <TableRow>
                  <TableHead>{t("common.date")}</TableHead>
                  <TableHead>{t("nav.customers")}</TableHead>
                  <TableHead className="text-end">{t("common.total")}</TableHead>
                  <TableHead className="text-end">{t("users.collected")}</TableHead>
                  <TableHead className="text-end">{t("users.outstanding")}</TableHead>
                  <TableHead>{t("customers.payment")}</TableHead>
                  <TableHead>{t("customers.tripStop")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tableError ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-red-600 py-8">
                      {(tableErrorObj as any)?.message || t("common.error")}
                    </TableCell>
                  </TableRow>
                ) : !table ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-gray-400 py-8">
                      {t("common.loading")}
                    </TableCell>
                  </TableRow>
                ) : table.items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-gray-400 py-8">
                      {t("users.noStopSales")}
                    </TableCell>
                  </TableRow>
                ) : (
                  table.items.map((r: any) => (
                    <TableRow key={r.uuid} className="hover:bg-gray-50">
                      <TableCell>
                        <Link
                          href={`/customer-orders/${r.uuid}?back=/users/${userUuid}`}
                          className="text-[hsl(245,58%,57%)] hover:underline"
                        >
                          {fmtDate(r.created_at)}
                        </Link>
                      </TableCell>
                      <TableCell>
                        {r.customer_uuid ? (
                          <Link
                            href={`/customers/${r.customer_uuid}`}
                            className="hover:underline"
                          >
                            {r.customer_name || "—"}
                          </Link>
                        ) : (
                          r.customer_name || "—"
                        )}
                      </TableCell>
                      <TableCell className="text-end font-medium whitespace-nowrap">
                        {fmtMoney(r.total)}{" "}
                        <span className="text-xs text-gray-500">
                          {r.currency ? te(r.currency) : ""}
                        </span>
                      </TableCell>
                      <TableCell className="text-end text-green-700 whitespace-nowrap">
                        {fmtMoney(r.paid)}
                      </TableCell>
                      <TableCell className="text-end text-amber-700 whitespace-nowrap">
                        {fmtMoney(r.unpaid)}
                      </TableCell>
                      <TableCell>
                        {r.is_paid === null ? (
                          // no live invoice: "paid" would be a lie
                          <span className="text-xs text-gray-400">
                            {t("users.notInvoiced")}
                          </span>
                        ) : (
                          <Badge
                            variant="secondary"
                            className={
                              r.is_paid
                                ? "bg-green-100 text-green-700"
                                : "bg-amber-100 text-amber-700"
                            }
                          >
                            {r.is_paid ? te("paid") : te("unpaid")}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-gray-500">
                        {fmtDate(r.trip_stop_date)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          {table && table.total_count > 0 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
              <p className="text-xs text-gray-500">
                {t("customers.tablePageOf", {
                  page: table.page,
                  pages: Math.max(table.pages, 1),
                  total: table.total_count,
                })}
              </p>
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  data-testid="user-sales-prev"
                >
                  <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= table.pages}
                  onClick={() => setPage((p) => p + 1)}
                  data-testid="user-sales-next"
                >
                  <ChevronRight className="h-4 w-4 rtl:rotate-180" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
