import { useState, useEffect, useRef } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ArrowLeft, Save, ArrowRightLeft, Building2, Wallet } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useLanguage } from "@/contexts/LanguageContext";

interface TransactionCreateData {
  from_amount?: number;
  from_currency?: string;
  from_account_uuid?: string;
  to_account_uuid?: string;
  to_currency?: string;
  to_amount?: number;
  usd_to_syp_exchange_rate?: number;
  notes?: string;
}

interface FinancialAccount {
  uuid: string;
  account_name: string;
  account_type: string;
  currency: string;
  balance: number;
}

interface LatestExchangeRate {
  // SYP per 1 USD, OLD Syrian pounds — the same unit this form's rate field
  // and every other SYP amount in the app use
  rate: number;
  rate_date: string;
}

export default function TransactionCreate() {
  const { t, te } = useLanguage();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [formData, setFormData] = useState<TransactionCreateData>({});

  // Get the referrer from URL params or localStorage, default to transactions list
  const urlParams = new URLSearchParams(window.location.search);
  const referrer = urlParams.get('referrer') || localStorage.getItem('transaction_create_referrer') || '/transactions';
  
  // Store referrer in localStorage for form persistence
  if (urlParams.get('referrer')) {
    localStorage.setItem('transaction_create_referrer', urlParams.get('referrer')!);
  }

  // Fetch currencies
  const { data: currencies = [] } = useQuery({
    queryKey: ["/payment/currencies"],
    queryFn: () => apiRequest("/payment/currencies"),
  });

  // Fetch financial accounts
  const { data: accountsData, isLoading: accountsLoading, error: accountsError } = useQuery({
    queryKey: ["/financial-account/"],
    queryFn: () => apiRequest("/financial-account/?per_page=100"),
    retry: 1,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Most recent recorded USD->SYP rate, used as the default for the rate field.
  // The pair is always asked for in that direction because that is the
  // direction the field itself is in (usd_to_syp_exchange_rate); a SYP->USD
  // transfer divides by the same number.
  // /exchange-rate/latest answers 404 when nothing has been recorded yet, and
  // apiRequest turns any non-2xx into a thrown Error — so retry is off and the
  // rejection is simply left to sit in `error`. `data` stays undefined, which
  // is exactly the "no default available" case; nothing is surfaced to the user.
  const { data: latestRate } = useQuery<LatestExchangeRate>({
    queryKey: ["/exchange-rate/latest"],
    queryFn: () => apiRequest("/exchange-rate/latest?from_currency=USD&to_currency=SYP"),
    retry: false,
  });

  // Extract accounts from the correct property
  const accounts = accountsData?.accounts || [];
  
  console.log("Full accounts response:", accountsData);
  console.log("Extracted accounts:", accounts);
  console.log("Accounts length:", accounts.length);

  const createMutation = useMutation({
    mutationFn: (data: TransactionCreateData) =>
      apiRequest("/transaction/", {
        method: "POST",
        body: data,
      }),
    onSuccess: () => {
      // Invalidate relevant caches to refresh data
      queryClient.invalidateQueries({ queryKey: ["/transaction/"] });
      
      toast({
        title: t('common.success'),
        description: t('financial.transactionCreated'),
      });
      // Clear the referrer and redirect back
      localStorage.removeItem('transaction_create_referrer');
      setLocation(referrer);
    },
    onError: (error: any) => {
      toast({
        title: t('common.error'),
        description: error.message || t('financial.failedCreateTransaction'),
        variant: "destructive",
      });
    },
  });

  const handleSubmit = () => {
    // Basic validation
    // One side is enough: a from-only transaction is money out, a to-only one is
    // money in. Requiring both made those flows unreachable from the UI even
    // though the API supports them.
    if (!formData.from_account_uuid && !formData.to_account_uuid) {
      toast({
        title: t('financial.validationError'),
        description: t('financial.oneAccountRequired'),
        variant: "destructive",
      });
      return;
    }

    const fromAmt = formData.from_account_uuid ? formData.from_amount : undefined;
    const toAmt = formData.to_account_uuid ? formData.to_amount : undefined;
    if (
      (formData.from_account_uuid && !(fromAmt && fromAmt > 0)) ||
      (formData.to_account_uuid && !(toAmt && toAmt > 0))
    ) {
      toast({
        title: t('financial.validationError'),
        description: t('financial.amountMustBePositive'),
        variant: "destructive",
      });
      return;
    }

    if (formData.from_account_uuid === formData.to_account_uuid) {
      toast({
        title: t('financial.validationError'),
        description: t('financial.fromToSame'),
        variant: "destructive",
      });
      return;
    }

    // Send only the side(s) actually filled in — the API rejects a from-only
    // transaction that also carries to_* fields, and vice versa.
    const isExchange =
      !!formData.from_account_uuid &&
      !!formData.to_account_uuid &&
      formData.from_currency !== formData.to_currency;
    const shaped: Record<string, unknown> = { notes: formData.notes };
    if (formData.from_account_uuid) {
      shaped.from_account_uuid = formData.from_account_uuid;
      shaped.from_amount = formData.from_amount;
      shaped.from_currency = formData.from_currency;
    }
    if (formData.to_account_uuid) {
      shaped.to_account_uuid = formData.to_account_uuid;
      shaped.to_amount = formData.to_amount;
      shaped.to_currency = formData.to_currency;
    }
    if (isExchange) {
      shaped.usd_to_syp_exchange_rate = formData.usd_to_syp_exchange_rate;
    }

    const payload = Object.fromEntries(
      Object.entries(shaped).filter(([_, value]) => value !== "" && value !== undefined && value !== null)
    ) as TransactionCreateData;

    createMutation.mutate(payload);
  };

  const handleCancel = () => {
    localStorage.removeItem('transaction_create_referrer');
    setLocation(referrer);
  };

  // Auto-populate currency when account is selected
  const handleFromAccountChange = (accountUuid: string) => {
    const account = accounts.find((acc: FinancialAccount) => acc.uuid === accountUuid);
    setFormData(prev => ({
      ...prev,
      from_account_uuid: accountUuid,
      from_currency: account?.currency || prev.from_currency
    }));
  };

  const handleToAccountChange = (accountUuid: string) => {
    const account = accounts.find((acc: FinancialAccount) => acc.uuid === accountUuid);
    setFormData(prev => ({
      ...prev,
      to_account_uuid: accountUuid,
      to_currency: account?.currency || prev.to_currency
    }));
  };

  // On a two-sided transfer the destination amount is computed, not typed
  const isDerivedToAmount = !!formData.from_account_uuid && !!formData.to_account_uuid;

  // A rate is needed whenever the two sides are in DIFFERENT currencies — in
  // either direction. Gating this on USD->SYP alone hid the field for SYP->USD
  // and, worse, told the user "no exchange rate needed" while the API refused
  // the submission without one.
  const needsRate =
    !!formData.from_currency &&
    !!formData.to_currency &&
    formData.from_currency !== formData.to_currency;

  // Seed the rate field from the last recorded rate. Deliberately its OWN
  // effect: folding it into the to_amount derivation below would have that
  // effect both read and write the rate while listing it as a dependency,
  // i.e. a write -> dep -> write cycle.
  //
  // Two guards, doing two different jobs:
  //  - the `!== undefined` check keeps a value the user typed from being
  //    overwritten when the query resolves late;
  //  - the ref makes the seed happen at most once. The value check alone is
  //    not enough, because clearing the input sets the field back to
  //    `undefined`, which re-satisfies it and re-seeds on the very next run —
  //    the field would be impossible to clear. The ref is what makes an
  //    explicit clear stick.
  // The rate stays in the dep list so the guard always reads current state
  // rather than a stale closure; the ref is what stops the re-seed, not the
  // dep list.
  const rateSeededRef = useRef(false);
  useEffect(() => {
    if (rateSeededRef.current) return;
    if (!needsRate) return;
    if (!latestRate?.rate) return;
    if (formData.usd_to_syp_exchange_rate !== undefined) return;

    rateSeededRef.current = true;
    setFormData(prev => ({ ...prev, usd_to_syp_exchange_rate: latestRate.rate }));
  }, [needsRate, latestRate, formData.usd_to_syp_exchange_rate]);

  // Whether the number currently in the field is the stored one, so the hint
  // under the input disappears as soon as the user changes it.
  const rateIsFromStoredRate =
    !!latestRate && formData.usd_to_syp_exchange_rate === latestRate.rate;

  // Calculate to_amount based on exchange rate and from_amount
  // The destination amount is never a free choice on a transfer: the API
  // requires it to equal the converted source amount (to 2 decimals), so derive
  // it from the source amount, the currencies and the rate instead of making
  // the user compute it and press a button.
  useEffect(() => {
    const { from_account_uuid, to_account_uuid, from_amount: amt,
            usd_to_syp_exchange_rate: rate, from_currency, to_currency } = formData;

    // only a two-sided transfer has a derivable destination amount; on a
    // deposit (to-only) the user types it directly, so leave it alone
    if (!from_account_uuid || !to_account_uuid || !from_currency || !to_currency) return;
    if (!amt) return;

    // 2dp, because that is what the API compares at and an unrounded product
    // carries float noise (3.3 * 14500.5 = 47851.649999999994)
    const round2 = (v: number) => Math.round(v * 100) / 100;

    let derived: number | undefined;
    if (from_currency === to_currency) {
      derived = round2(amt);
    } else if (rate) {
      derived =
        from_currency === 'USD' && to_currency === 'SYP'
          ? round2(amt * rate)
          : from_currency === 'SYP' && to_currency === 'USD'
          ? round2(amt / rate)
          : undefined;
    }

    if (derived !== undefined && derived !== formData.to_amount) {
      setFormData(prev => ({ ...prev, to_amount: derived }));
    }
  }, [
    formData.from_account_uuid,
    formData.to_account_uuid,
    formData.from_amount,
    formData.from_currency,
    formData.to_currency,
    formData.usd_to_syp_exchange_rate,
    formData.to_amount,
  ]);

  const formatCurrency = (amount: number, currency: string) => {
    const currencySymbols: { [key: string]: string } = {
      'USD': '$',
      'EUR': '€',
      'GBP': '£',
      'JPY': '¥',
      'CAD': 'C$',
      'AUD': 'A$',
      'CHF': 'CHF ',
      'CNY': '¥',
      'INR': '₹',
      'SYP': 'SYP ',
    };
    
    const symbol = currencySymbols[currency] || `${currency} `;
    return `${symbol}${amount.toFixed(2)}`;
  };

  const getAccountDisplay = (account: FinancialAccount) => {
    if (!account || !account.account_name || !account.currency) {
      console.log("Invalid account:", account);
      return t('financial.invalidAccount');
    }
    const balance = account.balance || 0;
    return `${account.account_name} (${formatCurrency(balance, account.currency)})`;
  };

  const fromAccount = accounts.find((acc: FinancialAccount) => acc.uuid === formData.from_account_uuid);
  const toAccount = accounts.find((acc: FinancialAccount) => acc.uuid === formData.to_account_uuid);

  return (
    <AppLayout>
      <div className="p-8 space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              onClick={handleCancel}
              variant="ghost"
              size="sm"
            >
              <ArrowLeft className="h-4 w-4 me-2" />
              {t('common.back')}
            </Button>
            <div>
              <h1 className="text-3xl font-medium text-gray-900 dark:text-gray-100">
                {t('financial.createTransaction')}
              </h1>
              <p className="text-gray-600 dark:text-gray-400">
                {t('financial.transferFundsDesc')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={handleCancel} variant="outline">
              {t('common.cancel')}
            </Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending} className="bg-[#5469D4] hover:bg-[#4356C7] text-white">
              <Save className="h-4 w-4 me-2" />
              {createMutation.isPending ? t('common.creating') : t('financial.createTransaction')}
            </Button>
          </div>
        </div>

        {/* Transaction Flow Visualization */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* From Account */}
          <Card className="relative">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Wallet className="h-5 w-5 text-green-600" />
                {t('financial.fromAccount')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="from_account">{t('financial.selectAccount')} *</Label>
                <Select value={formData.from_account_uuid || ""} onValueChange={handleFromAccountChange}>
                  <SelectTrigger>
                    <SelectValue placeholder={accountsLoading ? t('financial.loadingAccounts') : t('financial.chooseSourceAccount')} />
                  </SelectTrigger>
                  <SelectContent>
                    {accountsLoading ? (
                      <SelectItem value="loading" disabled>{t('financial.loadingAccounts')}</SelectItem>
                    ) : accountsError ? (
                      <SelectItem value="error" disabled>{t('financial.errorLoadingAccounts')}</SelectItem>
                    ) : accounts && accounts.length > 0 ? (
                      accounts.map((account: FinancialAccount) => (
                        <SelectItem key={account.uuid} value={account.uuid}>
                          {getAccountDisplay(account)}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="empty" disabled>{t('financial.noAccountsAvailable')}</SelectItem>
                    )}
                  </SelectContent>
                </Select>
                {accountsError && (
                  <p className="text-xs text-red-500">{t('financial.errorLoadingAccountsMsg', { message: accountsError.message })}</p>
                )}
              </div>

              {fromAccount && (
                <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Building2 className="h-4 w-4 text-green-600" />
                    <span className="font-medium text-green-800 dark:text-green-200">{fromAccount.account_name}</span>
                  </div>
                  <p className="text-sm text-green-700 dark:text-green-300">
                    {t('financial.currentBalance', { value: formatCurrency(fromAccount.balance, fromAccount.currency) })}
                  </p>
                  <p className="text-xs text-green-600 dark:text-green-400">
                    {te(fromAccount.account_type)}
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="from_amount">{t('common.amount')}</Label>
                <Input
                  id="from_amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={formData.from_amount || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, from_amount: parseFloat(e.target.value) || undefined }))}
                  placeholder={t('financial.enterAmount')}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="from_currency">{t('common.currency')}{fromAccount?.currency ? ` ${t('financial.autoFilled')}` : ''}</Label>
                <Select
                  value={formData.from_currency || ""}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, from_currency: value }))}
                  disabled={!!fromAccount?.currency}
                >
                  <SelectTrigger className={fromAccount?.currency ? "bg-green-50 dark:bg-green-900/20" : ""}>
                    <SelectValue placeholder={fromAccount?.currency ? fromAccount.currency : t('financial.selectCurrency')} />
                  </SelectTrigger>
                  <SelectContent>
                    {fromAccount?.currency ? (
                      <SelectItem value={fromAccount.currency}>
                        {fromAccount.currency} {t('financial.accountCurrency')}
                      </SelectItem>
                    ) : (
                      currencies.map((currency: string) => (
                        <SelectItem key={currency} value={currency}>
                          {currency}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Exchange Rate */}
          <Card className="relative flex items-center justify-center">
            <div className="absolute top-4 start-4 end-4">
              <CardTitle className="text-lg flex items-center gap-2 justify-center">
                <ArrowRightLeft className="h-5 w-5 text-[#5469D4]" />
                {t('financial.exchange')}
              </CardTitle>
            </div>
            <CardContent className="flex flex-col items-center justify-center space-y-4 pt-16">
              {needsRate && (
                <>
                  <div className="text-center">
                    <Label htmlFor="exchange_rate" className="text-sm font-medium">{t('financial.usdToSypRate')}</Label>
                    <div className="flex items-center gap-2 mt-2">
                      <Input
                        id="exchange_rate"
                        type="number"
                        step="0.01"
                        min="0"
                        value={formData.usd_to_syp_exchange_rate || ''}
                        onChange={(e) => setFormData(prev => ({ ...prev, usd_to_syp_exchange_rate: parseFloat(e.target.value) || undefined }))}
                        placeholder={t('financial.rate')}
                        className="text-center"
                      />
                    </div>
                    {rateIsFromStoredRate && (
                      <p
                        className="text-xs text-muted-foreground mt-1"
                        data-testid="rate-seeded-note"
                      >
                        {t('exchangeRates.seededFrom', { date: latestRate!.rate_date })}
                      </p>
                    )}
                  </div>
                  {formData.from_amount && formData.usd_to_syp_exchange_rate && (
                    <div className="text-center p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                      <p className="text-sm text-blue-800 dark:text-blue-200">
                        {formData.from_currency === 'USD' ? (
                          <>
                            ${formData.from_amount.toFixed(2)} × {formData.usd_to_syp_exchange_rate} = SYP{" "}
                            {(formData.from_amount * formData.usd_to_syp_exchange_rate).toFixed(2)}
                          </>
                        ) : (
                          <>
                            SYP {formData.from_amount.toFixed(2)} ÷ {formData.usd_to_syp_exchange_rate} = $
                            {(formData.from_amount / formData.usd_to_syp_exchange_rate).toFixed(2)}
                          </>
                        )}
                      </p>
                    </div>
                  )}
                </>
              )}
              
              {(!formData.from_currency || !formData.to_currency) && (
                <div className="text-center text-gray-500 dark:text-gray-400">
                  <ArrowRightLeft className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">{t('financial.selectCurrenciesHint')}</p>
                </div>
              )}

              {formData.from_currency && formData.to_currency && !needsRate && (
                <div className="text-center text-gray-500 dark:text-gray-400">
                  <ArrowRightLeft className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">{t('financial.directTransfer')}</p>
                  <p className="text-xs">{t('financial.noExchangeRateNeeded')}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* To Account */}
          <Card className="relative">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Wallet className="h-5 w-5 text-blue-600" />
                {t('financial.toAccount')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="to_account">{t('financial.selectAccount')} *</Label>
                <Select value={formData.to_account_uuid || ""} onValueChange={handleToAccountChange}>
                  <SelectTrigger>
                    <SelectValue placeholder={accountsLoading ? t('financial.loadingAccounts') : t('financial.chooseDestinationAccount')} />
                  </SelectTrigger>
                  <SelectContent>
                    {accountsLoading ? (
                      <SelectItem value="loading" disabled>{t('financial.loadingAccounts')}</SelectItem>
                    ) : accountsError ? (
                      <SelectItem value="error" disabled>{t('financial.errorLoadingAccounts')}</SelectItem>
                    ) : accounts && accounts.length > 0 ? (
                      accounts.map((account: FinancialAccount) => (
                        <SelectItem key={account.uuid} value={account.uuid}>
                          {getAccountDisplay(account)}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="empty" disabled>{t('financial.noAccountsAvailable')}</SelectItem>
                    )}
                  </SelectContent>
                </Select>
                {accountsError && (
                  <p className="text-xs text-red-500">{t('financial.errorLoadingAccountsMsg', { message: accountsError.message })}</p>
                )}
              </div>

              {toAccount && (
                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Building2 className="h-4 w-4 text-blue-600" />
                    <span className="font-medium text-blue-800 dark:text-blue-200">{toAccount.account_name}</span>
                  </div>
                  <p className="text-sm text-blue-700 dark:text-blue-300">
                    {t('financial.currentBalance', { value: formatCurrency(toAccount.balance, toAccount.currency) })}
                  </p>
                  <p className="text-xs text-blue-600 dark:text-blue-400">
                    {te(toAccount.account_type)}
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="to_amount">{t('common.amount')}</Label>
                <Input
                  id="to_amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={formData.to_amount || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, to_amount: parseFloat(e.target.value) || undefined }))}
                  placeholder={t('financial.enterAmount')}
                  readOnly={isDerivedToAmount}
                  className={isDerivedToAmount ? 'bg-gray-50 dark:bg-gray-800' : undefined}
                />
                {isDerivedToAmount && (
                  <p className="text-xs text-muted-foreground mt-1" data-testid="to-amount-derived-note">
                    {t('financial.autoConverted')}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="to_currency">{t('common.currency')}{toAccount?.currency ? ` ${t('financial.autoFilled')}` : ''}</Label>
                <Select
                  value={formData.to_currency || ""}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, to_currency: value }))}
                  disabled={!!toAccount?.currency}
                >
                  <SelectTrigger className={toAccount?.currency ? "bg-blue-50 dark:bg-blue-900/20" : ""}>
                    <SelectValue placeholder={toAccount?.currency ? toAccount.currency : t('financial.selectCurrency')} />
                  </SelectTrigger>
                  <SelectContent>
                    {toAccount?.currency ? (
                      <SelectItem value={toAccount.currency}>
                        {toAccount.currency} {t('financial.accountCurrency')}
                      </SelectItem>
                    ) : (
                      currencies.map((currency: string) => (
                        <SelectItem key={currency} value={currency}>
                          {currency}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Notes */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t('financial.transactionNotes')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label htmlFor="notes">{t('financial.notesOptional')}</Label>
              <Textarea
                id="notes"
                value={formData.notes || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                placeholder={t('financial.transactionNotesPlaceholder')}
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        {/* Summary */}
        {(formData.from_account_uuid || formData.to_account_uuid) && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t('financial.transactionSummary')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
                <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                  <p className="text-sm text-green-600 dark:text-green-400">{t('financial.from')}</p>
                  <p className="font-medium text-green-800 dark:text-green-200">
                    {fromAccount?.account_name || t('financial.selectAccountFallback')}
                  </p>
                  <p className="text-sm text-green-700 dark:text-green-300">
                    {formData.from_amount && formData.from_currency ?
                      formatCurrency(formData.from_amount, formData.from_currency) :
                      t('financial.enterAmount')
                    }
                  </p>
                </div>

                <div className="flex items-center justify-center">
                  <ArrowRightLeft className="h-8 w-8 text-[#5469D4]" />
                </div>

                <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <p className="text-sm text-blue-600 dark:text-blue-400">{t('financial.to')}</p>
                  <p className="font-medium text-blue-800 dark:text-blue-200">
                    {toAccount?.account_name || t('financial.selectAccountFallback')}
                  </p>
                  <p className="text-sm text-blue-700 dark:text-blue-300">
                    {formData.to_amount && formData.to_currency ?
                      formatCurrency(formData.to_amount, formData.to_currency) :
                      t('financial.enterAmount')
                    }
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}