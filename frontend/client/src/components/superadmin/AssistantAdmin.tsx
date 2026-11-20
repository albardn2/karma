import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Save } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

interface PlatformSettings {
  model_id: string;
  enabled_by_default: boolean;
  monthly_budget_usd: number | null;
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
  monthly_budget_usd: number | null;
  effective_enabled: boolean;
  effective_budget_usd: number | null;
  month_spend_usd: number;
  month_questions: number;
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

const usd = (n: number | null | undefined) => (n == null ? "" : `${n < 1 && n > 0 ? n.toFixed(4) : n.toFixed(2)}`);
const numOrNull = (s: string) => (s.trim() === "" ? null : Number(s));

/** Platform-owner settings for the in-app assistant. */
export function AssistantAdmin() {
  const { t } = useLanguage();
  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-600">{t("assistantAdmin.intro")}</p>
      <PlatformCard />
      <CompaniesCard />
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
  const [form, setForm] = useState({ model_id: "", enabled_by_default: false, budget: "", rate: "" });

  useEffect(() => {
    if (!data) return;
    const s = data.settings;
    setForm({
      model_id: s.model_id,
      enabled_by_default: s.enabled_by_default,
      budget: s.monthly_budget_usd == null ? "" : String(s.monthly_budget_usd),
      rate: s.user_messages_per_hour == null ? "" : String(s.user_messages_per_hour),
    });
  }, [data]);

  const save = useMutation({
    mutationFn: () =>
      apiRequest(SETTINGS_URL, {
        method: "PUT",
        body: {
          model_id: form.model_id,
          enabled_by_default: form.enabled_by_default,
          monthly_budget_usd: numOrNull(form.budget),
          user_messages_per_hour: numOrNull(form.rate),
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [SETTINGS_URL] });
      queryClient.invalidateQueries({ queryKey: [ACCOUNTS_URL] });
      toast({ title: t("common.success"), description: t("assistantAdmin.saved") });
    },
    onError: (e: any) =>
      toast({ title: t("common.error"), description: e?.message || t("assistantAdmin.saveFailed"), variant: "destructive" }),
  });

  const model = data?.models.find((m) => m.id === form.model_id);

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
            <Label htmlFor="assistant-budget">{t("assistantAdmin.budget")}</Label>
            <Input
              id="assistant-budget"
              type="number"
              min={0}
              step="0.01"
              value={form.budget}
              onChange={(e) => setForm((f) => ({ ...f, budget: e.target.value }))}
            />
            <p className="text-sm text-gray-500">{t("assistantAdmin.budgetDesc")}</p>
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
  const { data } = useQuery<{ accounts: AccountRow[]; month_spend_usd: number }>({
    queryKey: [ACCOUNTS_URL],
    queryFn: () => apiRequest(ACCOUNTS_URL),
  });
  const settings = queryClient.getQueryData<{ settings: PlatformSettings }>([SETTINGS_URL])?.settings;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("assistantAdmin.companiesTitle")}</CardTitle>
        <CardDescription>
          {t("assistantAdmin.companiesDesc", { total: usd(data?.month_spend_usd ?? 0) })}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("assistantAdmin.company")}</TableHead>
              <TableHead>{t("assistantAdmin.access")}</TableHead>
              <TableHead>{t("assistantAdmin.companyBudget")}</TableHead>
              <TableHead>{t("assistantAdmin.thisMonth")}</TableHead>
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
  const [access, setAccess] = useState<string>(row.enabled == null ? "default" : row.enabled ? "on" : "off");
  const [budget, setBudget] = useState(row.monthly_budget_usd == null ? "" : String(row.monthly_budget_usd));

  useEffect(() => {
    setAccess(row.enabled == null ? "default" : row.enabled ? "on" : "off");
    setBudget(row.monthly_budget_usd == null ? "" : String(row.monthly_budget_usd));
  }, [row.enabled, row.monthly_budget_usd]);

  const dirty =
    access !== (row.enabled == null ? "default" : row.enabled ? "on" : "off") ||
    budget !== (row.monthly_budget_usd == null ? "" : String(row.monthly_budget_usd));

  const save = useMutation({
    mutationFn: () =>
      apiRequest(`/super-admin/accounts/${row.account_uuid}/assistant`, {
        method: "PUT",
        body: { enabled: access === "default" ? null : access === "on", monthly_budget_usd: numOrNull(budget) },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [ACCOUNTS_URL] });
      toast({ title: t("common.success"), description: t("assistantAdmin.companySaved", { company: row.company_name }) });
    },
    onError: (e: any) =>
      toast({ title: t("common.error"), description: e?.message || t("assistantAdmin.saveFailed"), variant: "destructive" }),
  });

  const defaultState = platform?.enabled_by_default ? t("assistantAdmin.on") : t("assistantAdmin.off");
  const defaultBudget =
    platform?.monthly_budget_usd == null ? t("assistantAdmin.noCap") : `$${usd(platform.monthly_budget_usd)}`;

  return (
    <TableRow>
      <TableCell className="font-medium">
        {row.company_name}
        {row.effective_enabled ? null : (
          <Badge variant="secondary" className="ms-2">
            {t("assistantAdmin.off")}
          </Badge>
        )}
      </TableCell>
      <TableCell>
        <Select value={access} onValueChange={setAccess}>
          <SelectTrigger className="w-40">
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
          className="w-36"
          type="number"
          min={0}
          step="0.01"
          value={budget}
          placeholder={t("assistantAdmin.companyBudgetPlaceholder", { value: defaultBudget })}
          onChange={(e) => setBudget(e.target.value)}
        />
      </TableCell>
      <TableCell className="whitespace-nowrap text-sm text-gray-600">
        {t("assistantAdmin.spend", { spend: usd(row.month_spend_usd), count: String(row.month_questions) })}
      </TableCell>
      <TableCell>
        <Button size="sm" variant="outline" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
          {t("assistantAdmin.save")}
        </Button>
      </TableCell>
    </TableRow>
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
