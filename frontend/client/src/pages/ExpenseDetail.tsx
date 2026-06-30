import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { ArrowLeft, Edit, Trash2, Copy, Check, Receipt } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { format } from "date-fns";

interface Expense {
  uuid: string;
  created_by_uuid?: string;
  amount: number;
  currency: string;
  category: string;
  vendor_uuid?: string;
  description?: string;
  status: string;
  is_paid: boolean;
  amount_due: number;
  amount_paid: number;
  created_at: string;
  is_deleted: boolean;
  paid_at?: string;
}

export default function ExpenseDetail() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [editedVendorUuid, setEditedVendorUuid] = useState("");
  const [editedCategory, setEditedCategory] = useState("");
  const [editedDescription, setEditedDescription] = useState("");
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const { data: expense, isLoading, error } = useQuery({
    queryKey: ["/expense/", params?.id],
    queryFn: () => apiRequest(`/expense/${params?.id}`),
  });

  // Fetch expense categories for editing
  const { data: categories = [] } = useQuery({
    queryKey: ["/expense/categories"],
    queryFn: () => apiRequest("/expense/categories"),
  });

  const updateMutation = useMutation({
    mutationFn: (data: { vendor_uuid?: string; category?: string; description?: string }) =>
      apiRequest(`/expense/${params?.id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/expense/"] });
      setIsEditing(false);
      toast({
        title: "Success",
        description: "Expense updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update expense",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest(`/expense/${params?.id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/expense/"] });
      toast({
        title: "Success",
        description: "Expense deleted successfully",
      });
      setLocation("/expenses");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete expense",
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
    setEditedVendorUuid(expense?.vendor_uuid || "");
    setEditedCategory(expense?.category || "");
    setEditedDescription(expense?.description || "");
    setIsEditing(true);
  };

  const handleSave = () => {
    const updates: any = {};
    
    if (editedVendorUuid !== (expense?.vendor_uuid || "")) {
      updates.vendor_uuid = editedVendorUuid || null;
    }
    
    if (editedCategory !== (expense?.category || "")) {
      updates.category = editedCategory;
    }
    
    if (editedDescription !== (expense?.description || "")) {
      updates.description = editedDescription || null;
    }

    updateMutation.mutate(updates);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditedVendorUuid("");
    setEditedCategory("");
    setEditedDescription("");
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

  const getCategoryBadgeColor = (category: string) => {
    const colors: { [key: string]: string } = {
      'electricity': 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-300',
      'water': 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300',
      'rent': 'bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/20 dark:text-purple-300',
      'maintenance': 'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/20 dark:text-orange-300',
      'equipment': 'bg-indigo-100 text-indigo-800 border-indigo-200 dark:bg-indigo-900/20 dark:text-indigo-300',
      'supplies': 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/20 dark:text-green-300',
      'travel': 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/20 dark:text-red-300',
      'meals': 'bg-pink-100 text-pink-800 border-pink-200 dark:bg-pink-900/20 dark:text-pink-300',
      'other': 'bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-900/20 dark:text-gray-300',
    };
    return colors[category] || colors['other'];
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

  if (error || !expense) {
    return (
      <AppLayout>
        <div className="p-8">
          <div className="text-center py-8">
            <p className="text-red-600">Error loading expense: {error?.message || "Expense not found"}</p>
            <Button onClick={() => setLocation("/expenses")} className="mt-4">
              Back to Expenses
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
              onClick={() => setLocation("/expenses")}
              variant="ghost"
              size="sm"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Expenses
            </Button>
            <div>
              <h1 className="text-3xl font-medium text-gray-900 dark:text-gray-100">
                Expense Details
              </h1>
              <p className="text-gray-600 dark:text-gray-400">
                {formatCurrency(expense.amount, expense.currency)} • {expense.category}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Create Payout Button */}
            {!expense.is_paid && !isEditing && (
              <Button
                onClick={() => setLocation(`/payouts/create?referrer=/expenses/${params?.id}&expense_uuid=${expense.uuid}&amount=${expense.amount_due}&currency=${expense.currency}`)}
                className="bg-[#5469D4] hover:bg-[#4356C7] text-white"
                size="sm"
              >
                Create Payout
              </Button>
            )}

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
                      <AlertDialogTitle>Delete Expense</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to delete this expense? This action cannot be undone.
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

        {/* Expense Information */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              Expense Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* UUID */}
              <div className="group cursor-pointer" onClick={() => copyToClipboard(expense.uuid, "Expense UUID")}>
                <Label className="text-sm font-medium text-gray-500 dark:text-gray-400">Expense UUID</Label>
                <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 rounded p-2 mt-1">
                  <p className="text-sm font-mono text-gray-900 dark:text-gray-100">
                    {expense.uuid}
                  </p>
                  <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity">
                    {copiedField === "Expense UUID" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              {/* Amount */}
              <div className="group cursor-pointer" onClick={() => copyToClipboard(expense.amount.toString(), "Amount")}>
                <Label className="text-sm font-medium text-gray-500 dark:text-gray-400">Amount</Label>
                <div className="flex items-center justify-between">
                  <p className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
                    {formatCurrency(expense.amount, expense.currency)}
                  </p>
                  <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity">
                    {copiedField === "Amount" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              {/* Category */}
              <div>
                <Label className="text-sm font-medium text-gray-500 dark:text-gray-400">Category</Label>
                {isEditing ? (
                  <Select value={editedCategory} onValueChange={setEditedCategory}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((category: string) => (
                        <SelectItem key={category} value={category}>
                          {category.charAt(0).toUpperCase() + category.slice(1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Badge variant="outline" className={`mt-1 ${getCategoryBadgeColor(expense.category)}`}>
                    {expense.category}
                  </Badge>
                )}
              </div>

              {/* Status & Payment Status */}
              <div className="space-y-4">
                <div>
                  <Label className="text-sm font-medium text-gray-500 dark:text-gray-400">Status</Label>
                  <Badge variant="outline" className="mt-1 block w-fit">
                    {expense.status}
                  </Badge>
                </div>
                <div>
                  <Label className="text-sm font-medium text-gray-500 dark:text-gray-400">Payment Status</Label>
                  <Badge 
                    className={`mt-1 block w-fit ${
                      expense.is_paid
                        ? 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/20 dark:text-green-300'
                        : 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/20 dark:text-red-300'
                    }`}
                  >
                    {expense.is_paid ? 'Paid' : 'Unpaid'}
                  </Badge>
                </div>
              </div>

              {/* Vendor UUID */}
              <div>
                <Label className="text-sm font-medium text-gray-500 dark:text-gray-400">Vendor UUID</Label>
                {isEditing ? (
                  <Input
                    value={editedVendorUuid}
                    onChange={(e) => setEditedVendorUuid(e.target.value)}
                    placeholder="Enter vendor UUID"
                    className="mt-1"
                  />
                ) : (
                  <div className="group cursor-pointer" onClick={() => copyToClipboard(expense.vendor_uuid || "", "Vendor UUID")}>
                    <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 rounded p-2 mt-1">
                      <p className="text-sm font-mono text-gray-900 dark:text-gray-100">
                        {expense.vendor_uuid || "No vendor assigned"}
                      </p>
                      <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity">
                        {copiedField === "Vendor UUID" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* Financial Details */}
              <div className="space-y-4">
                <div className="group cursor-pointer" onClick={() => copyToClipboard(expense.amount_due.toString(), "Amount Due")}>
                  <Label className="text-sm font-medium text-gray-500 dark:text-gray-400">Amount Due</Label>
                  <div className="flex items-center justify-between">
                    <p className="text-lg font-semibold text-red-600 dark:text-red-400">
                      {formatCurrency(expense.amount_due, expense.currency)}
                    </p>
                    <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity">
                      {copiedField === "Amount Due" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
                
                <div className="group cursor-pointer" onClick={() => copyToClipboard(expense.amount_paid.toString(), "Amount Paid")}>
                  <Label className="text-sm font-medium text-gray-500 dark:text-gray-400">Amount Paid</Label>
                  <div className="flex items-center justify-between">
                    <p className="text-lg font-semibold text-green-600 dark:text-green-400">
                      {formatCurrency(expense.amount_paid, expense.currency)}
                    </p>
                    <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity">
                      {copiedField === "Amount Paid" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              </div>

              {/* Dates */}
              <div className="space-y-4">
                <div className="group cursor-pointer" onClick={() => copyToClipboard(expense.created_at, "Created Date")}>
                  <Label className="text-sm font-medium text-gray-500 dark:text-gray-400">Created Date</Label>
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-900 dark:text-gray-100 mt-1">
                      {format(new Date(expense.created_at), 'PPP p')}
                    </p>
                    <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity">
                      {copiedField === "Created Date" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
                
                {expense.paid_at && (
                  <div className="group cursor-pointer" onClick={() => copyToClipboard(expense.paid_at!, "Paid Date")}>
                    <Label className="text-sm font-medium text-gray-500 dark:text-gray-400">Paid Date</Label>
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-gray-900 dark:text-gray-100 mt-1">
                        {format(new Date(expense.paid_at), 'PPP p')}
                      </p>
                      <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity">
                        {copiedField === "Paid Date" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label className="text-sm font-medium text-gray-500 dark:text-gray-400">Description</Label>
              {isEditing ? (
                <Textarea
                  value={editedDescription}
                  onChange={(e) => setEditedDescription(e.target.value)}
                  placeholder="Enter expense description..."
                  rows={3}
                />
              ) : (
                <div className="group cursor-pointer" onClick={() => copyToClipboard(expense.description || "", "Description")}>
                  <div className="flex items-start justify-between bg-gray-50 dark:bg-gray-800 rounded p-3 min-h-[80px]">
                    <p className="text-sm text-gray-900 dark:text-gray-100">
                      {expense.description || "No description provided"}
                    </p>
                    <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity">
                      {copiedField === "Description" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
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