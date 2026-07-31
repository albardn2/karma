import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AppLayout } from "@/components/layout/AppLayout";
import { useLanguage } from "@/contexts/LanguageContext";
import { apiRequest } from "@/lib/queryClient";

interface BillingEntry {
  uuid: string;
  entry_type: "charge" | "payment" | "adjustment";
  amount: number;
  currency: string;
  period: string | null;
  notes: string | null;
  created_at: string;
  paid_amount?: number;
  outstanding?: number;
  is_paid?: boolean;
  settles_period?: string | null;
}

interface BillingData {
  company_name: string;
  subscription: { rate: number | null; currency: string | null; type: string };
  billing_day: string;
  next_charge_on: string;
  balances: Record<string, number>;
  total_outstanding: Record<string, number>;
  unpaid_count: number;
  entries: BillingEntry[];
}

const money = (amount: number, currency: string) =>
  `${amount < 0 ? "-" : ""}${Math.abs(amount).toFixed(2)} ${currency}`;

const shortDate = (iso: string) => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString();
};

/**
 * Format a date-only "YYYY-MM-DD" without letting a timezone move it.
 *
 * `new Date("2026-07-18")` is parsed as UTC midnight, so `.getDate()` in a negative
 * offset returns the 17th — which had this page telling a company it was billed on
 * the 17th when its anchor is the 18th. Billing dates are calendar facts with no
 * time and no zone, so they are split rather than parsed.
 */
const plainDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString();
};

const plainDayOfMonth = (iso: string) => Number(iso.split("-")[2]) || 0;

/**
 * A company's view of its own account, as opposed to the super-admin console, which
 * is the platform owner's view of every tenant.
 *
 * Tabbed from the start even with one tab: this is where anything account-wide
 * belongs, and adding the second tab should not mean restructuring the page.
 *
 * Billing is READ-ONLY. A company can see what it subscribes to, what it has been
 * charged and what is still owed, but payments are recorded by the platform owner —
 * the company is not the party receiving the money.
 */
export default function AccountSettings() {
  const { t } = useLanguage();
  const { data, isLoading, error } = useQuery<BillingData>({
    queryKey: ["/account/billing"],
    queryFn: async () => await apiRequest("/account/billing"),
  });

  const sub = data?.subscription;
  const outstanding = Object.entries(data?.total_outstanding ?? {});

  return (
    <AppLayout>
      <div className="p-4 sm:p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {t("accountSettings.title")}
          </h1>
          {data?.company_name && (
            <p className="text-sm text-gray-500">{data.company_name}</p>
          )}
        </div>

        <Tabs defaultValue="billing">
          <TabsList>
            <TabsTrigger value="billing" data-testid="tab-billing">
              {t("accountSettings.billing")}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="billing" className="space-y-6 pt-4">
            {isLoading ? (
              <p className="text-sm text-gray-500">{t("common.loading")}</p>
            ) : error ? (
              <p className="text-sm text-red-600">{t("accountSettings.loadFailed")}</p>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-gray-500">
                        {t("accountSettings.subscription")}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {sub?.rate != null && sub.currency ? (
                        <>
                          <p className="text-2xl font-bold" data-testid="subscription-rate">
                            {money(sub.rate, sub.currency)}
                          </p>
                          <p className="text-xs text-gray-500">
                            {t(
                              sub.type === "per_user"
                                ? "accountSettings.perUserPerMonth"
                                : "accountSettings.perMonth",
                            )}
                          </p>
                        </>
                      ) : (
                        // Not an error: an account with no rate is simply not being
                        // billed yet, and saying so beats showing "0.00".
                        <p className="text-sm text-gray-500">
                          {t("accountSettings.noSubscription")}
                        </p>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-gray-500">
                        {t("accountSettings.outstanding")}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {outstanding.length === 0 ? (
                        <p className="text-2xl font-bold text-green-600" data-testid="all-settled">
                          {t("accountSettings.allSettled")}
                        </p>
                      ) : (
                        <>
                          {outstanding.map(([currency, amount]) => (
                            <p
                              key={currency}
                              className="text-2xl font-bold text-red-600"
                              data-testid={`outstanding-${currency}`}
                            >
                              {money(amount, currency)}
                            </p>
                          ))}
                          <p className="text-xs text-gray-500">
                            {t("accountSettings.acrossCharges", {
                              count: data?.unpaid_count ?? 0,
                            })}
                          </p>
                        </>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-gray-500">
                        {t("accountSettings.nextCharge")}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-2xl font-bold" data-testid="next-charge">
                        {plainDate(data!.next_charge_on)}
                      </p>
                      <p className="text-xs text-gray-500">
                        {t("accountSettings.billedOn", {
                          day: plainDayOfMonth(data!.billing_day),
                        })}
                      </p>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">
                      {t("accountSettings.history")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {!data?.entries.length ? (
                      <p className="text-sm text-gray-500">
                        {t("accountSettings.noHistory")}
                      </p>
                    ) : (
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-start">
                                {t("accountSettings.type")}
                              </TableHead>
                              <TableHead className="text-start">
                                {t("accountSettings.amount")}
                              </TableHead>
                              <TableHead className="text-start">
                                {t("accountSettings.period")}
                              </TableHead>
                              <TableHead className="text-start">
                                {t("common.date")}
                              </TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {data.entries.map((entry) => (
                              <TableRow key={entry.uuid} data-testid={`entry-${entry.uuid}`}>
                                <TableCell>
                                  <Badge
                                    variant={
                                      entry.entry_type === "payment" ? "secondary" : "outline"
                                    }
                                  >
                                    {t(`accountSettings.${entry.entry_type}`)}
                                  </Badge>
                                </TableCell>
                                <TableCell
                                  className={`font-medium ${
                                    entry.amount < 0 ? "text-red-600" : "text-green-600"
                                  }`}
                                >
                                  {money(entry.amount, entry.currency)}
                                </TableCell>
                                <TableCell className="text-gray-600">
                                  {entry.entry_type === "charge" ? (
                                    <div className="flex items-center gap-2">
                                      <span>{entry.period ?? "—"}</span>
                                      {entry.is_paid ? (
                                        <Badge
                                          variant="outline"
                                          className="border-green-300 bg-green-50 text-green-700"
                                        >
                                          {t("accountSettings.paid")}
                                        </Badge>
                                      ) : (
                                        <Badge
                                          variant="outline"
                                          className="border-amber-300 bg-amber-50 text-amber-700"
                                        >
                                          {money(entry.outstanding ?? 0, entry.currency)}{" "}
                                          {t("accountSettings.due")}
                                        </Badge>
                                      )}
                                    </div>
                                  ) : entry.settles_period ? (
                                    <span className="text-xs">
                                      {t("accountSettings.settled")} {entry.settles_period}
                                    </span>
                                  ) : (
                                    (entry.period ?? "—")
                                  )}
                                </TableCell>
                                <TableCell className="text-gray-600">
                                  {shortDate(entry.created_at)}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
