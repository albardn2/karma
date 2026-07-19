import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Landmark, LogIn } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatDate, formatCurrency } from "@/lib/utils";

const CURRENCIES = ["USD", "SYP", "EUR", "TRY"];
const PER_PAGE = 20;
const LEDGER_PER_PAGE = 10;

type Balances = Record<string, number>;

interface SuperAccount {
  uuid: string;
  company_name: string;
  email: string | null;
  phone_number: string | null;
  created_at: string;
  is_blocked: boolean;
  subscription_rate: number | null;
  subscription_currency: string | null;
  user_count: number;
  subscription_type?: string;
  balances: Balances;
  is_deleted: boolean;
}

interface AccountsPage {
  accounts: SuperAccount[];
  total_count: number;
  page: number;
  per_page: number;
  total_pages: number;
}

type LedgerEntryType = "payment" | "charge" | "adjustment";

interface LedgerEntry {
  uuid: string;
  entry_type: LedgerEntryType;
  amount: number;
  currency: string;
  period: string | null;
  notes: string | null;
  created_at: string;
}

interface LedgerPage {
  entries: LedgerEntry[];
  balances: Balances;
  total_count: number;
  page: number;
  per_page: number;
  total_pages: number;
}

const entryBadgeVariant = (type: LedgerEntryType): "default" | "secondary" | "outline" =>
  type === "payment" ? "default" : type === "charge" ? "secondary" : "outline";

function BalancesCell({ balances }: { balances: Balances | undefined }) {
  const entries = Object.entries(balances ?? {});
  if (entries.length === 0) {
    return <span className="text-gray-400">—</span>;
  }
  return (
    <div className="space-y-0.5">
      {entries.map(([currency, amount]) => (
        <div
          key={currency}
          className={`text-sm font-medium ${amount < 0 ? "text-red-600" : "text-gray-900"}`}
        >
          {formatCurrency(amount, currency)}
        </div>
      ))}
    </div>
  );
}

export default function AccountsAdmin() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { toast } = useToast();

  const [page, setPage] = useState(1);
  const [selectedUuid, setSelectedUuid] = useState<string | null>(null);
  const [blockConfirmOpen, setBlockConfirmOpen] = useState(false);

  // subscription form
  const [rate, setRate] = useState("");
  const [rateCurrency, setRateCurrency] = useState("");
  const [subType, setSubType] = useState<"flat" | "per_user">("flat");

  // add-ledger-entry form
  const [entryType, setEntryType] = useState<LedgerEntryType>("payment");
  const [entryAmount, setEntryAmount] = useState("");
  const [entryCurrency, setEntryCurrency] = useState("");
  const [entryPeriod, setEntryPeriod] = useState("");
  const [entryNotes, setEntryNotes] = useState("");
  const [ledgerPage, setLedgerPage] = useState(1);

  // /auth/me returns snake_case; the typed camelCase field is never populated
  const permissionScope: string =
    (user as any)?.permissionScope ?? (user as any)?.permission_scope ?? "";
  const isSuperuser = permissionScope.includes("superuser");

  const {
    data: accountsData,
    isLoading,
    error,
  } = useQuery<AccountsPage>({
    queryKey: [`/super-admin/accounts?page=${page}&per_page=${PER_PAGE}`],
    enabled: isSuperuser,
  });

  const { data: accountDetail } = useQuery<SuperAccount>({
    queryKey: [`/super-admin/accounts/${selectedUuid}`],
    enabled: isSuperuser && !!selectedUuid,
  });

  const { data: ledgerData } = useQuery<LedgerPage>({
    queryKey: [
      `/super-admin/accounts/${selectedUuid}/ledger?page=${ledgerPage}&per_page=${LEDGER_PER_PAGE}`,
    ],
    enabled: isSuperuser && !!selectedUuid,
  });

  const selected: SuperAccount | undefined =
    (accountDetail && accountDetail.uuid === selectedUuid ? accountDetail : undefined) ??
    accountsData?.accounts.find((a) => a.uuid === selectedUuid);

  const invalidateAccounts = () => {
    queryClient.invalidateQueries({
      predicate: (query) =>
        typeof query.queryKey[0] === "string" &&
        (query.queryKey[0] as string).startsWith("/super-admin/accounts"),
    });
  };

  const updateMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      return await apiRequest(`/super-admin/accounts/${selectedUuid}`, { method: "PUT", body });
    },
    onSuccess: () => {
      invalidateAccounts();
      toast({ title: t("common.success"), description: t("misc.accounts.updated") });
    },
    onError: () => {
      toast({
        title: t("common.error"),
        description: t("misc.accounts.updateFailed"),
        variant: "destructive",
      });
    },
  });

  const addEntryMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      return await apiRequest(`/super-admin/accounts/${selectedUuid}/ledger`, {
        method: "POST",
        body,
      });
    },
    onSuccess: () => {
      invalidateAccounts();
      setEntryAmount("");
      setEntryPeriod("");
      setEntryNotes("");
      setLedgerPage(1);
      toast({ title: t("common.success"), description: t("misc.accounts.entryAdded") });
    },
    onError: () => {
      toast({
        title: t("common.error"),
        description: t("misc.accounts.entryFailed"),
        variant: "destructive",
      });
    },
  });

  const impersonateMutation = useMutation({
    mutationFn: async (uuid: string) => {
      return await apiRequest(`/super-admin/accounts/${uuid}/impersonate`, { method: "POST" });
    },
    onSuccess: (data: { access_token: string }) => {
      const current = localStorage.getItem("auth_token");
      if (current) {
        localStorage.setItem("auth_token_original", current);
      }
      localStorage.setItem("auth_token", data.access_token);
      window.location.href = "/";
    },
    onError: () => {
      toast({
        title: t("common.error"),
        description: t("misc.accounts.impersonateFailed"),
        variant: "destructive",
      });
    },
  });

  const openAccount = (account: SuperAccount) => {
    setSelectedUuid(account.uuid);
    setRate(account.subscription_rate != null ? String(account.subscription_rate) : "");
    setRateCurrency(account.subscription_currency ?? "");
    setSubType((account.subscription_type as "flat" | "per_user") ?? "flat");
    setEntryType("payment");
    setEntryAmount("");
    setEntryCurrency(account.subscription_currency ?? "");
    setEntryPeriod("");
    setEntryNotes("");
    setLedgerPage(1);
    setBlockConfirmOpen(false);
  };

  const handleAddEntry = () => {
    const body: Record<string, unknown> = { entry_type: entryType };
    if (entryAmount.trim() !== "") body.amount = Number(entryAmount);
    if (entryCurrency) body.currency = entryCurrency;
    if (entryType === "charge" && entryPeriod) body.period = entryPeriod;
    if (entryNotes.trim()) body.notes = entryNotes.trim();
    addEntryMutation.mutate(body);
  };

  const parsedEntryAmount = entryAmount.trim() === "" ? null : Number(entryAmount);
  const entryAmountValid =
    entryType === "payment"
      ? parsedEntryAmount !== null && !Number.isNaN(parsedEntryAmount) && parsedEntryAmount > 0
      : entryType === "adjustment"
        ? parsedEntryAmount !== null && !Number.isNaN(parsedEntryAmount) && parsedEntryAmount !== 0
        : parsedEntryAmount === null || !Number.isNaN(parsedEntryAmount);
  const entryCurrencyValid = !!entryCurrency || !!selected?.subscription_currency;
  const canSubmitEntry = entryAmountValid && entryCurrencyValid && !addEntryMutation.isPending;

  const parsedRate = rate.trim() === "" ? null : Number(rate);
  const canSaveSubscription =
    parsedRate !== null &&
    !Number.isNaN(parsedRate) &&
    parsedRate >= 0 &&
    !!rateCurrency &&
    !updateMutation.isPending;

  if (!isSuperuser) {
    return (
      <AppLayout>
        <div className="flex-1 overflow-auto p-4 lg:p-6">
          <div className="text-center py-12">
            <p className="text-gray-600">{t("common.accessDenied")}</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (error) {
    return (
      <AppLayout>
        <div className="flex-1 overflow-auto p-4 lg:p-6">
          <div className="text-center py-12">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {t("misc.accounts.loadError")}
            </h3>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="flex-1 overflow-auto p-4 lg:p-6">
        <div className="space-y-6">
          {/* Header */}
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t("misc.accounts.title")}</h1>
            <p className="text-gray-600">
              {accountsData
                ? t("misc.accounts.count", { count: accountsData.total_count })
                : t("common.loading")}
            </p>
          </div>

          {/* Accounts table */}
          <Card>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-6 space-y-3 animate-pulse">
                  <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                  <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                  <div className="h-4 bg-gray-200 rounded w-2/3"></div>
                </div>
              ) : !accountsData || accountsData.accounts.length === 0 ? (
                <div className="text-center py-12">
                  <Landmark className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-gray-900">
                    {t("misc.accounts.noneFound")}
                  </h3>
                </div>
              ) : (
                <Table data-testid="accounts-table">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-start">{t("misc.accounts.company")}</TableHead>
                      <TableHead className="text-start">{t("misc.accounts.created")}</TableHead>
                      <TableHead className="text-start">{t("misc.accounts.users")}</TableHead>
                      <TableHead className="text-start">{t("misc.accounts.subscription")}</TableHead>
                      <TableHead className="text-start">{t("misc.accounts.balance")}</TableHead>
                      <TableHead className="text-start">{t("common.status")}</TableHead>
                      <TableHead className="text-start">{t("common.actions")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {accountsData.accounts.map((account) => (
                      <TableRow
                        key={account.uuid}
                        data-testid={`account-row-${account.uuid}`}
                        className="cursor-pointer"
                        onClick={() => openAccount(account)}
                      >
                        <TableCell className="font-medium text-gray-900">
                          {account.company_name}
                        </TableCell>
                        <TableCell className="text-gray-600">
                          {formatDate(account.created_at)}
                        </TableCell>
                        <TableCell className="text-gray-600">{account.user_count}</TableCell>
                        <TableCell className="text-gray-600">
                          {account.subscription_rate != null && account.subscription_currency
                            ? formatCurrency(account.subscription_rate, account.subscription_currency)
                            : "—"}
                        </TableCell>
                        <TableCell>
                          <BalancesCell balances={account.balances} />
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {account.is_blocked && (
                              <Badge variant="destructive">{t("misc.accounts.blocked")}</Badge>
                            )}
                            {account.is_deleted && (
                              <Badge variant="outline">{t("misc.accounts.deleted")}</Badge>
                            )}
                            {!account.is_blocked && !account.is_deleted && (
                              <Badge variant="default">{t("misc.accounts.active")}</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              openAccount(account);
                            }}
                          >
                            {t("misc.accounts.manage")}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Pagination */}
          {accountsData && accountsData.total_pages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-700">
                {t("misc.accounts.showingPage", { page, pages: accountsData.total_pages })}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                >
                  <ChevronLeft className="h-4 w-4 me-1 rtl:rotate-180" />
                  {t("common.previous")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={page >= accountsData.total_pages}
                >
                  {t("common.next")}
                  <ChevronRight className="h-4 w-4 ms-1 rtl:rotate-180" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Account detail dialog */}
      <Dialog
        open={!!selectedUuid}
        onOpenChange={(open) => {
          if (!open) setSelectedUuid(null);
        }}
      >
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {selected.company_name}
                  {selected.is_blocked && (
                    <Badge variant="destructive">{t("misc.accounts.blocked")}</Badge>
                  )}
                </DialogTitle>
                <DialogDescription>
                  {[
                    t("misc.accounts.usersCount", { count: selected.user_count }),
                    ...[selected.email, selected.phone_number].filter(Boolean),
                  ].join(" · ")}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-6">
                {/* Block / unblock */}
                <div className="flex items-center justify-between rounded-lg border border-gray-200 p-4">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {t("misc.accounts.blockAccount")}
                    </p>
                    <p className="text-sm text-gray-500">{t("misc.accounts.blockHint")}</p>
                  </div>
                  <Switch
                    data-testid="account-block-switch"
                    checked={selected.is_blocked}
                    disabled={updateMutation.isPending}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setBlockConfirmOpen(true);
                      } else {
                        updateMutation.mutate({ is_blocked: false });
                      }
                    }}
                  />
                </div>

                {/* Subscription */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">{t("misc.accounts.subscription")}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
                      <div className="flex-1 space-y-2">
                        <Label>{t("misc.accounts.billingModel")}</Label>
                        <Select
                          value={subType}
                          onValueChange={(v) => setSubType(v as "flat" | "per_user")}
                        >
                          <SelectTrigger data-testid="account-subtype-select">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="flat">{t("misc.accounts.flatRate")}</SelectItem>
                            <SelectItem value="per_user">{t("misc.accounts.perUser")}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex-1 space-y-2">
                        <Label htmlFor="account-rate">
                          {subType === "per_user"
                            ? t("misc.accounts.ratePerUser")
                            : t("misc.accounts.monthlyRate")}
                        </Label>
                        <Input
                          id="account-rate"
                          data-testid="account-rate-input"
                          type="number"
                          min="0"
                          step="0.01"
                          value={rate}
                          onChange={(e) => setRate(e.target.value)}
                        />
                      </div>
                      <div className="flex-1 space-y-2">
                        <Label>{t("misc.accounts.currency")}</Label>
                        <Select value={rateCurrency} onValueChange={setRateCurrency}>
                          <SelectTrigger data-testid="account-currency-select">
                            <SelectValue placeholder={t("misc.accounts.noSubscription")} />
                          </SelectTrigger>
                          <SelectContent>
                            {CURRENCIES.map((currency) => (
                              <SelectItem key={currency} value={currency}>
                                {currency}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <Button
                        data-testid="account-save-subscription"
                        disabled={!canSaveSubscription}
                        onClick={() =>
                          updateMutation.mutate({
                            subscription_rate: Number(rate),
                            subscription_currency: rateCurrency,
                            subscription_type: subType,
                          })
                        }
                      >
                        {t("common.save")}
                      </Button>
                    </div>
                    {subType === "per_user" && rate && Number(rate) > 0 && (
                      <p className="mt-3 text-xs text-gray-500">
                        {t("misc.accounts.estMonthly", {
                          amount: (Number(rate) * selected.user_count).toLocaleString(),
                          currency: rateCurrency || selected.subscription_currency || "",
                          count: selected.user_count,
                          rate: Number(rate).toLocaleString(),
                        })}
                      </p>
                    )}
                  </CardContent>
                </Card>

                {/* Balances + ledger */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">{t("misc.accounts.balances")}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <BalancesCell balances={ledgerData?.balances ?? selected.balances} />

                    <div>
                      <p className="text-sm font-medium text-gray-900 mb-2">
                        {t("misc.accounts.ledger")}
                      </p>
                      {!ledgerData || ledgerData.entries.length === 0 ? (
                        <p className="text-sm text-gray-500">{t("misc.accounts.noEntries")}</p>
                      ) : (
                        <>
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="text-start">
                                  {t("misc.accounts.type")}
                                </TableHead>
                                <TableHead className="text-start">
                                  {t("misc.accounts.amount")}
                                </TableHead>
                                <TableHead className="text-start">
                                  {t("misc.accounts.period")}
                                </TableHead>
                                <TableHead className="text-start">{t("common.notes")}</TableHead>
                                <TableHead className="text-start">{t("common.date")}</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {ledgerData.entries.map((entry) => (
                                <TableRow key={entry.uuid}>
                                  <TableCell>
                                    <Badge variant={entryBadgeVariant(entry.entry_type)}>
                                      {t(`misc.accounts.${entry.entry_type}`)}
                                    </Badge>
                                  </TableCell>
                                  <TableCell
                                    className={`font-medium ${
                                      entry.amount < 0
                                        ? "text-red-600"
                                        : entry.amount > 0
                                          ? "text-green-600"
                                          : "text-gray-600"
                                    }`}
                                  >
                                    {formatCurrency(entry.amount, entry.currency)}
                                  </TableCell>
                                  <TableCell className="text-gray-600">
                                    {entry.period ?? "—"}
                                  </TableCell>
                                  <TableCell className="text-gray-600 max-w-[12rem] truncate">
                                    {entry.notes ?? "—"}
                                  </TableCell>
                                  <TableCell className="text-gray-600">
                                    {formatDate(entry.created_at)}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>

                          {ledgerData.total_pages > 1 && (
                            <div className="flex items-center justify-between mt-3">
                              <p className="text-sm text-gray-700">
                                {t("misc.accounts.showingPage", {
                                  page: ledgerPage,
                                  pages: ledgerData.total_pages,
                                })}
                              </p>
                              <div className="flex items-center gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setLedgerPage((p) => Math.max(1, p - 1))}
                                  disabled={ledgerPage <= 1}
                                >
                                  {t("common.previous")}
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setLedgerPage((p) => p + 1)}
                                  disabled={ledgerPage >= ledgerData.total_pages}
                                >
                                  {t("common.next")}
                                </Button>
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>

                    {/* Add entry */}
                    <div className="rounded-lg border border-gray-200 p-4 space-y-3">
                      <p className="text-sm font-medium text-gray-900">
                        {t("misc.accounts.addEntry")}
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <Label>{t("misc.accounts.type")}</Label>
                          <Select
                            value={entryType}
                            onValueChange={(value) => setEntryType(value as LedgerEntryType)}
                          >
                            <SelectTrigger data-testid="ledger-add-type">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="payment">{t("misc.accounts.payment")}</SelectItem>
                              <SelectItem value="charge">{t("misc.accounts.charge")}</SelectItem>
                              <SelectItem value="adjustment">
                                {t("misc.accounts.adjustment")}
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>{t("misc.accounts.amount")}</Label>
                          <Input
                            data-testid="ledger-add-amount"
                            type="number"
                            step="0.01"
                            value={entryAmount}
                            onChange={(e) => setEntryAmount(e.target.value)}
                          />
                          {entryType === "charge" && (
                            <p className="text-xs text-gray-500">
                              {t("misc.accounts.chargeAmountHint")}
                            </p>
                          )}
                        </div>
                        <div className="space-y-2">
                          <Label>{t("misc.accounts.currency")}</Label>
                          <Select value={entryCurrency} onValueChange={setEntryCurrency}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {CURRENCIES.map((currency) => (
                                <SelectItem key={currency} value={currency}>
                                  {currency}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        {entryType === "charge" && (
                          <div className="space-y-2">
                            <Label>{t("misc.accounts.period")}</Label>
                            <Input
                              type="month"
                              value={entryPeriod}
                              onChange={(e) => setEntryPeriod(e.target.value)}
                            />
                          </div>
                        )}
                        <div className="space-y-2 sm:col-span-2">
                          <Label>{t("common.notes")}</Label>
                          <Input
                            value={entryNotes}
                            onChange={(e) => setEntryNotes(e.target.value)}
                          />
                        </div>
                      </div>
                      <Button
                        data-testid="ledger-add-submit"
                        size="sm"
                        disabled={!canSubmitEntry}
                        onClick={handleAddEntry}
                      >
                        {t("misc.accounts.addEntry")}
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* Impersonate */}
                <div className="flex justify-end">
                  <Button
                    data-testid="account-impersonate"
                    variant="outline"
                    disabled={impersonateMutation.isPending}
                    onClick={() => impersonateMutation.mutate(selected.uuid)}
                  >
                    <LogIn className="h-4 w-4 me-2" />
                    {t("misc.accounts.impersonate")}
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Block confirmation */}
      <AlertDialog open={blockConfirmOpen} onOpenChange={setBlockConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("misc.accounts.blockConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("misc.accounts.blockConfirmDesc", { company: selected?.company_name ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={() => updateMutation.mutate({ is_blocked: true })}
            >
              {t("misc.accounts.blockAccount")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
