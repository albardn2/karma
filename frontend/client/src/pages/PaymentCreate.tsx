import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, CreditCard, Save } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface PaymentCreateData {
  invoice_uuid?: string;
  financial_account_uuid?: string;
  amount: number;
  currency: string;
  payment_method: string;
  notes?: string;
  debit_note_item_uuid?: string;
}

export default function PaymentCreate() {
  const [, setLocation] = useLocation();
  const [formData, setFormData] = useState<PaymentCreateData>({
    amount: 0,
    currency: '',
    payment_method: '',
  });

  // Get the referrer from URL params or localStorage, default to payments list
  const urlParams = new URLSearchParams(window.location.search);
  const referrer = urlParams.get('referrer') || localStorage.getItem('payment_create_referrer') || '/payments';
  const prefilledInvoiceUuid = urlParams.get('invoice_uuid');
  const prefilledAmount = urlParams.get('amount');
  const prefilledCurrency = urlParams.get('currency');
  
  // Store referrer in localStorage for form persistence
  if (urlParams.get('referrer')) {
    localStorage.setItem('payment_create_referrer', urlParams.get('referrer')!);
  }

  // Pre-populate form fields if provided
  useEffect(() => {
    const updates: Partial<PaymentCreateData> = {};
    
    if (prefilledInvoiceUuid && !formData.invoice_uuid) {
      updates.invoice_uuid = prefilledInvoiceUuid;
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
  }, [prefilledInvoiceUuid, prefilledAmount, prefilledCurrency, formData.invoice_uuid, formData.amount, formData.currency]);

  // Fetch currencies
  const { data: currencies = [], isLoading: currenciesLoading, error: currenciesError } = useQuery({
    queryKey: ["/payment/currencies"],
    queryFn: () => apiRequest("/payment/currencies"),
  });

  console.log('Currencies data:', currencies);
  console.log('Currencies loading:', currenciesLoading);
  console.log('Currencies error:', currenciesError);

  // Fetch payment methods
  const { data: paymentMethods = [], isLoading: methodsLoading, error: methodsError } = useQuery({
    queryKey: ["/payment/payment-methods"],
    queryFn: () => apiRequest("/payment/payment-methods"),
  });

  console.log('Payment methods data:', paymentMethods);
  console.log('Payment methods loading:', methodsLoading);
  console.log('Payment methods error:', methodsError);

  const createMutation = useMutation({
    mutationFn: (data: PaymentCreateData) =>
      apiRequest("/payment/", {
        method: "POST",
        body: data,
      }),
    onSuccess: () => {
      // Invalidate relevant caches to refresh data
      queryClient.invalidateQueries({ queryKey: ["/payment"] });
      
      // If coming from customer order, invalidate customer order caches
      if (referrer.includes('/customer-orders/')) {
        // Extract the customer order ID from the referrer URL
        const orderIdMatch = referrer.match(/\/customer-orders\/([^/?]+)/);
        if (orderIdMatch) {
          const orderId = orderIdMatch[1];
          // Invalidate the specific customer order detail query using the exact query key pattern
          queryClient.invalidateQueries({ queryKey: ["/customer-order/with-items-and-invoice", orderId] });
        }
        // Also invalidate general customer order queries
        queryClient.invalidateQueries({ queryKey: ['/customer-order/'] });
        queryClient.invalidateQueries({ queryKey: ['/orders'] });
      }
      
      toast({
        title: "Success",
        description: "Payment created successfully",
      });
      // Clear the referrer and redirect back
      localStorage.removeItem('payment_create_referrer');
      setLocation(referrer);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create payment",
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

    if (!formData.payment_method) {
      toast({
        title: "Validation Error",
        description: "Payment method is required",
        variant: "destructive",
      });
      return;
    }

    // Either invoice_uuid or debit_note_item_uuid must be provided
    if (!formData.invoice_uuid && !formData.debit_note_item_uuid) {
      toast({
        title: "Validation Error",
        description: "Either Invoice UUID or Debit Note Item UUID must be provided",
        variant: "destructive",
      });
      return;
    }

    // Both cannot be provided
    if (formData.invoice_uuid && formData.debit_note_item_uuid) {
      toast({
        title: "Validation Error",
        description: "Only one of Invoice UUID or Debit Note Item UUID can be provided",
        variant: "destructive",
      });
      return;
    }

    // Create the payload, filtering out empty strings and converting them to undefined
    const payload = Object.fromEntries(
      Object.entries(formData).filter(([_, value]) => value !== "" && value !== undefined)
    ) as PaymentCreateData;

    createMutation.mutate(payload);
  };

  const handleCancel = () => {
    localStorage.removeItem('payment_create_referrer');
    setLocation(referrer);
  };

  // Set default currency if available
  useEffect(() => {
    if (currencies.length > 0 && !formData.currency) {
      const defaultCurrency = currencies.find((c: string) => c === 'USD') || currencies[0];
      setFormData(prev => ({ ...prev, currency: defaultCurrency }));
    }
  }, [currencies, formData.currency]);

  // Set default payment method if available
  useEffect(() => {
    if (paymentMethods.length > 0 && !formData.payment_method) {
      setFormData(prev => ({ ...prev, payment_method: paymentMethods[0] }));
    }
  }, [paymentMethods, formData.payment_method]);

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
                Create Payment
              </h1>
              <p className="text-gray-600 dark:text-gray-400">
                Add a new payment record
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={handleCancel} variant="outline">
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending} className="bg-[#5469D4] hover:bg-[#4356C7] text-white">
              <Save className="h-4 w-4 me-2" />
              {createMutation.isPending ? "Creating..." : "Create Payment"}
            </Button>
          </div>
        </div>

        {/* Form */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Payment Information
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
                  placeholder="Enter payment amount"
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

              {/* Payment Method */}
              <div className="space-y-2">
                <Label htmlFor="payment_method">Payment Method * {methodsLoading && '(Loading...)'}</Label>
                <Select value={formData.payment_method} onValueChange={(value) => setFormData(prev => ({ ...prev, payment_method: value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder={methodsLoading ? "Loading payment methods..." : "Select payment method"} />
                  </SelectTrigger>
                  <SelectContent>
                    {paymentMethods && paymentMethods.length > 0 ? (
                      paymentMethods.map((method: string) => (
                        <SelectItem key={method} value={method}>
                          {method}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="placeholder" disabled>
                        {methodsLoading ? "Loading..." : methodsError ? "Error loading payment methods" : "No payment methods available"}
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
                {methodsError && (
                  <p className="text-xs text-red-500">Error loading payment methods: {methodsError.message}</p>
                )}
              </div>

              {/* Financial Account UUID */}
              <div className="space-y-2">
                <Label htmlFor="financial_account_uuid">Financial Account UUID</Label>
                <Input
                  id="financial_account_uuid"
                  value={formData.financial_account_uuid || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, financial_account_uuid: e.target.value }))}
                  placeholder="Enter financial account UUID"
                />
              </div>

              {/* Invoice UUID */}
              <div className="space-y-2">
                <Label htmlFor="invoice_uuid">Invoice UUID {prefilledInvoiceUuid && '(Pre-filled)'}</Label>
                <Input
                  id="invoice_uuid"
                  value={formData.invoice_uuid || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, invoice_uuid: e.target.value }))}
                  placeholder="Enter invoice UUID"
                  className={prefilledInvoiceUuid ? "bg-blue-50 dark:bg-blue-900/20" : ""}
                />
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Either Invoice UUID or Debit Note Item UUID is required
                  {prefilledInvoiceUuid && ' • Invoice UUID has been pre-filled from the invoice'}
                  {(prefilledAmount || prefilledCurrency) && ' • Amount and currency pre-filled from invoice'}
                </p>
              </div>

              {/* Debit Note Item UUID */}
              <div className="space-y-2">
                <Label htmlFor="debit_note_item_uuid">Debit Note Item UUID</Label>
                <Input
                  id="debit_note_item_uuid"
                  value={formData.debit_note_item_uuid || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, debit_note_item_uuid: e.target.value }))}
                  placeholder="Enter debit note item UUID"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Alternative to Invoice UUID - only one can be provided
                </p>
              </div>

              {/* Notes */}
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  value={formData.notes || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Add any additional notes about this payment..."
                  rows={3}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}