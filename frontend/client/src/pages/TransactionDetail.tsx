import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { ArrowLeft, Edit, Trash2, Copy, Check, ArrowRightLeft } from "lucide-react";
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

interface Transaction {
  uuid: string;
  created_by_uuid?: string;
  from_amount?: number;
  from_currency?: string;
  from_account_uuid?: string;
  to_account_uuid?: string;
  to_currency?: string;
  to_amount?: number;
  usd_to_syp_exchange_rate?: number;
  notes?: string;
  created_at: string;
  is_deleted: boolean;
}

export default function TransactionDetail() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [editedNotes, setEditedNotes] = useState("");
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const { data: transaction, isLoading, error } = useQuery({
    queryKey: ["/transaction/", params?.id],
    queryFn: () => apiRequest(`/transaction/${params?.id}`),
  });

  const updateMutation = useMutation({
    mutationFn: (data: { notes?: string }) =>
      apiRequest(`/transaction/${params?.id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/transaction/"] });
      setIsEditing(false);
      toast({
        title: "Success",
        description: "Transaction updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update transaction",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest(`/transaction/${params?.id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/transaction/"] });
      toast({
        title: "Success",
        description: "Transaction deleted successfully",
      });
      setLocation("/transactions");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete transaction",
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
    setEditedNotes(transaction?.notes || "");
    setIsEditing(true);
  };

  const handleSave = () => {
    const updates: any = {};
    
    if (editedNotes !== (transaction?.notes || "")) {
      updates.notes = editedNotes || null;
    }

    updateMutation.mutate(updates);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditedNotes("");
  };

  const formatCurrency = (amount?: number, currency?: string) => {
    if (!amount || !currency) return "—";
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

  if (error || !transaction) {
    return (
      <AppLayout>
        <div className="p-8">
          <div className="text-center py-8">
            <p className="text-red-600">Error loading transaction: {error?.message || "Transaction not found"}</p>
            <Button onClick={() => setLocation("/transactions")} className="mt-4">
              Back to Transactions
            </Button>
          </div>
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
              onClick={() => setLocation("/transactions")}
              variant="ghost"
              size="sm"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Transactions
            </Button>
            <div>
              <h1 className="text-3xl font-medium text-gray-900 dark:text-gray-100">
                Transaction Details
              </h1>
              <p className="text-gray-600 dark:text-gray-400">
                {formatCurrency(transaction.from_amount, transaction.from_currency)} → {formatCurrency(transaction.to_amount, transaction.to_currency)}
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
                      <AlertDialogTitle>Delete Transaction</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to delete this transaction? This action cannot be undone.
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

        {/* Transaction Flow Visual */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* From Section */}
          <Card className="border-l-4 border-l-green-500">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                From Account
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="group cursor-pointer" onClick={() => copyToClipboard(transaction.from_account_uuid || "", "From Account UUID")}>
                <Label className="text-sm font-medium text-gray-500 dark:text-gray-400">Account UUID</Label>
                <div className="flex items-center justify-between bg-green-50 dark:bg-green-900/20 rounded p-2 mt-1">
                  <p className="text-sm font-mono text-gray-900 dark:text-gray-100">
                    {transaction.from_account_uuid || "Not specified"}
                  </p>
                  <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity">
                    {copiedField === "From Account UUID" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <div className="group cursor-pointer" onClick={() => copyToClipboard(transaction.from_amount?.toString() || "", "From Amount")}>
                <Label className="text-sm font-medium text-gray-500 dark:text-gray-400">Amount</Label>
                <div className="flex items-center justify-between">
                  <p className="text-2xl font-semibold text-green-600">
                    {formatCurrency(transaction.from_amount, transaction.from_currency)}
                  </p>
                  <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity">
                    {copiedField === "From Amount" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <div>
                <Label className="text-sm font-medium text-gray-500 dark:text-gray-400">Currency</Label>
                <Badge variant="outline" className="mt-1 bg-green-100 text-green-800 border-green-200">
                  {transaction.from_currency || "N/A"}
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* Exchange Rate Section */}
          <Card className="flex items-center justify-center bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20">
            <CardContent className="flex flex-col items-center justify-center space-y-4 py-8">
              <ArrowRightLeft className="h-12 w-12 text-[#5469D4]" />
              
              {transaction.usd_to_syp_exchange_rate ? (
                <div className="text-center">
                  <Label className="text-sm font-medium text-gray-500 dark:text-gray-400">Exchange Rate</Label>
                  <div className="group cursor-pointer" onClick={() => copyToClipboard(transaction.usd_to_syp_exchange_rate?.toString() || "", "Exchange Rate")}>
                    <div className="flex items-center justify-center gap-2 mt-2">
                      <Badge variant="outline" className="text-lg px-4 py-2 bg-gradient-to-r from-blue-100 to-purple-100 text-blue-800 border-blue-200">
                        {transaction.usd_to_syp_exchange_rate.toFixed(2)}
                      </Badge>
                      <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity">
                        {copiedField === "Exchange Rate" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">USD to SYP</p>
                </div>
              ) : (
                <div className="text-center">
                  <p className="text-sm text-gray-500 dark:text-gray-400">Direct Transfer</p>
                  <p className="text-xs text-gray-400">No exchange rate</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* To Section */}
          <Card className="border-l-4 border-l-blue-500">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                To Account
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="group cursor-pointer" onClick={() => copyToClipboard(transaction.to_account_uuid || "", "To Account UUID")}>
                <Label className="text-sm font-medium text-gray-500 dark:text-gray-400">Account UUID</Label>
                <div className="flex items-center justify-between bg-blue-50 dark:bg-blue-900/20 rounded p-2 mt-1">
                  <p className="text-sm font-mono text-gray-900 dark:text-gray-100">
                    {transaction.to_account_uuid || "Not specified"}
                  </p>
                  <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity">
                    {copiedField === "To Account UUID" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <div className="group cursor-pointer" onClick={() => copyToClipboard(transaction.to_amount?.toString() || "", "To Amount")}>
                <Label className="text-sm font-medium text-gray-500 dark:text-gray-400">Amount</Label>
                <div className="flex items-center justify-between">
                  <p className="text-2xl font-semibold text-blue-600">
                    {formatCurrency(transaction.to_amount, transaction.to_currency)}
                  </p>
                  <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity">
                    {copiedField === "To Amount" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <div>
                <Label className="text-sm font-medium text-gray-500 dark:text-gray-400">Currency</Label>
                <Badge variant="outline" className="mt-1 bg-blue-100 text-blue-800 border-blue-200">
                  {transaction.to_currency || "N/A"}
                </Badge>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Transaction Information */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <ArrowRightLeft className="h-5 w-5" />
              Transaction Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* UUID */}
              <div className="group cursor-pointer" onClick={() => copyToClipboard(transaction.uuid, "Transaction UUID")}>
                <Label className="text-sm font-medium text-gray-500 dark:text-gray-400">Transaction UUID</Label>
                <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 rounded p-2 mt-1">
                  <p className="text-sm font-mono text-gray-900 dark:text-gray-100">
                    {transaction.uuid}
                  </p>
                  <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity">
                    {copiedField === "Transaction UUID" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              {/* Created Date */}
              <div className="group cursor-pointer" onClick={() => copyToClipboard(transaction.created_at, "Created Date")}>
                <Label className="text-sm font-medium text-gray-500 dark:text-gray-400">Created Date</Label>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-900 dark:text-gray-100 mt-1">
                    {format(new Date(transaction.created_at), 'PPP p')}
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
                  placeholder="Enter transaction notes..."
                  rows={3}
                />
              ) : (
                <div className="group cursor-pointer" onClick={() => copyToClipboard(transaction.notes || "", "Notes")}>
                  <div className="flex items-start justify-between bg-gray-50 dark:bg-gray-800 rounded p-3 min-h-[80px]">
                    <p className="text-sm text-gray-900 dark:text-gray-100">
                      {transaction.notes || "No notes provided"}
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