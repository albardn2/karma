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
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { AppLayout } from "@/components/layout/AppLayout";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useLanguage } from "@/contexts/LanguageContext";

interface DebitNoteItem {
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

const getReferenceIcon = (item: DebitNoteItem) => {
  if (item.invoice_item_uuid) return <Receipt className="h-4 w-4 text-purple-600" />;
  if (item.customer_uuid) return <User className="h-4 w-4 text-blue-600" />;
  if (item.vendor_uuid) return <Package className="h-4 w-4 text-green-600" />;
  if (item.purchase_order_item_uuid) return <ShoppingCart className="h-4 w-4 text-orange-600" />;
  return <FileText className="h-4 w-4 text-gray-600" />;
};

const getReferenceType = (item: DebitNoteItem) => {
  if (item.invoice_item_uuid) return "notes.refInvoiceItem";
  if (item.customer_uuid) return "notes.refCustomer";
  if (item.vendor_uuid) return "notes.refVendor";
  if (item.purchase_order_item_uuid) return "notes.refPurchaseOrderItem";
  return "common.unknown";
};

const getReferenceUuid = (item: DebitNoteItem) => {
  return item.invoice_item_uuid || item.customer_uuid || item.vendor_uuid || item.purchase_order_item_uuid || "";
};

export default function DebitNoteItemDetail() {
  const [, params] = useRoute("/debit-note-items/:uuid");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { t, te } = useLanguage();
  const [isEditing, setIsEditing] = useState(false);

  const debitNoteItemUuid = params?.uuid;

  const { data: debitNoteItem, isLoading, error } = useQuery<DebitNoteItem>({
    queryKey: [`/debit-note-item/${debitNoteItemUuid}`],
    enabled: !!debitNoteItemUuid
  });

  const form = useForm<EditFormData>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      notes: ""
    }
  });

  // Update form when data loads
  useEffect(() => {
    if (debitNoteItem) {
      form.reset({
        notes: debitNoteItem.notes || ""
      });
    }
  }, [debitNoteItem, form]);

  const updateMutation = useMutation({
    mutationFn: async (data: EditFormData) => {
      const response = await apiRequest(`/debit-note-item/${debitNoteItemUuid}`, {
        method: "PUT",
        body: {
          notes: data.notes || null
        }
      });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/debit-note-item/${debitNoteItemUuid}`] });
      queryClient.invalidateQueries({ queryKey: ["/debit-note-item/"] });
      setIsEditing(false);
      toast({
        title: t('common.success'),
        description: t('notes.debitUpdated'),
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: t('common.error'),
        description: error.message || t('notes.debitUpdateFailed'),
      });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest(`/debit-note-item/${debitNoteItemUuid}`, {
        method: "DELETE"
      });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/debit-note-item/"] });
      toast({
        title: t('common.success'),
        description: t('notes.debitDeleted'),
      });
      setLocation("/debit-note-items");
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: t('common.error'),
        description: error.message || t('notes.debitDeleteFailed'),
      });
    }
  });

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: t('notes.copiedToClipboard'),
      description: t('notes.copiedDescription', { label }),
    });
  };

  const onSubmit: SubmitHandler<EditFormData> = (data) => {
    updateMutation.mutate(data);
  };

  const handleCancel = () => {
    form.reset({
      notes: debitNoteItem?.notes || ""
    });
    setIsEditing(false);
  };

  if (error) {
    return (
      <AppLayout>
        <div className="p-8">
          <div className="text-center">
            <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">{t('notes.debitErrorLoadingItemTitle')}</h3>
            <p className="text-red-600">{(error as Error).message}</p>
            <Button
              onClick={() => setLocation("/debit-note-items")}
              className="mt-4"
              variant="outline"
            >
              <ArrowLeft className="h-4 w-4 me-2" />
              {t('notes.backToDebitItems')}
            </Button>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (isLoading || !debitNoteItem) {
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
              onClick={() => setLocation("/debit-note-items")}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <FileText className="h-6 w-6 text-purple-600" />
                  <h1 className="text-2xl font-bold text-gray-900">{t('notes.debitItemSingular')}</h1>
                </div>
                <Badge className={getStatusColor(debitNoteItem?.status || 'draft')}>
                  {te(debitNoteItem?.status || 'draft')}
                </Badge>
                {debitNoteItem?.is_paid && (
                  <Badge className="bg-green-100 text-green-800">
                    <CheckCircle className="h-3 w-3 me-1" />
                    {te('paid')}
                  </Badge>
                )}
              </div>
              <p className="text-gray-600 mt-1 flex items-center gap-2">
                <span className="font-mono text-sm">{debitNoteItem?.uuid}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={() => copyToClipboard(debitNoteItem?.uuid || '', t('notes.debitItemId'))}
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
                  {t('common.edit')}
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" className="text-red-600 hover:text-red-700 hover:bg-red-50">
                      <Trash2 className="h-4 w-4 me-2" />
                      {t('common.delete')}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t('notes.deleteDebitTitle')}</AlertDialogTitle>
                      <AlertDialogDescription>
                        {t('notes.deleteDebitConfirm')}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => deleteMutation.mutate()}
                        className="bg-red-600 hover:bg-red-700"
                        disabled={deleteMutation.isPending}
                      >
                        {deleteMutation.isPending ? t('common.deleting') : t('common.delete')}
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
                  {t('common.cancel')}
                </Button>
                <Button
                  onClick={form.handleSubmit(onSubmit)}
                  disabled={updateMutation.isPending}
                  className="bg-purple-600 hover:bg-purple-700"
                >
                  <Save className="h-4 w-4 me-2" />
                  {updateMutation.isPending ? t('common.saving') : t('notes.saveChanges')}
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
                  {t('notes.financialInfo')}
                </CardTitle>
                <CardDescription>
                  {t('notes.debitFinancialDesc')}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-gray-500">{t('notes.debitAmount')}</Label>
                    <div className="flex items-center justify-between p-3 bg-red-50 rounded-lg border">
                      <span className="text-lg font-semibold text-red-700">
                        {formatCurrency(debitNoteItem?.amount || 0, debitNoteItem?.currency || 'USD')}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={() => copyToClipboard((debitNoteItem?.amount || 0).toString(), t('common.amount'))}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-gray-500">{t('common.currency')}</Label>
                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border">
                      <span className="font-medium">{te(debitNoteItem?.currency || 'USD')}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={() => copyToClipboard(debitNoteItem?.currency || 'USD', t('common.currency'))}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-gray-500">{t('notes.amountPaid')}</Label>
                    <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border">
                      <span className="font-medium text-blue-700">
                        {formatCurrency(debitNoteItem?.amount_paid || 0, debitNoteItem?.currency || 'USD')}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={() => copyToClipboard((debitNoteItem?.amount_paid || 0).toString(), t('notes.amountPaid'))}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-gray-500">{t('notes.amountDue')}</Label>
                    <div className="flex items-center justify-between p-3 bg-orange-50 rounded-lg border">
                      <span className="font-medium text-orange-700">
                        {formatCurrency(debitNoteItem?.amount_due || 0, debitNoteItem?.currency || 'USD')}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={() => copyToClipboard((debitNoteItem?.amount_due || 0).toString(), t('notes.amountDue'))}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </div>

                {debitNoteItem?.paid_at && (
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-gray-500">{t('notes.paidDate')}</Label>
                    <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg border">
                      <span className="font-medium text-green-700">
                        {t('notes.dateAtTime', { date: new Date(debitNoteItem.paid_at).toLocaleDateString(), time: new Date(debitNoteItem.paid_at).toLocaleTimeString() })}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={() => copyToClipboard(debitNoteItem?.paid_at || '', t('notes.paidDate'))}
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
                    {t('notes.editableInfo')}
                  </CardTitle>
                  <CardDescription>
                    {t('notes.editableInfoDesc')}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Notes */}
                  <div className="space-y-2">
                    <Label htmlFor="notes">{t('common.notes')}</Label>
                    {isEditing ? (
                      <Textarea
                        {...form.register("notes")}
                        placeholder={t('notes.notesPlaceholder')}
                        rows={4}
                        className="resize-none"
                      />
                    ) : (
                      <div className="flex items-start justify-between p-3 bg-gray-50 rounded-lg border min-h-[100px]">
                        <span className="text-gray-700 whitespace-pre-wrap">
                          {debitNoteItem?.notes || t('notes.noNotesProvided')}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 flex-shrink-0 ms-2"
                          onClick={() => copyToClipboard(debitNoteItem?.notes || "", t('common.notes'))}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                    {form.formState.errors.notes && (
                      <p className="text-sm text-red-600">{t(form.formState.errors.notes.message || '')}</p>
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
                  {debitNoteItem ? getReferenceIcon(debitNoteItem) : <FileText className="h-4 w-4 text-gray-600" />}
                  {t('notes.referenceInformation')}
                </CardTitle>
                <CardDescription>
                  {t('notes.relatedEntityDetails')}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-gray-500">{t('notes.referenceType')}</Label>
                  <div className="flex items-center justify-between p-3 bg-purple-50 rounded-lg border">
                    <span className="font-medium text-purple-700">
                      {debitNoteItem ? t(getReferenceType(debitNoteItem)) : t('common.unknown')}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() => copyToClipboard(debitNoteItem ? t(getReferenceType(debitNoteItem)) : t('common.unknown'), t('notes.referenceType'))}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium text-gray-500">{t('notes.referenceUuid')}</Label>
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border">
                    <span className="font-mono text-sm break-all">
                      {debitNoteItem ? getReferenceUuid(debitNoteItem) : ""}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 flex-shrink-0 ms-2"
                      onClick={() => copyToClipboard(debitNoteItem ? getReferenceUuid(debitNoteItem) : "", t('notes.referenceUuid'))}
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
                  {t('notes.systemInfo')}
                </CardTitle>
                <CardDescription>
                  {t('notes.systemInfoDesc')}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-gray-500">{t('notes.createdDate')}</Label>
                  <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border">
                    <span className="font-medium text-blue-700">
                      {t('notes.dateAtTime', { date: debitNoteItem?.created_at ? new Date(debitNoteItem.created_at).toLocaleDateString() : '', time: debitNoteItem?.created_at ? new Date(debitNoteItem.created_at).toLocaleTimeString() : '' })}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() => copyToClipboard(debitNoteItem?.created_at || '', t('notes.createdDate'))}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </div>

                {debitNoteItem?.created_by_uuid && (
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-gray-500">{t('notes.createdBy')}</Label>
                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border">
                      <span className="font-mono text-sm break-all">
                        {debitNoteItem?.created_by_uuid}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 flex-shrink-0 ms-2"
                        onClick={() => copyToClipboard(debitNoteItem?.created_by_uuid || '', t('notes.createdByUuid'))}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Label className="text-sm font-medium text-gray-500">{t('common.status')}</Label>
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border">
                    <Badge className={getStatusColor(debitNoteItem?.status || 'draft')}>
                      {te(debitNoteItem?.status || 'draft')}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() => copyToClipboard(debitNoteItem?.status || 'draft', t('common.status'))}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium text-gray-500">{t('notes.inventoryChange')}</Label>
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border">
                    <span className="font-medium">
                      {debitNoteItem?.inventory_change || 0}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() => copyToClipboard((debitNoteItem?.inventory_change || 0).toString(), t('notes.inventoryChange'))}
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