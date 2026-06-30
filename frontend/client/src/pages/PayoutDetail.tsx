import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { ArrowLeft, Edit, Trash2, Copy, Check, CreditCard } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { format } from "date-fns";

interface Payout {
  uuid: string;
  created_by_uuid?: string;
  purchase_order_uuid?: string;
  expense_uuid?: string;
  amount: number;
  currency: string;
  notes?: string;
  employee_uuid?: string;
  credit_note_item_uuid?: string;
  financial_account_uuid: string;
  created_at: string;
  is_deleted: boolean;
}

export default function PayoutDetail() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [editedNotes, setEditedNotes] = useState("");
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const { data: payout, isLoading, error } = useQuery({
    queryKey: ["/payout/", params?.id],
    queryFn: () => apiRequest(`/payout/${params?.id}`),
  });

  const updateMutation = useMutation({
    mutationFn: (data: { notes?: string }) =>
      apiRequest(`/payout/${params?.id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/payout/"] });
      setIsEditing(false);
      toast({
        title: "Success",
        description: "Payout updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update payout",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest(`/payout/${params?.id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/payout/"] });
      toast({
        title: "Success",
        description: "Payout deleted successfully",
      });
      setLocation("/payouts");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete payout",
        variant: "destructive",
      });
    },
  });

  const copyToClipboard = (text: string, fieldName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);
    toast({
      title: "Copied",
      description: `${fieldName} copied to clipboard`,
    });
  };

  const handleEdit = () => {
    setEditedNotes(payout?.notes || "");
    setIsEditing(true);
  };

  const handleSave = () => {
    updateMutation.mutate({ notes: editedNotes || undefined });
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditedNotes("");
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
    };
    
    const symbol = currencySymbols[currency] || `${currency} `;
    return `${symbol}${amount.toFixed(2)}`;
  };

  const getPayoutType = () => {
    if (!payout) return { type: "Unknown", uuid: "", label: "Unknown" };
    if (payout.purchase_order_uuid) return { type: "Purchase Order", uuid: payout.purchase_order_uuid, label: "Purchase Order UUID" };
    if (payout.expense_uuid) return { type: "Expense", uuid: payout.expense_uuid, label: "Expense UUID" };
    if (payout.employee_uuid) return { type: "Employee", uuid: payout.employee_uuid, label: "Employee UUID" };
    if (payout.credit_note_item_uuid) return { type: "Credit Note", uuid: payout.credit_note_item_uuid, label: "Credit Note Item UUID" };
    return { type: "Unknown", uuid: "", label: "Unknown" };
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="p-8">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-gray-200 rounded w-1/4"></div>
            <div className="h-96 bg-gray-200 rounded"></div>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (error || !payout) {
    return (
      <AppLayout>
        <div className="p-8">
          <div className="text-center py-8">
            <p className="text-red-600">Error loading payout: {error?.message || "Payout not found"}</p>
            <Button onClick={() => setLocation("/payouts")} className="mt-4">
              Back to Payouts
            </Button>
          </div>
        </div>
      </AppLayout>
    );
  }

  const payoutType = getPayoutType();

  return (
    <AppLayout>
      <div className="p-8 space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              onClick={() => setLocation("/payouts")}
              variant="ghost"
              size="sm"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Payouts
            </Button>
            <div>
              <h1 className="text-3xl font-medium text-gray-900 dark:text-gray-100">
                Payout Details
              </h1>
              <p className="text-gray-600 dark:text-gray-400">
                {formatCurrency(payout.amount, payout.currency)} • {payoutType.type}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {isEditing ? (
              <>
                <Button onClick={handleCancel} variant="outline">
                  Cancel
                </Button>
                <Button onClick={handleSave} disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? "Saving..." : "Save"}
                </Button>
              </>
            ) : (
              <>
                <Button onClick={handleEdit} variant="outline">
                  <Edit className="h-4 w-4 mr-2" />
                  Edit
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" className="text-red-600 hover:text-red-700">
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete Payout</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to delete this payout? This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => deleteMutation.mutate()}
                        disabled={deleteMutation.isPending}
                        className="bg-red-600 hover:bg-red-700"
                      >
                        {deleteMutation.isPending ? "Deleting..." : "Delete"}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            )}
          </div>
        </div>

        {/* Payout Information */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Payout Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* UUID */}
              <div className="group cursor-pointer" onClick={() => copyToClipboard(payout.uuid, "Payout UUID")}>
                <Label className="text-sm font-medium text-gray-500 dark:text-gray-400">Payout UUID</Label>
                <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 rounded p-2 mt-1">
                  <p className="text-sm font-mono text-gray-900 dark:text-gray-100">
                    {payout.uuid}
                  </p>
                  <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity">
                    {copiedField === "Payout UUID" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              {/* Amount */}
              <div className="group cursor-pointer" onClick={() => copyToClipboard(payout.amount.toString(), "Amount")}>
                <Label className="text-sm font-medium text-gray-500 dark:text-gray-400">Amount</Label>
                <div className="flex items-center justify-between">
                  <p className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
                    {formatCurrency(payout.amount, payout.currency)}
                  </p>
                  <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity">
                    {copiedField === "Amount" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              {/* Currency */}
              <div className="group cursor-pointer" onClick={() => copyToClipboard(payout.currency, "Currency")}>
                <Label className="text-sm font-medium text-gray-500 dark:text-gray-400">Currency</Label>
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className="mt-1">
                    {payout.currency}
                  </Badge>
                  <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity">
                    {copiedField === "Currency" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              {/* Payout Type */}
              <div>
                <Label className="text-sm font-medium text-gray-500 dark:text-gray-400">Type</Label>
                <Badge variant="outline" className="mt-1">
                  {payoutType.type}
                </Badge>
              </div>

              {/* Reference UUID */}
              {payoutType.uuid && (
                <div className="group cursor-pointer" onClick={() => copyToClipboard(payoutType.uuid, payoutType.label)}>
                  <Label className="text-sm font-medium text-gray-500 dark:text-gray-400">{payoutType.label}</Label>
                  <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 rounded p-2 mt-1">
                    <p className="text-sm font-mono text-gray-900 dark:text-gray-100">
                      {payoutType.uuid}
                    </p>
                    <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity">
                      {copiedField === payoutType.label ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              )}

              {/* Financial Account UUID */}
              <div className="group cursor-pointer" onClick={() => copyToClipboard(payout.financial_account_uuid, "Financial Account UUID")}>
                <Label className="text-sm font-medium text-gray-500 dark:text-gray-400">Financial Account UUID</Label>
                <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 rounded p-2 mt-1">
                  <p className="text-sm font-mono text-gray-900 dark:text-gray-100">
                    {payout.financial_account_uuid}
                  </p>
                  <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity">
                    {copiedField === "Financial Account UUID" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              {/* Created At */}
              <div className="group cursor-pointer" onClick={() => copyToClipboard(payout.created_at, "Created Date")}>
                <Label className="text-sm font-medium text-gray-500 dark:text-gray-400">Created Date</Label>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-900 dark:text-gray-100 mt-1">
                    {format(new Date(payout.created_at), 'PPP p')}
                  </p>
                  <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity">
                    {copiedField === "Created Date" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label className="text-sm font-medium text-gray-500 dark:text-gray-400">Notes</Label>
              {isEditing ? (
                <Textarea
                  value={editedNotes}
                  onChange={(e) => setEditedNotes(e.target.value)}
                  placeholder="Enter notes for this payout..."
                  rows={3}
                />
              ) : (
                <div className="group cursor-pointer" onClick={() => copyToClipboard(payout.notes || "", "Notes")}>
                  <div className="flex items-start justify-between bg-gray-50 dark:bg-gray-800 rounded p-3 min-h-[80px]">
                    <p className="text-sm text-gray-900 dark:text-gray-100">
                      {payout.notes || "No notes provided"}
                    </p>
                    <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity">
                      {copiedField === "Notes" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}