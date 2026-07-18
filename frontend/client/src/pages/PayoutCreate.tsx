import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ArrowLeft, Save, CreditCard } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface PayoutCreateData {
  purchase_order_uuid?: string;
  expense_uuid?: string;
  amount: number;
  currency: string;
  notes?: string;
  employee_uuid?: string;
  credit_note_item_uuid?: string;
}

export default function PayoutCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [formData, setFormData] = useState<PayoutCreateData>({
    amount: 0,
    currency: '',
  });

  // Get the referrer from URL params or localStorage, default to payouts list
  const urlParams = new URLSearchParams(window.location.search);
  const referrer = urlParams.get('referrer') || localStorage.getItem('payout_create_referrer') || '/payouts';
  const prefilledPurchaseOrderUuid = urlParams.get('purchase_order_uuid');
  const prefilledExpenseUuid = urlParams.get('expense_uuid');
  const prefilledEmployeeUuid = urlParams.get('employee_uuid');
  const prefilledAmount = urlParams.get('amount');
  const prefilledCurrency = urlParams.get('currency');
  
  // Store referrer in localStorage for form persistence
  if (urlParams.get('referrer')) {
    localStorage.setItem('payout_create_referrer', urlParams.get('referrer')!);
  }

  // Pre-populate form fields if provided
  useEffect(() => {
    const updates: Partial<PayoutCreateData> = {};
    
    if (prefilledPurchaseOrderUuid && !formData.purchase_order_uuid) {
      updates.purchase_order_uuid = prefilledPurchaseOrderUuid;
    }
    
    if (prefilledExpenseUuid && !formData.expense_uuid) {
      updates.expense_uuid = prefilledExpenseUuid;
    }
    
    if (prefilledEmployeeUuid && !formData.employee_uuid) {
      updates.employee_uuid = prefilledEmployeeUuid;
    }
    
    if (prefilledAmount && formData.amount === 0) {
      updates.amount = parseFloat(prefilledAmount);
    }
    
    if (prefilledCurrency && !formData.currency) {
      updates.currency = prefilledCurrency;
    }
    
    if (Object.keys(updates).length > 0) {
      setFormData(prev => ({ ...prev, ...updates }));
    }
  }, [prefilledPurchaseOrderUuid, prefilledExpenseUuid, prefilledEmployeeUuid, prefilledAmount, prefilledCurrency, formData.purchase_order_uuid, formData.expense_uuid, formData.employee_uuid, formData.amount, formData.currency]);

  // Fetch currencies
  const { data: currencies = [], isLoading: currenciesLoading, error: currenciesError } = useQuery({
    queryKey: ["/payment/currencies"],
    queryFn: () => apiRequest("/payment/currencies"),
  });

  const createMutation = useMutation({
    mutationFn: (data: PayoutCreateData) =>
      apiRequest("/payout/", {
        method: "POST",
        body: data,
      }),
    onSuccess: () => {
      // Invalidate relevant caches to refresh data
      queryClient.invalidateQueries({ queryKey: ["/payout/"] });
      
      // If coming from purchase order, invalidate purchase order caches
      if (referrer.includes('/purchase-orders/')) {
        const orderIdMatch = referrer.match(/\/purchase-orders\/([^/?]+)/);
        if (orderIdMatch) {
          const orderId = orderIdMatch[1];
          queryClient.invalidateQueries({ queryKey: ["/purchase-order", orderId] });
        }
        queryClient.invalidateQueries({ queryKey: ["/purchase-order"] });
      }
      
      // If coming from expense, invalidate expense caches
      if (referrer.includes('/expenses/')) {
        const expenseIdMatch = referrer.match(/\/expenses\/([^/?]+)/);
        if (expenseIdMatch) {
          const expenseId = expenseIdMatch[1];
          queryClient.invalidateQueries({ queryKey: ["/expense/", expenseId] });
        }
        queryClient.invalidateQueries({ queryKey: ["/expense/"] });
      }
      
      // If coming from employee, invalidate employee caches
      if (referrer.includes('/employees/')) {
        const employeeIdMatch = referrer.match(/\/employees\/([^/?]+)/);
        if (employeeIdMatch) {
          const employeeId = employeeIdMatch[1];
          queryClient.invalidateQueries({ queryKey: ["/employee", employeeId] });
        }
        queryClient.invalidateQueries({ queryKey: ["/employee"] });
      }
      
      toast({
        title: "Success",
        description: "Payout created successfully",
      });
      // Clear the referrer and redirect back
      localStorage.removeItem('payout_create_referrer');
      setLocation(referrer);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create payout",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = () => {
    // Validation
    if (!formData.amount || formData.amount <= 0) {
      toast({
        title: "Validation Error",
        description: "Amount must be greater than 0",
        variant: "destructive",
      });
      return;
    }

    if (!formData.currency) {
      toast({
        title: "Validation Error",
        description: "Currency is required",
        variant: "destructive",
      });
      return;
    }

    // At least one reference UUID is required
    if (!formData.purchase_order_uuid && !formData.expense_uuid && !formData.employee_uuid && !formData.credit_note_item_uuid) {
      toast({
        title: "Validation Error",
        description: "At least one reference UUID (Purchase Order, Expense, Employee, or Credit Note Item) is required",
        variant: "destructive",
      });
      return;
    }

    // Only one reference UUID can be provided
    const referenceCount = [
      formData.purchase_order_uuid,
      formData.expense_uuid,
      formData.employee_uuid,
      formData.credit_note_item_uuid
    ].filter(Boolean).length;

    if (referenceCount > 1) {
      toast({
        title: "Validation Error",
        description: "Only one reference UUID can be provided",
        variant: "destructive",
      });
      return;
    }

    // Create the payload, filtering out empty strings and converting them to undefined
    const payload = Object.fromEntries(
      Object.entries(formData).filter(([_, value]) => value !== "" && value !== undefined)
    ) as PayoutCreateData;

    createMutation.mutate(payload);
  };

  const handleCancel = () => {
    localStorage.removeItem('payout_create_referrer');
    setLocation(referrer);
  };

  // Set default currency if available
  useEffect(() => {
    if (currencies.length > 0 && !formData.currency) {
      const defaultCurrency = currencies.find((c: string) => c === 'USD') || currencies[0];
      setFormData(prev => ({ ...prev, currency: defaultCurrency }));
    }
  }, [currencies, formData.currency]);

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
              Back
            </Button>
            <div>
              <h1 className="text-3xl font-medium text-gray-900 dark:text-gray-100">
                Create Payout
              </h1>
              <p className="text-gray-600 dark:text-gray-400">
                Add a new payout record
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={handleCancel} variant="outline">
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending} className="bg-[#5469D4] hover:bg-[#4356C7] text-white">
              <Save className="h-4 w-4 me-2" />
              {createMutation.isPending ? "Creating..." : "Create Payout"}
            </Button>
          </div>
        </div>

        {/* Form */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Payout Information
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Amount */}
              <div className="space-y-2">
                <Label htmlFor="amount">Amount * {prefilledAmount && '(Pre-filled)'}</Label>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.amount || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, amount: parseFloat(e.target.value) || 0 }))}
                  placeholder="Enter payout amount"
                  className={prefilledAmount ? "bg-blue-50 dark:bg-blue-900/20" : ""}
                  required
                />
              </div>

              {/* Currency */}
              <div className="space-y-2">
                <Label htmlFor="currency">Currency * {prefilledCurrency && '(Pre-filled)'}</Label>
                <Select value={formData.currency} onValueChange={(value) => setFormData(prev => ({ ...prev, currency: value }))}>
                  <SelectTrigger className={prefilledCurrency ? "bg-blue-50 dark:bg-blue-900/20" : ""}>
                    <SelectValue placeholder={currenciesLoading ? "Loading currencies..." : "Select currency"} />
                  </SelectTrigger>
                  <SelectContent>
                    {currencies && currencies.length > 0 ? (
                      currencies.map((currency: string) => (
                        <SelectItem key={currency} value={currency}>
                          {currency}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="placeholder" disabled>
                        {currenciesLoading ? "Loading..." : currenciesError ? "Error loading currencies" : "No currencies available"}
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
                {currenciesError && (
                  <p className="text-xs text-red-500">Error loading currencies: {currenciesError.message}</p>
                )}
              </div>

              {/* Purchase Order UUID */}
              <div className="space-y-2">
                <Label htmlFor="purchase_order_uuid">Purchase Order UUID {prefilledPurchaseOrderUuid && '(Pre-filled)'}</Label>
                <Input
                  id="purchase_order_uuid"
                  value={formData.purchase_order_uuid || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, purchase_order_uuid: e.target.value }))}
                  placeholder="Enter purchase order UUID"
                  className={prefilledPurchaseOrderUuid ? "bg-blue-50 dark:bg-blue-900/20" : ""}
                />
              </div>

              {/* Expense UUID */}
              <div className="space-y-2">
                <Label htmlFor="expense_uuid">Expense UUID {prefilledExpenseUuid && '(Pre-filled)'}</Label>
                <Input
                  id="expense_uuid"
                  value={formData.expense_uuid || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, expense_uuid: e.target.value }))}
                  placeholder="Enter expense UUID"
                  className={prefilledExpenseUuid ? "bg-blue-50 dark:bg-blue-900/20" : ""}
                />
              </div>

              {/* Employee UUID */}
              <div className="space-y-2">
                <Label htmlFor="employee_uuid">Employee UUID {prefilledEmployeeUuid && '(Pre-filled)'}</Label>
                <Input
                  id="employee_uuid"
                  value={formData.employee_uuid || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, employee_uuid: e.target.value }))}
                  placeholder="Enter employee UUID"
                  className={prefilledEmployeeUuid ? "bg-blue-50 dark:bg-blue-900/20" : ""}
                />
                {prefilledEmployeeUuid && (
                  <p className="text-xs text-blue-600 dark:text-blue-400">
                    Employee UUID has been pre-filled from the employee page
                  </p>
                )}
              </div>

              {/* Credit Note Item UUID */}
              <div className="space-y-2">
                <Label htmlFor="credit_note_item_uuid">Credit Note Item UUID</Label>
                <Input
                  id="credit_note_item_uuid"
                  value={formData.credit_note_item_uuid || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, credit_note_item_uuid: e.target.value }))}
                  placeholder="Enter credit note item UUID"
                />
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-2 mt-6">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={formData.notes || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Enter notes for this payout..."
                rows={3}
              />
            </div>

            {/* Validation Info */}
            <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <p className="text-sm text-blue-800 dark:text-blue-200">
                <strong>Note:</strong> Exactly one reference UUID (Purchase Order, Expense, Employee, or Credit Note Item) is required.
                {(prefilledPurchaseOrderUuid || prefilledAmount || prefilledCurrency) && (
                  <br />
                )}
                {prefilledPurchaseOrderUuid && ' • Purchase Order UUID has been pre-filled from the purchase order'}
                {prefilledExpenseUuid && ' • Expense UUID has been pre-filled from the expense'}
                {(prefilledAmount || prefilledCurrency) && ' • Amount and currency pre-filled from source record'}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}