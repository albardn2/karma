import { useState, useEffect } from "react";
import { useLocation, useRoute } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useForm, SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { 
  ArrowLeft, 
  Edit3, 
  Trash2, 
  Copy, 
  Save, 
  X, 
  FileText, 
  Calendar,
  DollarSign,
  CheckCircle,
  AlertCircle,
  User,
  Package,
  ShoppingCart,
  Receipt
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { AppLayout } from "@/components/layout/AppLayout";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface CreditNoteItem {
  uuid: string;
  amount: number;
  currency: string;
  notes?: string;
  invoice_item_uuid?: string;
  customer_uuid?: string;
  vendor_uuid?: string;
  purchase_order_item_uuid?: string;
  inventory_change?: number;
  status: string;
  created_at: string;
  is_deleted: boolean;
  amount_paid: number;
  amount_due: number;
  paid_at?: string;
  is_paid: boolean;
  created_by_uuid?: string;
}

const editSchema = z.object({
  notes: z.string().optional(),
});

type EditFormData = z.infer<typeof editSchema>;

const formatCurrency = (amount: number, currency: string) => {
  if (!currency || currency === 'SYP') return `${amount.toLocaleString()} SYP`;
  
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency
    }).format(amount);
  } catch (error) {
    // Fallback for invalid currency codes
    return `${amount.toLocaleString()} ${currency}`;
  }
};

const getStatusColor = (status: string) => {
  switch (status?.toLowerCase()) {
    case 'draft': return 'bg-gray-100 text-gray-800';
    case 'sent': return 'bg-blue-100 text-blue-800';
    case 'paid': return 'bg-green-100 text-green-800';
    case 'overdue': return 'bg-red-100 text-red-800';
    case 'cancelled': return 'bg-gray-100 text-gray-800';
    default: return 'bg-gray-100 text-gray-800';
  }
};

const getReferenceIcon = (item: CreditNoteItem) => {
  if (item.invoice_item_uuid) return <Receipt className="h-4 w-4 text-purple-600" />;
  if (item.customer_uuid) return <User className="h-4 w-4 text-blue-600" />;
  if (item.vendor_uuid) return <Package className="h-4 w-4 text-green-600" />;
  if (item.purchase_order_item_uuid) return <ShoppingCart className="h-4 w-4 text-orange-600" />;
  return <FileText className="h-4 w-4 text-gray-600" />;
};

const getReferenceType = (item: CreditNoteItem) => {
  if (item.invoice_item_uuid) return "Invoice Item";
  if (item.customer_uuid) return "Customer";
  if (item.vendor_uuid) return "Vendor";
  if (item.purchase_order_item_uuid) return "Purchase Order Item";
  return "Unknown";
};

const getReferenceUuid = (item: CreditNoteItem) => {
  return item.invoice_item_uuid || item.customer_uuid || item.vendor_uuid || item.purchase_order_item_uuid || "";
};

export default function CreditNoteItemDetail() {
  const [, params] = useRoute("/credit-note-items/:uuid");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);

  const creditNoteItemUuid = params?.uuid;

  const { data: creditNoteItem, isLoading, error } = useQuery<CreditNoteItem>({
    queryKey: [`/credit-note-item/${creditNoteItemUuid}`],
    enabled: !!creditNoteItemUuid
  });

  const form = useForm<EditFormData>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      notes: ""
    }
  });

  // Update form when data loads
  useEffect(() => {
    if (creditNoteItem) {
      form.reset({
        notes: creditNoteItem.notes || ""
      });
    }
  }, [creditNoteItem, form]);

  const updateMutation = useMutation({
    mutationFn: async (data: EditFormData) => {
      const response = await apiRequest(`/credit-note-item/${creditNoteItemUuid}`, {
        method: "PUT",
        body: {
          notes: data.notes || null
        }
      });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/credit-note-item/${creditNoteItemUuid}`] });
      queryClient.invalidateQueries({ queryKey: ["/credit-note-item/"] });
      setIsEditing(false);
      toast({
        title: "Success",
        description: "Credit note item updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to update credit note item",
      });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest(`/credit-note-item/${creditNoteItemUuid}`, {
        method: "DELETE"
      });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/credit-note-item/"] });
      toast({
        title: "Success",
        description: "Credit note item deleted successfully",
      });
      setLocation("/credit-note-items");
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to delete credit note item",
      });
    }
  });

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied to clipboard",
      description: `${label} has been copied to your clipboard.`,
    });
  };

  const onSubmit: SubmitHandler<EditFormData> = (data) => {
    updateMutation.mutate(data);
  };

  const handleCancel = () => {
    form.reset({
      notes: creditNoteItem?.notes || ""
    });
    setIsEditing(false);
  };

  if (error) {
    return (
      <AppLayout>
        <div className="p-8">
          <div className="text-center">
            <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Error Loading Credit Note Item</h3>
            <p className="text-red-600">{(error as Error).message}</p>
            <Button 
              onClick={() => setLocation("/credit-note-items")} 
              className="mt-4"
              variant="outline"
            >
              <ArrowLeft className="h-4 w-4 me-2" />
              Back to Credit Note Items
            </Button>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (isLoading || !creditNoteItem) {
    return (
      <AppLayout>
        <div className="p-6 space-y-6">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" disabled>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="animate-pulse">
              <div className="h-8 bg-gray-200 rounded w-64 mb-2"></div>
              <div className="h-4 bg-gray-200 rounded w-48"></div>
            </div>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <Card className="animate-pulse">
                <CardHeader className="space-y-2">
                  <div className="h-6 bg-gray-200 rounded w-48"></div>
                  <div className="h-4 bg-gray-200 rounded w-64"></div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="h-4 bg-gray-200 rounded w-full"></div>
                  <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                  <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setLocation("/credit-note-items")}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <FileText className="h-6 w-6 text-purple-600" />
                  <h1 className="text-2xl font-bold text-gray-900">Credit Note Item</h1>
                </div>
                <Badge className={getStatusColor(creditNoteItem.status)}>
                  {creditNoteItem.status}
                </Badge>
                {creditNoteItem.is_paid && (
                  <Badge className="bg-green-100 text-green-800">
                    <CheckCircle className="h-3 w-3 me-1" />
                    Paid
                  </Badge>
                )}
              </div>
              <p className="text-gray-600 mt-1 flex items-center gap-2">
                <span className="font-mono text-sm">{creditNoteItem.uuid}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={() => copyToClipboard(creditNoteItem.uuid, "Credit Note Item ID")}
                >
                  <Copy className="h-3 w-3" />
                </Button>
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {!isEditing ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => setIsEditing(true)}
                  className="flex items-center gap-2"
                >
                  <Edit3 className="h-4 w-4" />
                  Edit
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" className="text-red-600 hover:text-red-700 hover:bg-red-50">
                      <Trash2 className="h-4 w-4 me-2" />
                      Delete
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete Credit Note Item</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to delete this credit note item? This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => deleteMutation.mutate()}
                        className="bg-red-600 hover:bg-red-700"
                        disabled={deleteMutation.isPending}
                      >
                        {deleteMutation.isPending ? "Deleting..." : "Delete"}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  onClick={handleCancel}
                  disabled={updateMutation.isPending}
                >
                  <X className="h-4 w-4 me-2" />
                  Cancel
                </Button>
                <Button
                  onClick={form.handleSubmit(onSubmit)}
                  disabled={updateMutation.isPending}
                  className="bg-purple-600 hover:bg-purple-700"
                >
                  <Save className="h-4 w-4 me-2" />
                  {updateMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Financial Information */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-green-600" />
                  Financial Information
                </CardTitle>
                <CardDescription>
                  Credit note amount and payment details
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-gray-500">Credit Amount</Label>
                    <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg border">
                      <span className="text-lg font-semibold text-green-700">
                        {formatCurrency(creditNoteItem?.amount || 0, creditNoteItem?.currency || 'USD')}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={() => copyToClipboard((creditNoteItem?.amount || 0).toString(), "Amount")}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-gray-500">Currency</Label>
                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border">
                      <span className="font-medium">{creditNoteItem?.currency || 'USD'}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={() => copyToClipboard(creditNoteItem?.currency || 'USD', "Currency")}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-gray-500">Amount Paid</Label>
                    <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border">
                      <span className="font-medium text-blue-700">
                        {formatCurrency(creditNoteItem?.amount_paid || 0, creditNoteItem?.currency || 'USD')}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={() => copyToClipboard((creditNoteItem?.amount_paid || 0).toString(), "Amount Paid")}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-gray-500">Amount Due</Label>
                    <div className="flex items-center justify-between p-3 bg-orange-50 rounded-lg border">
                      <span className="font-medium text-orange-700">
                        {formatCurrency(creditNoteItem?.amount_due || 0, creditNoteItem?.currency || 'USD')}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={() => copyToClipboard((creditNoteItem?.amount_due || 0).toString(), "Amount Due")}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </div>

                {creditNoteItem?.paid_at && (
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-gray-500">Paid Date</Label>
                    <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg border">
                      <span className="font-medium text-green-700">
                        {new Date(creditNoteItem.paid_at).toLocaleDateString()} at {new Date(creditNoteItem.paid_at).toLocaleTimeString()}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={() => copyToClipboard(creditNoteItem?.paid_at || '', "Paid Date")}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Editable Fields */}
            <form onSubmit={form.handleSubmit(onSubmit)}>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Edit3 className="h-5 w-5 text-purple-600" />
                    Editable Information
                  </CardTitle>
                  <CardDescription>
                    Fields that can be modified
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Notes */}
                  <div className="space-y-2">
                    <Label htmlFor="notes">Notes</Label>
                    {isEditing ? (
                      <Textarea
                        {...form.register("notes")}
                        placeholder="Enter any additional notes..."
                        rows={4}
                        className="resize-none"
                      />
                    ) : (
                      <div className="flex items-start justify-between p-3 bg-gray-50 rounded-lg border min-h-[100px]">
                        <span className="text-gray-700 whitespace-pre-wrap">
                          {creditNoteItem?.notes || "No notes provided"}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 flex-shrink-0 ms-2"
                          onClick={() => copyToClipboard(creditNoteItem?.notes || "", "Notes")}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                    {form.formState.errors.notes && (
                      <p className="text-sm text-red-600">{form.formState.errors.notes.message}</p>
                    )}
                  </div>


                </CardContent>
              </Card>
            </form>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Reference Information */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {creditNoteItem ? getReferenceIcon(creditNoteItem) : <FileText className="h-4 w-4 text-gray-600" />}
                  Reference Information
                </CardTitle>
                <CardDescription>
                  Related entity details
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-gray-500">Reference Type</Label>
                  <div className="flex items-center justify-between p-3 bg-purple-50 rounded-lg border">
                    <span className="font-medium text-purple-700">
                      {creditNoteItem ? getReferenceType(creditNoteItem) : "Unknown"}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() => copyToClipboard(creditNoteItem ? getReferenceType(creditNoteItem) : "Unknown", "Reference Type")}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium text-gray-500">Reference UUID</Label>
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border">
                    <span className="font-mono text-sm break-all">
                      {creditNoteItem ? getReferenceUuid(creditNoteItem) : ""}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 flex-shrink-0 ms-2"
                      onClick={() => copyToClipboard(creditNoteItem ? getReferenceUuid(creditNoteItem) : "", "Reference UUID")}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* System Information */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-blue-600" />
                  System Information
                </CardTitle>
                <CardDescription>
                  Creation and audit details
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-gray-500">Created Date</Label>
                  <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border">
                    <span className="font-medium text-blue-700">
                      {creditNoteItem?.created_at ? new Date(creditNoteItem.created_at).toLocaleDateString() : ''} at {creditNoteItem?.created_at ? new Date(creditNoteItem.created_at).toLocaleTimeString() : ''}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() => copyToClipboard(creditNoteItem?.created_at || '', "Created Date")}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </div>

                {creditNoteItem?.created_by_uuid && (
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-gray-500">Created By</Label>
                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border">
                      <span className="font-mono text-sm break-all">
                        {creditNoteItem?.created_by_uuid}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 flex-shrink-0 ms-2"
                        onClick={() => copyToClipboard(creditNoteItem?.created_by_uuid || '', "Created By UUID")}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Label className="text-sm font-medium text-gray-500">Status</Label>
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border">
                    <Badge className={getStatusColor(creditNoteItem?.status || 'draft')}>
                      {creditNoteItem?.status || 'draft'}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() => copyToClipboard(creditNoteItem?.status || 'draft', "Status")}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium text-gray-500">Inventory Change</Label>
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border">
                    <span className="font-medium">
                      {creditNoteItem?.inventory_change || 0}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() => copyToClipboard((creditNoteItem?.inventory_change || 0).toString(), "Inventory Change")}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}