import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ArrowLeft, Save, ArrowRightLeft, RefreshCw, Building2, Wallet } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

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

export default function TransactionCreate() {
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
        title: "Success",
        description: "Transaction created successfully",
      });
      // Clear the referrer and redirect back
      localStorage.removeItem('transaction_create_referrer');
      setLocation(referrer);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create transaction",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = () => {
    // Basic validation
    if (!formData.from_account_uuid || !formData.to_account_uuid) {
      toast({
        title: "Validation Error",
        description: "From and To accounts are required",
        variant: "destructive",
      });
      return;
    }

    if (formData.from_account_uuid === formData.to_account_uuid) {
      toast({
        title: "Validation Error",
        description: "From and To accounts cannot be the same",
        variant: "destructive",
      });
      return;
    }

    // Create the payload, filtering out empty values
    const payload = Object.fromEntries(
      Object.entries(formData).filter(([_, value]) => value !== "" && value !== undefined && value !== null)
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

  // Calculate to_amount based on exchange rate and from_amount
  const calculateToAmount = () => {
    if (formData.from_amount && formData.usd_to_syp_exchange_rate && 
        formData.from_currency === 'USD' && formData.to_currency === 'SYP') {
      const toAmount = formData.from_amount * formData.usd_to_syp_exchange_rate;
      setFormData(prev => ({ ...prev, to_amount: toAmount }));
    }
  };

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
      return "Invalid account";
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
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <div>
              <h1 className="text-3xl font-medium text-gray-900 dark:text-gray-100">
                Create Transaction
              </h1>
              <p className="text-gray-600 dark:text-gray-400">
                Transfer funds between accounts
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={handleCancel} variant="outline">
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending} className="bg-[#5469D4] hover:bg-[#4356C7] text-white">
              <Save className="h-4 w-4 mr-2" />
              {createMutation.isPending ? "Creating..." : "Create Transaction"}
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
                From Account
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="from_account">Select Account *</Label>
                <Select value={formData.from_account_uuid || ""} onValueChange={handleFromAccountChange}>
                  <SelectTrigger>
                    <SelectValue placeholder={accountsLoading ? "Loading accounts..." : "Choose source account"} />
                  </SelectTrigger>
                  <SelectContent>
                    {accountsLoading ? (
                      <SelectItem value="loading" disabled>Loading accounts...</SelectItem>
                    ) : accountsError ? (
                      <SelectItem value="error" disabled>Error loading accounts</SelectItem>
                    ) : accounts && accounts.length > 0 ? (
                      accounts.map((account: FinancialAccount) => (
                        <SelectItem key={account.uuid} value={account.uuid}>
                          {getAccountDisplay(account)}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="empty" disabled>No accounts available</SelectItem>
                    )}
                  </SelectContent>
                </Select>
                {accountsError && (
                  <p className="text-xs text-red-500">Error loading accounts: {accountsError.message}</p>
                )}
              </div>

              {fromAccount && (
                <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Building2 className="h-4 w-4 text-green-600" />
                    <span className="font-medium text-green-800 dark:text-green-200">{fromAccount.account_name}</span>
                  </div>
                  <p className="text-sm text-green-700 dark:text-green-300">
                    Current Balance: {formatCurrency(fromAccount.balance, fromAccount.currency)}
                  </p>
                  <p className="text-xs text-green-600 dark:text-green-400">
                    {fromAccount.account_type}
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="from_amount">Amount</Label>
                <Input
                  id="from_amount"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.from_amount || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, from_amount: parseFloat(e.target.value) || undefined }))}
                  placeholder="Enter amount"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="from_currency">Currency {fromAccount?.currency && '(Auto-filled)'}</Label>
                <Select 
                  value={formData.from_currency || ""} 
                  onValueChange={(value) => setFormData(prev => ({ ...prev, from_currency: value }))}
                  disabled={!!fromAccount?.currency}
                >
                  <SelectTrigger className={fromAccount?.currency ? "bg-green-50 dark:bg-green-900/20" : ""}>
                    <SelectValue placeholder={fromAccount?.currency ? fromAccount.currency : "Select currency"} />
                  </SelectTrigger>
                  <SelectContent>
                    {fromAccount?.currency ? (
                      <SelectItem value={fromAccount.currency}>
                        {fromAccount.currency} (Account Currency)
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
            <div className="absolute top-4 left-4 right-4">
              <CardTitle className="text-lg flex items-center gap-2 justify-center">
                <ArrowRightLeft className="h-5 w-5 text-[#5469D4]" />
                Exchange
              </CardTitle>
            </div>
            <CardContent className="flex flex-col items-center justify-center space-y-4 pt-16">
              {formData.from_currency === 'USD' && formData.to_currency === 'SYP' && (
                <>
                  <div className="text-center">
                    <Label htmlFor="exchange_rate" className="text-sm font-medium">USD to SYP Rate</Label>
                    <div className="flex items-center gap-2 mt-2">
                      <Input
                        id="exchange_rate"
                        type="number"
                        step="0.01"
                        min="0"
                        value={formData.usd_to_syp_exchange_rate || ''}
                        onChange={(e) => setFormData(prev => ({ ...prev, usd_to_syp_exchange_rate: parseFloat(e.target.value) || undefined }))}
                        placeholder="Rate"
                        className="text-center"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={calculateToAmount}
                        disabled={!formData.from_amount || !formData.usd_to_syp_exchange_rate}
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  {formData.from_amount && formData.usd_to_syp_exchange_rate && (
                    <div className="text-center p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                      <p className="text-sm text-blue-800 dark:text-blue-200">
                        ${formData.from_amount.toFixed(2)} × {formData.usd_to_syp_exchange_rate} = SYP {(formData.from_amount * formData.usd_to_syp_exchange_rate).toFixed(2)}
                      </p>
                    </div>
                  )}
                </>
              )}
              
              {(!formData.from_currency || !formData.to_currency) && (
                <div className="text-center text-gray-500 dark:text-gray-400">
                  <ArrowRightLeft className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Select currencies to see exchange options</p>
                </div>
              )}
              
              {formData.from_currency && formData.to_currency && 
               !(formData.from_currency === 'USD' && formData.to_currency === 'SYP') && (
                <div className="text-center text-gray-500 dark:text-gray-400">
                  <ArrowRightLeft className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Direct transfer</p>
                  <p className="text-xs">No exchange rate needed</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* To Account */}
          <Card className="relative">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Wallet className="h-5 w-5 text-blue-600" />
                To Account
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="to_account">Select Account *</Label>
                <Select value={formData.to_account_uuid || ""} onValueChange={handleToAccountChange}>
                  <SelectTrigger>
                    <SelectValue placeholder={accountsLoading ? "Loading accounts..." : "Choose destination account"} />
                  </SelectTrigger>
                  <SelectContent>
                    {accountsLoading ? (
                      <SelectItem value="loading" disabled>Loading accounts...</SelectItem>
                    ) : accountsError ? (
                      <SelectItem value="error" disabled>Error loading accounts</SelectItem>
                    ) : accounts && accounts.length > 0 ? (
                      accounts.map((account: FinancialAccount) => (
                        <SelectItem key={account.uuid} value={account.uuid}>
                          {getAccountDisplay(account)}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="empty" disabled>No accounts available</SelectItem>
                    )}
                  </SelectContent>
                </Select>
                {accountsError && (
                  <p className="text-xs text-red-500">Error loading accounts: {accountsError.message}</p>
                )}
              </div>

              {toAccount && (
                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Building2 className="h-4 w-4 text-blue-600" />
                    <span className="font-medium text-blue-800 dark:text-blue-200">{toAccount.account_name}</span>
                  </div>
                  <p className="text-sm text-blue-700 dark:text-blue-300">
                    Current Balance: {formatCurrency(toAccount.balance, toAccount.currency)}
                  </p>
                  <p className="text-xs text-blue-600 dark:text-blue-400">
                    {toAccount.account_type}
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="to_amount">Amount</Label>
                <Input
                  id="to_amount"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.to_amount || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, to_amount: parseFloat(e.target.value) || undefined }))}
                  placeholder="Enter amount"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="to_currency">Currency {toAccount?.currency && '(Auto-filled)'}</Label>
                <Select 
                  value={formData.to_currency || ""} 
                  onValueChange={(value) => setFormData(prev => ({ ...prev, to_currency: value }))}
                  disabled={!!toAccount?.currency}
                >
                  <SelectTrigger className={toAccount?.currency ? "bg-blue-50 dark:bg-blue-900/20" : ""}>
                    <SelectValue placeholder={toAccount?.currency ? toAccount.currency : "Select currency"} />
                  </SelectTrigger>
                  <SelectContent>
                    {toAccount?.currency ? (
                      <SelectItem value={toAccount.currency}>
                        {toAccount.currency} (Account Currency)
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
            <CardTitle className="text-lg">Transaction Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label htmlFor="notes">Notes (Optional)</Label>
              <Textarea
                id="notes"
                value={formData.notes || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Add any notes about this transaction..."
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        {/* Summary */}
        {(formData.from_account_uuid || formData.to_account_uuid) && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Transaction Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
                <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                  <p className="text-sm text-green-600 dark:text-green-400">From</p>
                  <p className="font-medium text-green-800 dark:text-green-200">
                    {fromAccount?.account_name || "Select account"}
                  </p>
                  <p className="text-sm text-green-700 dark:text-green-300">
                    {formData.from_amount && formData.from_currency ? 
                      formatCurrency(formData.from_amount, formData.from_currency) : 
                      "Enter amount"
                    }
                  </p>
                </div>
                
                <div className="flex items-center justify-center">
                  <ArrowRightLeft className="h-8 w-8 text-[#5469D4]" />
                </div>
                
                <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <p className="text-sm text-blue-600 dark:text-blue-400">To</p>
                  <p className="font-medium text-blue-800 dark:text-blue-200">
                    {toAccount?.account_name || "Select account"}
                  </p>
                  <p className="text-sm text-blue-700 dark:text-blue-300">
                    {formData.to_amount && formData.to_currency ? 
                      formatCurrency(formData.to_amount, formData.to_currency) : 
                      "Enter amount"
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