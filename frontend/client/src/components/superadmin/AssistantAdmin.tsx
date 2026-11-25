import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Save } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

const SETTINGS_URL = "/super-admin/settings/assistant";
const ACCOUNTS_URL = "/super-admin/assistant/accounts";
const ACTIONS_URL = "/super-admin/assistant/actions?per_page=50";
const HISTORY_URL = "/super-admin/assistant/history";
const HISTORY_PER_PAGE = 12;
const companyHistoryUrl = (accountUuid: string) => `/super-admin/accounts/${accountUuid}/assistant/history`;

interface PlatformSettings {
  model_id: string;
  enabled_by_default: boolean;
  plan_price_usd: number | null;
  margin_pct: number;
  invoice_plans: boolean;
  user_messages_per_hour: number | null;
}

interface ModelInfo {
  id: string;
  label: string;
  enabled: boolean;
  data_region: string;
  price_per_mtok: { input: number; output: number };
}

interface AccountRow {
  account_uuid: string;
  company_name: string;
  enabled: boolean | null;
  plan_price_usd: number | null;
  margin_pct: number | null;
  user_messages_per_hour: number | null;
  effective_enabled: boolean;
  effective_plan_price_usd: number | null;
  effective_margin_pct: number;
  effective_user_messages_per_hour: number | null;
  cost_cap_usd: number | null;
  period_start: string;
  period_end: string;
  period_cost_usd: number;
  period_questions: number;
  used_pct: number | null;
  revenue_usd: number | null;
  profit_usd: number | null;
  profit_pct: number | null;
}

interface Totals {
  cost_usd: number;
  revenue_usd: number;
  profit_usd: number;
  profit_pct: number | null;
}

interface BillingMonth {
  period_start: string;
  period_end: string;
  in_progress: boolean;
  estimated: boolean;
  questions: number;
  cost_usd: number;
  budget_usd: number | null;
  margin_pct: number;
  cost_cap_usd: number | null;
  hit_cap: boolean;
  profit_usd: number | null;
  profit_pct: number | null;
}

interface PlatformMonth {
  month: string;
  questions: number;
  cost_usd: number;
  budget_usd: number;
  profit_usd: number;
  profit_pct: number | null;
  companies_at_cap: number;
  estimated: boolean;
}

interface HistoryPage<T> {
  months: T[];
  total_count: number;
  page: number;
  per_page: number;
}

interface ActionRow {
  uuid: string;
  created_at: string;
  company_name: string | null;
  username: string | null;
  title: string;
  method: string;
  path: string;
  decision: "approved" | "declined";
  succeeded: boolean;
  status_code: number | null;
  error: string | null;
}

const usd = (n: number | null | undefined) => {
  if (n == null) return "";
  const abs = Math.abs(n);
  return `${n < 0 ? "-" : ""}${abs < 1 && abs > 0 ? abs.toFixed(4) : abs.toFixed(2)}`;
};
const numOrNull = (s: string) => (s.trim() === "" ? null : Number(s));
/** A signed dollar amount: -$0.07, not $-0.07. */
const money = (n: number | null | undefined) => (n == null ? "" : `${n < 0 ? "-" : ""}$${usd(Math.abs(n))}`);
const pct = (n: number | null | undefined) => (n == null ? "—" : `${n}%`);
const text = (n: number | null | undefined) => (n == null ? "" : String(n));
const shortDate = (iso: string) =>
  new Date(iso + "T00:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short" });

/** Platform-owner settings for the in-app assistant. */
export function AssistantAdmin() {
  const { t } = useLanguage();
  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-600">{t("assistantAdmin.intro")}</p>
      <PlatformCard />
      <CompaniesCard />
      <MonthlyCard />
      <ActionsCard />
    </div>
  );
}

function PlatformCard() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const { data, isError } = useQuery<{ settings: PlatformSettings; models: ModelInfo[] }>({
    queryKey: [SETTINGS_URL],
    queryFn: () => apiRequest(SETTINGS_URL),
  });
  const [form, setForm] = useState({
    model_id: "",
    enabled_by_default: false,
    price: "",
    margin: "",
    invoice_plans: false,
    rate: "",
  });

  useEffect(() => {
    if (!data) return;
    const s = data.settings;
    setForm({
      model_id: s.model_id,
      enabled_by_default: s.enabled_by_default,
      price: text(s.plan_price_usd),
      margin: String(s.margin_pct),
      invoice_plans: s.invoice_plans,
      rate: text(s.user_messages_per_hour),
    });
  }, [data]);

  const save = useMutation({
    mutationFn: () =>
      apiRequest(SETTINGS_URL, {
        method: "PUT",
        body: {
          model_id: form.model_id,
          enabled_by_default: form.enabled_by_default,
          plan_price_usd: numOrNull(form.price),
          margin_pct: Number(form.margin || 0),
          invoice_plans: form.invoice_plans,
          user_messages_per_hour: numOrNull(form.rate),
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [SETTINGS_URL] });
      queryClient.invalidateQueries({ queryKey: [ACCOUNTS_URL] });
      queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).includes("/assistant/history") });
      toast({ title: t("common.success"), description: t("assistantAdmin.saved") });
    },
    onError: (e: any) =>
      toast({ title: t("common.error"), description: e?.message || t("assistantAdmin.saveFailed"), variant: "destructive" }),
  });

  const model = data?.models.find((m) => m.id === form.model_id);
  const price = numOrNull(form.price);
  const cap = price == null ? null : price * (1 - Number(form.margin || 0) / 100);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("assistantAdmin.platformTitle")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {isError && <p className="text-sm text-red-600">{t("assistantAdmin.loadFailed")}</p>}
        <div className="space-y-2">
          <Label>{t("assistantAdmin.model")}</Label>
          <Select value={form.model_id} onValueChange={(v) => setForm((f) => ({ ...f, model_id: v }))}>
            <SelectTrigger className="max-w-md" data-testid="assistant-model">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {data?.models.map((m) => (
                <SelectItem key={m.id} value={m.id} disabled={!m.enabled}>
                  {m.label}
                  {!m.enabled && ` (${t("assistantAdmin.notEvaluated")})`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-sm text-gray-500">
            {t("assistantAdmin.modelDesc")}
            {model && (
              <>
                {" "}
                {t("assistantAdmin.perMTok", {
                  input: String(model.price_per_mtok.input),
                  output: String(model.price_per_mtok.output),
                })}
                {model.data_region && ` · ${model.data_region}`}
              </>
            )}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Switch
            id="assistant-default-on"
            checked={form.enabled_by_default}
            onCheckedChange={(v) => setForm((f) => ({ ...f, enabled_by_default: v }))}
          />
          <div>
            <Label htmlFor="assistant-default-on">{t("assistantAdmin.enabledByDefault")}</Label>
            <p className="text-sm text-gray-500">{t("assistantAdmin.enabledByDefaultDesc")}</p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 max-w-2xl">
          <div className="space-y-2">
            <Label htmlFor="assistant-price">{t("assistantAdmin.price")}</Label>
            <Input
              id="assistant-price"
              type="number"
              min={0}
              step="0.01"
              value={form.price}
              onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
            />
            <p className="text-sm text-gray-500">{t("assistantAdmin.priceDesc")}</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="assistant-margin">{t("assistantAdmin.margin")}</Label>
            <Input
              id="assistant-margin"
              type="number"
              min={0}
              max={99}
              step="1"
              value={form.margin}
              onChange={(e) => setForm((f) => ({ ...f, margin: e.target.value }))}
            />
            <p className="text-sm text-gray-500">
              {cap == null ? t("assistantAdmin.noCapDesc") : t("assistantAdmin.capDesc", { cap: usd(cap) })}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="assistant-rate">{t("assistantAdmin.rate")}</Label>
            <Input
              id="assistant-rate"
              type="number"
              min={1}
              step="1"
              value={form.rate}
              onChange={(e) => setForm((f) => ({ ...f, rate: e.target.value }))}
            />
            <p className="text-sm text-gray-500">{t("assistantAdmin.rateDesc")}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Switch
            id="assistant-invoice"
            checked={form.invoice_plans}
            onCheckedChange={(v) => setForm((f) => ({ ...f, invoice_plans: v }))}
          />
          <div>
            <Label htmlFor="assistant-invoice">{t("assistantAdmin.invoicePlans")}</Label>
            <p className="text-sm text-gray-500">{t("assistantAdmin.invoicePlansDesc")}</p>
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={() => save.mutate()} disabled={!data || save.isPending} data-testid="assistant-save">
            <Save className="h-4 w-4 me-2" />
            {save.isPending ? t("common.saving") : t("assistantAdmin.save")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function CompaniesCard() {
  const { t } = useLanguage();
  const { data } = useQuery<{ accounts: AccountRow[]; totals: Totals }>({
    queryKey: [ACCOUNTS_URL],
    queryFn: () => apiRequest(ACCOUNTS_URL),
  });
  // same query as the platform card: shares its cache, and re-renders once it loads
  const settings = useQuery<{ settings: PlatformSettings }>({
    queryKey: [SETTINGS_URL],
    queryFn: () => apiRequest(SETTINGS_URL),
  }).data?.settings;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("assistantAdmin.companiesTitle")}</CardTitle>
        <CardDescription>
          {t("assistantAdmin.companiesDesc", {
            revenue: usd(data?.totals.revenue_usd ?? 0),
            cost: usd(data?.totals.cost_usd ?? 0),
            profit: money(data?.totals.profit_usd ?? 0),
            pct: pct(data?.totals.profit_pct),
          })}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="mb-3 text-sm text-gray-500">{t("assistantAdmin.overrideHint")}</p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("assistantAdmin.company")}</TableHead>
              <TableHead>{t("assistantAdmin.access")}</TableHead>
              <TableHead>{t("assistantAdmin.companyPrice")}</TableHead>
              <TableHead>{t("assistantAdmin.companyMargin")}</TableHead>
              <TableHead>{t("assistantAdmin.companyRate")}</TableHead>
              <TableHead>{t("assistantAdmin.thisPeriod")}</TableHead>
              <TableHead>{t("assistantAdmin.profit")}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data?.accounts.map((a) => (
              <CompanyRow key={a.account_uuid} row={a} platform={settings} />
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function CompanyRow({ row, platform }: { row: AccountRow; platform?: PlatformSettings }) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const savedAccess = row.enabled == null ? "default" : row.enabled ? "on" : "off";
  const [access, setAccess] = useState<string>(savedAccess);
  const [price, setPrice] = useState(text(row.plan_price_usd));
  const [margin, setMargin] = useState(text(row.margin_pct));
  const [rate, setRate] = useState(text(row.user_messages_per_hour));

  useEffect(() => {
    setAccess(savedAccess);
    setPrice(text(row.plan_price_usd));
    setMargin(text(row.margin_pct));
    setRate(text(row.user_messages_per_hour));
  }, [savedAccess, row.plan_price_usd, row.margin_pct, row.user_messages_per_hour]);

  const dirty =
    access !== savedAccess ||
    price !== text(row.plan_price_usd) ||
    margin !== text(row.margin_pct) ||
    rate !== text(row.user_messages_per_hour);

  const save = useMutation({
    mutationFn: () =>
      apiRequest(`/super-admin/accounts/${row.account_uuid}/assistant`, {
        method: "PUT",
        body: {
          enabled: access === "default" ? null : access === "on",
          plan_price_usd: numOrNull(price),
          margin_pct: numOrNull(margin),
          user_messages_per_hour: numOrNull(rate),
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [ACCOUNTS_URL] });
      queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).includes("/assistant/history") });
      toast({ title: t("common.success"), description: t("assistantAdmin.companySaved", { company: row.company_name }) });
    },
    onError: (e: any) =>
      toast({ title: t("common.error"), description: e?.message || t("assistantAdmin.saveFailed"), variant: "destructive" }),
  });

  const defaultState = platform?.enabled_by_default ? t("assistantAdmin.on") : t("assistantAdmin.off");
  const defaultPrice =
    platform?.plan_price_usd == null ? t("assistantAdmin.noCap") : `$${usd(platform.plan_price_usd)}`;
  const defaultMargin = platform == null ? "" : `${platform.margin_pct}%`;
  const defaultRate =
    platform?.user_messages_per_hour == null ? t("assistantAdmin.noLimit") : String(platform.user_messages_per_hour);

  return (
    <TableRow>
      <TableCell className="font-medium">
        <CompanyHistory accountUuid={row.account_uuid} companyName={row.company_name} />
        {row.effective_enabled ? null : (
          <Badge variant="secondary" className="ms-2">
            {t("assistantAdmin.off")}
          </Badge>
        )}
      </TableCell>
      <TableCell>
        <Select value={access} onValueChange={setAccess}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="default">{t("assistantAdmin.accessDefault", { state: defaultState })}</SelectItem>
            <SelectItem value="on">{t("assistantAdmin.on")}</SelectItem>
            <SelectItem value="off">{t("assistantAdmin.off")}</SelectItem>
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <Input
          className="w-24"
          type="number"
          min={0}
          step="0.01"
          value={price}
          placeholder={defaultPrice}
          onChange={(e) => setPrice(e.target.value)}
        />
      </TableCell>
      <TableCell>
        <Input
          className="w-20"
          type="number"
          min={0}
          max={99}
          step="1"
          value={margin}
          placeholder={defaultMargin}
          onChange={(e) => setMargin(e.target.value)}
        />
      </TableCell>
      <TableCell>
        <Input
          className="w-20"
          type="number"
          min={1}
          step="1"
          value={rate}
          placeholder={defaultRate}
          onChange={(e) => setRate(e.target.value)}
        />
      </TableCell>
      <TableCell className="whitespace-nowrap text-sm text-gray-600">
        <div>
          {row.used_pct == null
            ? t("assistantAdmin.uncapped")
            : t("assistantAdmin.usedPct", { pct: String(row.used_pct) })}
          {" · "}
          {t("assistantAdmin.spend", {
            spend: usd(row.period_cost_usd),
            count: String(row.period_questions),
          })}
        </div>
        <div className="text-xs text-gray-500">
          {t("assistantAdmin.period", { start: shortDate(row.period_start), end: shortDate(row.period_end) })}
        </div>
      </TableCell>
      <TableCell className="whitespace-nowrap text-sm">
        {row.profit_usd == null ? (
          "—"
        ) : (
          <span className={row.profit_usd < 0 ? "text-red-600" : "text-gray-700"}>
            {money(row.profit_usd)} ({pct(row.profit_pct)})
            <span className="text-gray-500"> / ${usd(row.revenue_usd)}</span>
          </span>
        )}
      </TableCell>
      <TableCell>
        <Button size="sm" variant="outline" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
          {t("assistantAdmin.save")}
        </Button>
      </TableCell>
    </TableRow>
  );
}

const monthLabel = (ym: string) =>
  new Date(ym + "-01T00:00:00").toLocaleDateString(undefined, { month: "short", year: "numeric" });

function useHistoryPage<T>(url: string, page: number, enabled = true) {
  const pageUrl = `${url}?page=${page}&per_page=${HISTORY_PER_PAGE}`;
  return useQuery<HistoryPage<T>>({ queryKey: [pageUrl], queryFn: () => apiRequest(pageUrl), enabled });
}

/** Newer / older page buttons; page 1 is the most recent. */
function PageControls({ page, total, onPage }: { page: number; total: number; onPage: (p: number) => void }) {
  const { t } = useLanguage();
  const pages = Math.max(1, Math.ceil(total / HISTORY_PER_PAGE));
  if (pages <= 1) return null;
  return (
    <div className="mt-3 flex items-center justify-end gap-2 text-sm text-gray-600">
      <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        <ChevronLeft className="h-4 w-4 me-1" />
        {t("assistantAdmin.newer")}
      </Button>
      <span>{t("assistantAdmin.pageOf", { page: String(page), pages: String(pages) })}</span>
      <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        {t("assistantAdmin.older")}
        <ChevronRight className="h-4 w-4 ms-1" />
      </Button>
    </div>
  );
}

/** Profit in $ and %, or a dash for a month that earned nothing. */
function ProfitCell({ profit, pctValue }: { profit: number | null; pctValue: number | null }) {
  if (profit == null) return <>—</>;
  return (
    <span className={profit < 0 ? "text-red-600" : undefined}>
      {money(profit)} ({pct(pctValue)})
    </span>
  );
}

/** All companies together, by the calendar month each billing month begins in. */
function MonthlyCard() {
  const { t } = useLanguage();
  const [page, setPage] = useState(1);
  const { data } = useHistoryPage<PlatformMonth>(HISTORY_URL, page);
  const months = data?.months ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("assistantAdmin.monthlyTitle")}</CardTitle>
        <CardDescription>{t("assistantAdmin.monthlyDesc")}</CardDescription>
      </CardHeader>
      <CardContent>
        {months.length === 0 ? (
          <p className="text-sm text-gray-500">{t("assistantAdmin.noHistory")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("assistantAdmin.month")}</TableHead>
                <TableHead>{t("assistantAdmin.questions")}</TableHead>
                <TableHead>{t("assistantAdmin.budgets")}</TableHead>
                <TableHead>{t("assistantAdmin.modelCost")}</TableHead>
                <TableHead>{t("assistantAdmin.profitCol")}</TableHead>
                <TableHead>{t("assistantAdmin.atCap")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {months.map((m) => (
                <TableRow key={m.month}>
                  <TableCell className="whitespace-nowrap">
                    {monthLabel(m.month)}
                    {m.estimated && " *"}
                  </TableCell>
                  <TableCell>{m.questions}</TableCell>
                  <TableCell>${usd(m.budget_usd)}</TableCell>
                  <TableCell>${usd(m.cost_usd)}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    <ProfitCell profit={m.budget_usd > 0 ? m.profit_usd : null} pctValue={m.profit_pct} />
                  </TableCell>
                  <TableCell>{m.companies_at_cap}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <PageControls page={page} total={data?.total_count ?? 0} onPage={setPage} />
        {months.some((m) => m.estimated) && (
          <p className="mt-3 text-xs text-gray-500">{t("assistantAdmin.estimatedNote")}</p>
        )}
      </CardContent>
    </Card>
  );
}

/** The company's name, opening its billing months when clicked. */
function CompanyHistory({ accountUuid, companyName }: { accountUuid: string; companyName: string }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  // loaded only once the dialog opens: a page per company row would be wasted otherwise
  const { data } = useHistoryPage<BillingMonth>(companyHistoryUrl(accountUuid), page, open);
  const months = data?.months ?? [];

  return (
    <>
      <button
        type="button"
        className="text-start font-medium text-primary underline-offset-2 hover:underline"
        onClick={() => setOpen(true)}
        data-testid={`assistant-history-${accountUuid}`}
      >
        {companyName}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{companyName}</DialogTitle>
            <DialogDescription>{t("assistantAdmin.companyHistoryDesc")}</DialogDescription>
          </DialogHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("assistantAdmin.billingMonth")}</TableHead>
                <TableHead>{t("assistantAdmin.questions")}</TableHead>
                <TableHead>{t("assistantAdmin.budgetCol")}</TableHead>
                <TableHead>{t("assistantAdmin.modelCost")}</TableHead>
                <TableHead>{t("assistantAdmin.profitCol")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {months.map((m) => (
                <TableRow key={m.period_start}>
                  <TableCell className="whitespace-nowrap">
                    {shortDate(m.period_start)} – {shortDate(m.period_end)}
                    {m.estimated && " *"}
                    {m.in_progress && (
                      <Badge variant="secondary" className="ms-2">
                        {t("assistantAdmin.inProgress")}
                      </Badge>
                    )}
                    {m.hit_cap && (
                      <Badge variant="destructive" className="ms-2">
                        {t("assistantAdmin.hitCap")}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>{m.questions}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {m.budget_usd == null ? "—" : `$${usd(m.budget_usd)} · ${m.margin_pct}%`}
                  </TableCell>
                  <TableCell>${usd(m.cost_usd)}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    <ProfitCell profit={m.profit_usd} pctValue={m.profit_pct} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <PageControls page={page} total={data?.total_count ?? 0} onPage={setPage} />
          {months.some((m) => m.estimated) && (
            <p className="text-xs text-gray-500">{t("assistantAdmin.estimatedNote")}</p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function ActionsCard() {
  const { t } = useLanguage();
  const { data } = useQuery<{ actions: ActionRow[] }>({
    queryKey: [ACTIONS_URL],
    queryFn: () => apiRequest(ACTIONS_URL),
  });
  const actions = data?.actions ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("assistantAdmin.actionsTitle")}</CardTitle>
        <CardDescription>{t("assistantAdmin.actionsDesc")}</CardDescription>
      </CardHeader>
      <CardContent>
        {actions.length === 0 ? (
          <p className="text-sm text-gray-500">{t("assistantAdmin.noActions")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("assistantAdmin.when")}</TableHead>
                <TableHead>{t("assistantAdmin.who")}</TableHead>
                <TableHead>{t("assistantAdmin.action")}</TableHead>
                <TableHead>{t("assistantAdmin.outcome")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {actions.map((a) => (
                <TableRow key={a.uuid}>
                  <TableCell className="whitespace-nowrap text-sm">
                    {new Date(a.created_at + "Z").toLocaleString()}
                  </TableCell>
                  <TableCell className="text-sm">
                    {a.username}
                    {a.company_name && <span className="text-gray-500"> · {a.company_name}</span>}
                  </TableCell>
                  <TableCell className="text-sm">
                    {a.title}
                    <div className="text-xs text-gray-500 font-mono">
                      {a.method} {a.path}
                    </div>
                  </TableCell>
                  <TableCell>
                    {a.decision === "declined" ? (
                      <Badge variant="secondary">{t("assistantAdmin.declined")}</Badge>
                    ) : a.succeeded ? (
                      <Badge>{t("assistantAdmin.approved")}</Badge>
                    ) : (
                      <Badge variant="destructive" title={a.error ?? ""}>
                        {t("assistantAdmin.failed")}
                        {a.status_code ? ` (${a.status_code})` : ""}
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
