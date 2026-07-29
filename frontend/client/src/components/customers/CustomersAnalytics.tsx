import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
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
  CartesianGrid,
} from "recharts";
import {
  ArrowUpDown,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  MapPinPlus,
  TrendingUp,
  Users,
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/queryClient";
import { useLanguage } from "@/contexts/LanguageContext";
import { toast } from "@/hooks/use-toast";

const BRAND = "hsl(245,58%,57%)";
const PER_PAGE = 20;

type RangeKey = "30d" | "90d" | "6m" | "12m" | "all";

const RANGES: Record<RangeKey, { days?: number; bucket: "day" | "week" | "month" }> = {
  "30d": { days: 30, bucket: "day" },
  "90d": { days: 90, bucket: "day" },
  "6m": { days: 182, bucket: "week" },
  "12m": { days: 365, bucket: "month" },
  all: { bucket: "month" },
};

function rangeStart(range: RangeKey): string | undefined {
  const days = RANGES[range].days;
  if (!days) return undefined;
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function fmtPeriod(iso: string, bucket: string) {
  const d = new Date(iso);
  if (bucket === "month")
    return d.toLocaleDateString(undefined, { month: "short", year: "2-digit" });
  return d.toLocaleDateString(undefined, { month: "numeric", day: "numeric" });
}

function fmtDate(v?: string | null) {
  return v ? new Date(v).toLocaleDateString() : "—";
}

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

/* ------------------------------ multi select ----------------------------- */

function MultiSelect({
  label,
  options,
  selected,
  onChange,
  searchable,
  t,
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (next: string[]) => void;
  searchable?: boolean;
  t: (k: string) => string;
}) {
  const [search, setSearch] = useState("");
  const visible = search
    ? options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()))
    : options;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1">
          {label}
          {selected.length > 0 && (
            <Badge variant="secondary" className="ms-1 px-1.5">
              {selected.length}
            </Badge>
          )}
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-2">
        {searchable && (
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("common.search")}
            className="mb-2 h-8"
          />
        )}
        <div className="max-h-56 overflow-y-auto space-y-1">
          {visible.map((o) => (
            <label
              key={o.value}
              className="flex items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-gray-50 cursor-pointer"
            >
              <Checkbox
                checked={selected.includes(o.value)}
                onCheckedChange={(c) =>
                  onChange(
                    c
                      ? [...selected, o.value]
                      : selected.filter((v) => v !== o.value)
                  )
                }
              />
              <span className="truncate">{o.label}</span>
            </label>
          ))}
          {visible.length === 0 && (
            <p className="px-1.5 py-2 text-xs text-gray-400">—</p>
          )}
        </div>
        {selected.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-1 w-full h-7 text-xs"
            onClick={() => onChange([])}
          >
            {t("common.clear")}
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}

/* ----------------------------- add-to-trip dialog ------------------------ */

function AddToTripDialog({
  customer,
  onClose,
  t,
  te,
}: {
  customer: { uuid: string; company_name: string } | null;
  onClose: () => void;
  t: (k: string, v?: Record<string, string | number>) => string;
  te: (k: string) => string;
}) {
  // keyed by customer.uuid at the call site, so this selection can never leak
  // from one customer's dialog into the next
  const [tripUuid, setTripUuid] = useState<string>("");

  // Only trips whose run is live can take a stop: the stop has to be spliced
  // into the running task chain (see POST /workflow-execution/<id>/manual-stop),
  // otherwise the driver's flow never visits it.
  const { data: inProgress, isLoading, isError } = useQuery<any>({
    queryKey: ["/trip/", "in_progress", "add-stop"],
    queryFn: () => apiRequest("/trip/?status=in_progress&per_page=100"),
    enabled: !!customer,
  });
  const trips = (inProgress?.items ?? []).filter(
    (tr: any) => tr.workflow_execution_uuid
  );

  const selected = trips.find((tr: any) => tr.uuid === tripUuid);

  const addStop = useMutation({
    mutationFn: () =>
      apiRequest(
        `/workflow-execution/${selected!.workflow_execution_uuid}/manual-stop`,
        { method: "POST", body: { customer_uuid: customer!.uuid } }
      ),
    onSuccess: (res: any) => {
      const key =
        res?.status === "already_current"
          ? "customers.stopAlreadyCurrent"
          : res?.status === "promoted"
          ? "customers.stopPromoted"
          : "customers.stopAdded";
      toast({ title: t(key) });
      onClose();
    },
    onError: (e: any) =>
      toast({
        title: t("customers.addStopFailed"),
        description: e.message,
        variant: "destructive",
      }),
  });

  return (
    <Dialog open={!!customer} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t("customers.addToTrip")} — {customer?.company_name}
          </DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <p className="text-sm text-gray-500 py-4">{t("common.loading")}</p>
        ) : isError ? (
          <p className="text-sm text-red-600 py-4">{t("common.error")}</p>
        ) : trips.length === 0 ? (
          <p className="text-sm text-gray-500 py-4">
            {t("customers.noActiveTrips")}
          </p>
        ) : (
          <div className="max-h-72 overflow-y-auto space-y-2" data-testid="trip-options">
            {trips.map((tr: any) => (
              <label
                key={tr.uuid}
                className={`flex items-center justify-between gap-2 rounded-lg border p-3 cursor-pointer ${
                  tripUuid === tr.uuid
                    ? "border-[hsl(245,58%,57%)] bg-indigo-50/50"
                    : "border-gray-200 hover:bg-gray-50"
                }`}
              >
                <input
                  type="radio"
                  name="trip"
                  className="sr-only"
                  checked={tripUuid === tr.uuid}
                  onChange={() => setTripUuid(tr.uuid)}
                />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {fmtDate(tr.created_at)} · {tr.vehicle_plate || tr.uuid.slice(0, 8)}
                  </p>
                  <p className="text-xs text-gray-500 truncate">
                    {tr.assigned_username || "—"}
                  </p>
                </div>
                <Badge
                  variant="secondary"
                  className={
                    tr.status === "in_progress"
                      ? "bg-green-100 text-green-700"
                      : "bg-gray-100 text-gray-600"
                  }
                >
                  {te(tr.status)}
                </Badge>
              </label>
            ))}
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            className="brand-gradient"
            disabled={!tripUuid || addStop.isPending}
            onClick={() => addStop.mutate()}
            data-testid="confirm-add-stop"
          >
            {t("customers.addToTrip")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* --------------------------------- main ---------------------------------- */

export function CustomersAnalytics() {
  const { t, te } = useLanguage();
  const [range, setRange] = useState<RangeKey>("12m");
  const [newMode, setNewMode] = useState<"bar" | "cumulative">("bar");
  const [materialSel, setMaterialSel] = useState<string[]>([]);
  const [categorySel, setCategorySel] = useState<string[]>([]);
  const [outcome, setOutcome] = useState<string>("any");
  // the text filters are debounced: they feed the query key, so firing on every
  // keystroke would issue a request per character
  const [commentsInput, setCommentsInput] = useState("");
  const comments = useDebounced(commentsInput, 350);
  const [minDaysInput, setMinDaysInput] = useState("");
  const minDays = useDebounced(minDaysInput, 350);
  const [onlySold, setOnlySold] = useState(true);
  const [sortBy, setSortBy] = useState<"revenue" | "last_stop">("revenue");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");
  const [page, setPage] = useState(1);
  const [tripCustomer, setTripCustomer] = useState<any>(null);

  const bucket = RANGES[range].bucket;
  const start = rangeStart(range);
  const baseQs = start ? `&start_date=${start}` : "";
  const filterQs =
    (materialSel.length ? `&material_uuids=${materialSel.join(",")}` : "") +
    (categorySel.length ? `&categories=${categorySel.join(",")}` : "");

  const { data: materials } = useQuery<any>({
    queryKey: ["/material/", "all"],
    queryFn: () => apiRequest("/material/?per_page=100"),
  });
  const { data: categories } = useQuery<string[]>({
    queryKey: ["/customer/categories"],
    queryFn: () => apiRequest("/customer/categories"),
  });

  const { data: newCust } = useQuery<any>({
    queryKey: ["/customer/analytics/new-customers", range],
    queryFn: () =>
      apiRequest(`/customer/analytics/new-customers?bucket=${bucket}${baseQs}`),
  });
  const { data: sold } = useQuery<any>({
    queryKey: ["/customer/analytics/customers-sold", range, materialSel, categorySel],
    queryFn: () =>
      apiRequest(
        `/customer/analytics/customers-sold?bucket=${bucket}${baseQs}${filterQs}`
      ),
  });

  const tableQs =
    `?page=${page}&per_page=${PER_PAGE}&sort_by=${sortBy}&sort_dir=${sortDir}` +
    `&only_sold=${onlySold}${baseQs}${filterQs}` +
    (outcome !== "any" ? `&outcome=${outcome}` : "") +
    (comments ? `&comments=${encodeURIComponent(comments)}` : "") +
    (minDays ? `&min_days_since_visit=${minDays}` : "");
  const {
    data: table,
    isError: tableError,
    error: tableErrorObj,
  } = useQuery<any>({
    queryKey: ["/customer/analytics/sold-customers", tableQs],
    queryFn: () => apiRequest(`/customer/analytics/sold-customers${tableQs}`),
  });

  // a debounced filter landing on page 5 would ask for a page that no longer
  // exists, so reset whenever the debounced values change
  useEffect(() => setPage(1), [comments, minDays]);

  const newData = useMemo(() => {
    const buckets = newCust?.buckets ?? [];
    if (newMode === "bar")
      return buckets.map((b: any) => ({
        label: fmtPeriod(b.period, bucket),
        value: b.count,
      }));
    let running = newCust?.baseline ?? 0;
    return buckets.map((b: any) => {
      running += b.count;
      return { label: fmtPeriod(b.period, bucket), value: running };
    });
  }, [newCust, newMode, bucket]);

  const soldData = useMemo(
    () =>
      (sold?.buckets ?? []).map((b: any) => ({
        label: fmtPeriod(b.period, bucket),
        value: b.count,
      })),
    [sold, bucket]
  );

  const toggleSort = (col: "revenue" | "last_stop") => {
    if (sortBy === col) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else {
      setSortBy(col);
      setSortDir("desc");
    }
    setPage(1);
  };

  const materialOptions = (materials?.materials ?? []).map((m: any) => ({
    value: m.uuid,
    label: m.name,
  }));
  const categoryOptions = (categories ?? []).map((c) => ({
    value: c,
    label: te(c),
  }));

  const resetPage = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    setPage(1);
  };

  return (
    <div className="space-y-6" data-testid="customers-analytics">
      {/* shared filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={range} onValueChange={(v) => { setRange(v as RangeKey); setPage(1); }}>
          <SelectTrigger className="w-36 h-9" data-testid="analytics-range">
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
          onChange={resetPage(setMaterialSel)}
          searchable
          t={t}
        />
        <MultiSelect
          label={t("customers.categoriesFilter")}
          options={categoryOptions}
          selected={categorySel}
          onChange={resetPage(setCategorySel)}
          t={t}
        />
      </div>

      {/* charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Users className="w-4 h-4" />
              {t("customers.newCustomersChart")}
            </CardTitle>
            <div className="flex rounded-lg bg-gray-100 p-0.5">
              {(["bar", "cumulative"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setNewMode(m)}
                  data-testid={`newcust-mode-${m}`}
                  className={`px-2.5 py-1 text-xs rounded-md ${
                    newMode === m
                      ? "bg-white shadow font-medium text-gray-900"
                      : "text-gray-500"
                  }`}
                >
                  {m === "bar" ? t("customers.bars") : t("customers.cumulative")}
                </button>
              ))}
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-64" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                {newMode === "bar" ? (
                  <BarChart data={newData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="value" name={t("customers.newCustomersChart")} fill={BRAND} radius={[4, 4, 0, 0]} />
                  </BarChart>
                ) : (
                  <AreaChart data={newData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                    <defs>
                      <linearGradient id="cumGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={BRAND} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={BRAND} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip />
                    <Area
                      type="monotone"
                      dataKey="value"
                      name={t("customers.totalCustomers")}
                      stroke={BRAND}
                      fill="url(#cumGrad)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                )}
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              {t("customers.customersSoldChart")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={soldData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="value" name={t("nav.customers")} fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* sold customers table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">
            {t("customers.soldTable")}
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <Select value={outcome} onValueChange={resetPage(setOutcome)}>
              <SelectTrigger className="w-36 h-8 text-xs" data-testid="outcome-filter">
                <SelectValue />
              </SelectTrigger>
              {/* values are prefixes of the stored TripStopOutcome values
                  ("sale - تم البيع", "not_interested:price_too_high - ...") */}
              <SelectContent>
                <SelectItem value="any">{t("customers.anyOutcome")}</SelectItem>
                <SelectItem value="sale">{t("customers.outcomeSale")}</SelectItem>
                <SelectItem value="interested">
                  {t("customers.outcomeInterested")}
                </SelectItem>
                <SelectItem value="not_interested">
                  {t("customers.outcomeNotInterested")}
                </SelectItem>
                <SelectItem value="skipped">{t("customers.outcomeSkipped")}</SelectItem>
                <SelectItem value="blacklist">{t("customers.outcomeBlacklist")}</SelectItem>
              </SelectContent>
            </Select>
            <Input
              value={commentsInput}
              onChange={(e) => setCommentsInput(e.target.value)}
              placeholder={t("customers.commentsContain")}
              className="h-8 w-44 text-xs"
              data-testid="comments-filter"
            />
            <Input
              type="number"
              min={0}
              step={1}
              value={minDaysInput}
              // whole days only — a decimal would 400 on the backend
              onChange={(e) =>
                setMinDaysInput(e.target.value.replace(/[^0-9]/g, ""))
              }
              placeholder={t("customers.notVisitedDays")}
              className="h-8 w-44 text-xs"
              data-testid="mindays-filter"
            />
            <label className="flex items-center gap-2 text-xs text-gray-600 ms-auto">
              <Switch
                checked={onlySold}
                onCheckedChange={resetPage(setOnlySold)}
                data-testid="only-sold-switch"
              />
              {t("customers.onlySold")}
            </label>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table data-testid="sold-customers-table">
              <TableHeader>
                <TableRow>
                  <TableHead>{t("nav.customers")}</TableHead>
                  <TableHead>{t("customers.categoryLabel")}</TableHead>
                  <TableHead>
                    <button
                      className="flex items-center gap-1 hover:text-gray-900"
                      onClick={() => toggleSort("revenue")}
                      data-testid="sort-revenue"
                    >
                      {t("customers.revenue")}
                      <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </TableHead>
                  <TableHead>{t("customers.ordersSection")}</TableHead>
                  <TableHead>
                    <button
                      className="flex items-center gap-1 hover:text-gray-900"
                      onClick={() => toggleSort("last_stop")}
                      data-testid="sort-laststop"
                    >
                      {t("customers.lastStop")}
                      <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </TableHead>
                  <TableHead>{t("customers.result")}</TableHead>
                  <TableHead>{t("customers.comments")}</TableHead>
                  <TableHead>{t("customers.daysCol")}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {tableError ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-red-600 py-8">
                      {(tableErrorObj as any)?.message || t("common.error")}
                    </TableCell>
                  </TableRow>
                ) : !table ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-gray-400 py-8">
                      {t("common.loading")}
                    </TableCell>
                  </TableRow>
                ) : table.items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-gray-400 py-8">
                      {t("customers.noData")}
                    </TableCell>
                  </TableRow>
                ) : (
                  table.items.map((r: any) => (
                    <TableRow key={r.uuid} className="hover:bg-gray-50">
                      <TableCell>
                        <Link
                          href={`/customers/${r.uuid}`}
                          className="text-[hsl(245,58%,57%)] hover:underline font-medium"
                        >
                          {r.company_name}
                        </Link>
                        <p className="text-xs text-gray-400">{r.full_name}</p>
                      </TableCell>
                      <TableCell className="text-xs">{te(r.category)}</TableCell>
                      <TableCell className="font-medium whitespace-nowrap">
                        {Object.keys(r.revenue).length === 0
                          ? "—"
                          : Object.entries(r.revenue).map(([cur, amt]) => (
                              <div key={cur}>
                                {(amt as number).toLocaleString()}{" "}
                                <span className="text-xs text-gray-500">{te(cur)}</span>
                              </div>
                            ))}
                      </TableCell>
                      <TableCell>{r.orders_count || "—"}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {fmtDate(r.last_stop_date)}
                      </TableCell>
                      <TableCell className="text-xs">
                        {r.last_stop_outcome ? te(r.last_stop_outcome) : "—"}
                      </TableCell>
                      <TableCell className="max-w-[12rem] truncate text-xs text-gray-600">
                        {r.last_stop_notes || "—"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {r.days_since_visit === null
                          ? t("customers.never")
                          : r.days_since_visit}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 gap-1 text-xs whitespace-nowrap"
                          onClick={() => setTripCustomer(r)}
                          data-testid={`add-to-trip-${r.uuid}`}
                        >
                          <MapPinPlus className="h-3.5 w-3.5" />
                          {t("customers.addToTrip")}
                        </Button>
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
                >
                  <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= table.pages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <ChevronRight className="h-4 w-4 rtl:rotate-180" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <AddToTripDialog
        key={tripCustomer?.uuid ?? "none"}
        customer={tripCustomer}
        onClose={() => setTripCustomer(null)}
        t={t}
        te={te}
      />
    </div>
  );
}
