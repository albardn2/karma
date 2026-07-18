import { useState, useEffect } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Edit3, Save, X, Trash2, Copy, Check, CreditCard } from "lucide-react";
import { format } from "date-fns";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface Payment {
  uuid: string;
  created_by_uuid?: string;
  invoice_uuid?: string;
  financial_account_uuid?: string;
  amount: number;
  currency: string;
  payment_method: string;
  notes?: string;
  debit_note_item_uuid?: string;
  created_at: string;
  is_deleted: boolean;
}

export default function PaymentDetail() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const [isEditing, setIsEditing] = useState(false);
  const [editedPaymentMethod, setEditedPaymentMethod] = useState("");
  const [editedNotes, setEditedNotes] = useState("");
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Currency formatting function
  const formatCurrency = (amount: number | undefined, currency: string = 'USD') => {
    if (!amount && amount !== 0) return '0.00';
    
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

  const { data: payment, isLoading, error } = useQuery<Payment>({
    queryKey: ["/payment", params?.id],
    queryFn: () => apiRequest(`/payment/${params?.id}`),
    enabled: !!params?.id,
  });

  // Fetch payment methods
  const { data: paymentMethods = [] } = useQuery({
    queryKey: ["/payment/payment-methods"],
    queryFn: () => apiRequest("/payment/payment-methods"),
  });

  const updateMutation = useMutation({
    mutationFn: (data: { payment_method?: string; notes?: string }) =>
      apiRequest(`/payment/${params?.id}`, {
        method: "PUT",
        body: data,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/payment", params?.id] });
      setIsEditing(false);
      toast({
        title: "Success",
        description: "Payment updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update payment",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/payment/${params?.id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/payment"] });
      toast({
        title: "Success",
        description: "Payment deleted successfully",
      });
      setLocation("/payments");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete payment",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (payment) {
      setEditedPaymentMethod(payment.payment_method || "");
      setEditedNotes(payment.notes || "");
    }
  }, [payment]);

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleSave = () => {
    const updateData: { payment_method?: string; notes?: string } = {};
    
    if (editedPaymentMethod !== payment?.payment_method) {
      updateData.payment_method = editedPaymentMethod;
    }
    
    if (editedNotes !== payment?.notes) {
      updateData.notes = editedNotes || null;
    }

    if (Object.keys(updateData).length > 0) {
      updateMutation.mutate(updateData);
    } else {
      setIsEditing(false);
    }
  };

  const handleCancel = () => {
    setEditedPaymentMethod(payment?.payment_method || "");
    setEditedNotes(payment?.notes || "");
    setIsEditing(false);
  };

  const handleDelete = () => {
    if (window.confirm("Are you sure you want to delete this payment?")) {
      deleteMutation.mutate();
    }
  };

  const copyToClipboard = async (text: string, fieldName: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(fieldName);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
    
    toast({
      title: "Copied",
      description: `${fieldName} copied to clipboard`,
    });
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="p-8">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-gray-200 dark:bg-gray-600 rounded w-48"></div>
            <div className="h-64 bg-gray-200 dark:bg-gray-600 rounded"></div>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (error || !payment) {
    return (
      <AppLayout>
        <div className="p-8">
          <Card>
            <CardContent className="p-16 text-center">
              <CreditCard className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">Payment not found</h3>
              <p className="text-gray-500 dark:text-gray-400 mb-4">
                The payment you're looking for doesn't exist or has been deleted.
              </p>
              <Button onClick={() => setLocation("/payments")} variant="outline">
                <ArrowLeft className="h-4 w-4 me-2" />
                Back to payments
              </Button>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-8 space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              onClick={() => setLocation("/payments")}
              variant="ghost"
              size="sm"
            >
              <ArrowLeft className="h-4 w-4 me-2" />
              Back to payments
            </Button>
            <div>
              <h1 className="text-3xl font-medium text-gray-900 dark:text-gray-100">
                Payment Details
              </h1>
              <p className="text-gray-600 dark:text-gray-400">
                #{payment.uuid.substring(0, 8)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {!isEditing ? (
              <>
                <Button onClick={handleEdit} variant="outline">
                  <Edit3 className="h-4 w-4 me-2" />
                  Edit
                </Button>
                <Button onClick={handleDelete} variant="destructive">
                  <Trash2 className="h-4 w-4 me-2" />
                  Delete
                </Button>
              </>
            ) : (
              <>
                <Button onClick={handleCancel} variant="outline">
                  <X className="h-4 w-4 me-2" />
                  Cancel
                </Button>
                <Button onClick={handleSave} disabled={updateMutation.isPending}>
                  <Save className="h-4 w-4 me-2" />
                  {updateMutation.isPending ? "Saving..." : "Save"}
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Payment Information */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Payment Information
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* Payment UUID */}
              <div className="group cursor-pointer" onClick={() => copyToClipboard(payment.uuid, "Payment UUID")}>
                <Label className="text-sm font-medium text-gray-500 dark:text-gray-400">Payment UUID</Label>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-900 dark:text-gray-100 font-mono">
                    {payment.uuid}
                  </p>
                  <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity ms-2">
                    {copiedField === "Payment UUID" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              {/* Amount */}
              <div className="group cursor-pointer" onClick={() => copyToClipboard(payment.amount.toString(), "Amount")}>
                <Label className="text-sm font-medium text-gray-500 dark:text-gray-400">Amount</Label>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {formatCurrency(payment.amount, payment.currency)}
                  </p>
                  <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity ms-2">
                    {copiedField === "Amount" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              {/* Payment Method */}
              <div>
                <Label className="text-sm font-medium text-gray-500 dark:text-gray-400">Payment Method</Label>
                {isEditing ? (
                  <Select value={editedPaymentMethod} onValueChange={setEditedPaymentMethod}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select payment method" />
                    </SelectTrigger>
                    <SelectContent>
                      {paymentMethods.map((method: string) => (
                        <SelectItem key={method} value={method}>
                          {method}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="group cursor-pointer" onClick={() => copyToClipboard(payment.payment_method, "Payment Method")}>
                    <div className="flex items-center justify-between">
                      <span className="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300">
                        {payment.payment_method}
                      </span>
                      <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity ms-2">
                        {copiedField === "Payment Method" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* Invoice UUID */}
              {payment.invoice_uuid && (
                <div className="group cursor-pointer" onClick={() => copyToClipboard(payment.invoice_uuid!, "Invoice UUID")}>
                  <Label className="text-sm font-medium text-gray-500 dark:text-gray-400">Invoice UUID</Label>
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-900 dark:text-gray-100 font-mono">
                      {payment.invoice_uuid}
                    </p>
                    <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity ms-2">
                      {copiedField === "Invoice UUID" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              )}

              {/* Financial Account UUID */}
              {payment.financial_account_uuid && (
                <div className="group cursor-pointer" onClick={() => copyToClipboard(payment.financial_account_uuid!, "Financial Account UUID")}>
                  <Label className="text-sm font-medium text-gray-500 dark:text-gray-400">Financial Account UUID</Label>
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-900 dark:text-gray-100 font-mono">
                      {payment.financial_account_uuid}
                    </p>
                    <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity ms-2">
                      {copiedField === "Financial Account UUID" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              )}

              {/* Debit Note Item UUID */}
              {payment.debit_note_item_uuid && (
                <div className="group cursor-pointer" onClick={() => copyToClipboard(payment.debit_note_item_uuid!, "Debit Note Item UUID")}>
                  <Label className="text-sm font-medium text-gray-500 dark:text-gray-400">Debit Note Item UUID</Label>
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-900 dark:text-gray-100 font-mono">
                      {payment.debit_note_item_uuid}
                    </p>
                    <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity ms-2">
                      {copiedField === "Debit Note Item UUID" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              )}

              {/* Created At */}
              <div className="group cursor-pointer" onClick={() => copyToClipboard(payment.created_at, "Created At")}>
                <Label className="text-sm font-medium text-gray-500 dark:text-gray-400">Created At</Label>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-900 dark:text-gray-100">
                    {format(new Date(payment.created_at), 'MMM d, yyyy h:mm a')}
                  </p>
                  <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity ms-2">
                    {copiedField === "Created At" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              {/* Created By UUID */}
              {payment.created_by_uuid && (
                <div className="group cursor-pointer" onClick={() => copyToClipboard(payment.created_by_uuid!, "Created By UUID")}>
                  <Label className="text-sm font-medium text-gray-500 dark:text-gray-400">Created By UUID</Label>
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-900 dark:text-gray-100 font-mono">
                      {payment.created_by_uuid}
                    </p>
                    <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity ms-2">
                      {copiedField === "Created By UUID" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              )}

              {/* Notes */}
              <div className="md:col-span-2 lg:col-span-3">
                <Label className="text-sm font-medium text-gray-500 dark:text-gray-400">Notes</Label>
                {isEditing ? (
                  <Textarea
                    value={editedNotes}
                    onChange={(e) => setEditedNotes(e.target.value)}
                    placeholder="Add notes about this payment..."
                    className="mt-1"
                    rows={3}
                  />
                ) : (
                  <div className="group cursor-pointer" onClick={() => copyToClipboard(payment.notes || 'No notes', "Notes")}>
                    <div className="flex items-start justify-between mt-1">
                      <p className="text-sm text-gray-900 dark:text-gray-100">
                        {payment.notes || 'No notes'}
                      </p>
                      <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity ms-2">
                        {copiedField === "Notes" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}