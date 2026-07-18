import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useForm, SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, FileText, User, Package, ShoppingCart, Receipt } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { AppLayout } from "@/components/layout/AppLayout";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useLanguage } from "@/contexts/LanguageContext";

const createSchema = z.object({
  amount: z.number().min(0.01, "notes.validationAmount"),
  currency: z.string().min(1, "notes.validationCurrency"),
  notes: z.string().optional(),
  invoice_item_uuid: z.string().optional(),
  customer_uuid: z.string().optional(),
  vendor_uuid: z.string().optional(),
  purchase_order_item_uuid: z.string().optional(),
  inventory_change: z.number().optional(),
  create_payment: z.boolean().optional(),
});

type CreateFormData = z.infer<typeof createSchema>;

export default function DebitNoteItemCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { t, te } = useLanguage();
  const [activeTab, setActiveTab] = useState("invoice_item");
  
  // Get URL parameters for pre-filling
  const urlParams = new URLSearchParams(window.location.search);
  const prefilledInvoiceItemUuid = urlParams.get('invoice_item_uuid');
  const prefilledCustomerUuid = urlParams.get('customer_uuid');
  const prefilledVendorUuid = urlParams.get('vendor_uuid');
  const prefilledPurchaseOrderItemUuid = urlParams.get('purchase_order_item_uuid');
  const prefilledAmount = urlParams.get('amount');
  const prefilledCurrency = urlParams.get('currency');

  // Set active tab based on prefilled data
  useEffect(() => {
    if (prefilledInvoiceItemUuid) setActiveTab("invoice_item");
    else if (prefilledCustomerUuid) setActiveTab("customer");
    else if (prefilledVendorUuid) setActiveTab("vendor");
    else if (prefilledPurchaseOrderItemUuid) setActiveTab("purchase_order_item");
  }, [prefilledInvoiceItemUuid, prefilledCustomerUuid, prefilledVendorUuid, prefilledPurchaseOrderItemUuid]);

  const form = useForm<CreateFormData>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      amount: prefilledAmount ? parseFloat(prefilledAmount) : 0,
      currency: prefilledCurrency || "",
      notes: "",
      invoice_item_uuid: prefilledInvoiceItemUuid || "",
      customer_uuid: prefilledCustomerUuid || "",
      vendor_uuid: prefilledVendorUuid || "",
      purchase_order_item_uuid: prefilledPurchaseOrderItemUuid || "",
      inventory_change: 0,
      create_payment: false,
    }
  });

  // Get currencies from API
  const { data: currencies } = useQuery<string[]>({
    queryKey: ["/payment/currencies"],
    staleTime: 300000
  });

  const createMutation = useMutation({
    mutationFn: async (data: CreateFormData) => {
      // Build payload based on active tab
      const payload: any = {
        amount: data.amount,
        currency: data.currency,
        notes: data.notes || null,
        inventory_change: data.inventory_change || null,
        create_payment: data.create_payment || false,
      };

      // Add the appropriate UUID field based on active tab
      if (activeTab === "invoice_item" && data.invoice_item_uuid) {
        payload.invoice_item_uuid = data.invoice_item_uuid;
      } else if (activeTab === "customer" && data.customer_uuid) {
        payload.customer_uuid = data.customer_uuid;
      } else if (activeTab === "vendor" && data.vendor_uuid) {
        payload.vendor_uuid = data.vendor_uuid;
      } else if (activeTab === "purchase_order_item" && data.purchase_order_item_uuid) {
        payload.purchase_order_item_uuid = data.purchase_order_item_uuid;
      }

      const response = await apiRequest("/debit-note-item/", {
        method: "POST",
        body: payload
      });
      return response;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/debit-note-item/"] });
      toast({
        title: t('common.success'),
        description: t('notes.debitCreated'),
      });
      setLocation("/debit-note-items");
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: t('common.error'),
        description: error.message || t('notes.debitCreateFailed'),
      });
    }
  });

  const onSubmit: SubmitHandler<CreateFormData> = (data) => {
    createMutation.mutate(data);
  };

  const getTabIcon = (tab: string) => {
    switch (tab) {
      case "invoice_item": return <Receipt className="h-4 w-4" />;
      case "customer": return <User className="h-4 w-4" />;
      case "vendor": return <Package className="h-4 w-4" />;
      case "purchase_order_item": return <ShoppingCart className="h-4 w-4" />;
      default: return <FileText className="h-4 w-4" />;
    }
  };

  const getTabColor = (tab: string) => {
    switch (tab) {
      case "invoice_item": return "text-purple-600";
      case "customer": return "text-blue-600";
      case "vendor": return "text-green-600";
      case "purchase_order_item": return "text-orange-600";
      default: return "text-gray-600";
    }
  };

  return (
    <AppLayout>
      <div className="p-6 space-y-6 max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation("/debit-note-items")}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t('notes.createDebitItem')}</h1>
            <p className="text-gray-600">{t('notes.createDebitSubtitle')}</p>
          </div>
        </div>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-purple-600" />
                {t('notes.debitInfo')}
              </CardTitle>
              <CardDescription>
                {t('notes.debitInfoDesc')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="amount">{t('common.amount')} *</Label>
                  <Input
                    id="amount"
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    {...form.register("amount", { valueAsNumber: true })}
                    className={prefilledAmount ? "bg-blue-50 border-blue-200" : ""}
                  />
                  {prefilledAmount && (
                    <p className="text-xs text-blue-600">{t('notes.prefilledPrevious')}</p>
                  )}
                  {form.formState.errors.amount && (
                    <p className="text-sm text-red-600">{t(form.formState.errors.amount.message || '')}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="currency">{t('common.currency')} *</Label>
                  <Select
                    value={form.watch("currency")}
                    onValueChange={(value) => form.setValue("currency", value)}
                  >
                    <SelectTrigger className={prefilledCurrency ? "bg-blue-50 border-blue-200" : ""}>
                      <SelectValue placeholder={t('notes.selectCurrency')} />
                    </SelectTrigger>
                    <SelectContent>
                      {currencies?.map((currency) => (
                        <SelectItem key={currency} value={currency}>
                          {te(currency)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {prefilledCurrency && (
                    <p className="text-xs text-blue-600">{t('notes.prefilledPrevious')}</p>
                  )}
                  {form.formState.errors.currency && (
                    <p className="text-sm text-red-600">{t(form.formState.errors.currency.message || '')}</p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">{t('common.notes')}</Label>
                <Textarea
                  id="notes"
                  placeholder={t('notes.notesPlaceholder')}
                  {...form.register("notes")}
                  rows={3}
                  className="resize-none"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="inventory_change">{t('notes.inventoryChange')}</Label>
                <Input
                  id="inventory_change"
                  type="number"
                  step="0.01"
                  placeholder="0"
                  {...form.register("inventory_change", { valueAsNumber: true })}
                />
              </div>

              <div className="flex items-center space-x-2 rtl:space-x-reverse">
                <Checkbox
                  id="create_payment"
                  checked={form.watch("create_payment")}
                  onCheckedChange={(checked) => form.setValue("create_payment", !!checked)}
                />
                <Label htmlFor="create_payment" className="text-sm font-medium">
                  {t('notes.autoPayDebit')}
                </Label>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('notes.referenceSelection')}</CardTitle>
              <CardDescription>
                {t('notes.selectReferenceProvideUuidDebit')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="invoice_item" className="flex items-center gap-1">
                    <span className={getTabIcon("invoice_item").props.className + " " + getTabColor("invoice_item")}>{getTabIcon("invoice_item")}</span>
                    {t('notes.refInvoiceItem')}
                  </TabsTrigger>
                  <TabsTrigger value="customer" className="flex items-center gap-1">
                    <span className={getTabIcon("customer").props.className + " " + getTabColor("customer")}>{getTabIcon("customer")}</span>
                    {t('notes.refCustomer')}
                  </TabsTrigger>
                  <TabsTrigger value="vendor" className="flex items-center gap-1">
                    <span className={getTabIcon("vendor").props.className + " " + getTabColor("vendor")}>{getTabIcon("vendor")}</span>
                    {t('notes.refVendor')}
                  </TabsTrigger>
                  <TabsTrigger value="purchase_order_item" className="flex items-center gap-1">
                    <span className={getTabIcon("purchase_order_item").props.className + " " + getTabColor("purchase_order_item")}>{getTabIcon("purchase_order_item")}</span>
                    {t('notes.refPurchaseOrderItem')}
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="invoice_item" className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="invoice_item_uuid">{t('notes.invoiceItemUuid')}</Label>
                    <Input
                      id="invoice_item_uuid"
                      placeholder={t('notes.enterInvoiceItemUuid')}
                      {...form.register("invoice_item_uuid")}
                      className={prefilledInvoiceItemUuid ? "bg-purple-50 border-purple-200" : ""}
                    />
                    {prefilledInvoiceItemUuid && (
                      <p className="text-xs text-purple-600">{t('notes.prefilledPrevious')}</p>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="customer" className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="customer_uuid">{t('notes.customerUuid')}</Label>
                    <Input
                      id="customer_uuid"
                      placeholder={t('notes.enterCustomerUuid')}
                      {...form.register("customer_uuid")}
                      className={prefilledCustomerUuid ? "bg-blue-50 border-blue-200" : ""}
                    />
                    {prefilledCustomerUuid && (
                      <p className="text-xs text-blue-600">{t('notes.prefilledPrevious')}</p>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="vendor" className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="vendor_uuid">{t('notes.vendorUuid')}</Label>
                    <Input
                      id="vendor_uuid"
                      placeholder={t('notes.enterVendorUuid')}
                      {...form.register("vendor_uuid")}
                      className={prefilledVendorUuid ? "bg-green-50 border-green-200" : ""}
                    />
                    {prefilledVendorUuid && (
                      <p className="text-xs text-green-600">{t('notes.prefilledPrevious')}</p>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="purchase_order_item" className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="purchase_order_item_uuid">{t('notes.purchaseOrderItemUuid')}</Label>
                    <Input
                      id="purchase_order_item_uuid"
                      placeholder={t('notes.enterPurchaseOrderItemUuid')}
                      {...form.register("purchase_order_item_uuid")}
                      className={prefilledPurchaseOrderItemUuid ? "bg-orange-50 border-orange-200" : ""}
                    />
                    {prefilledPurchaseOrderItemUuid && (
                      <p className="text-xs text-orange-600">{t('notes.prefilledPrevious')}</p>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          <div className="flex justify-end gap-2">
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => setLocation("/debit-note-items")}
              disabled={createMutation.isPending}
            >
              {t('common.cancel')}
            </Button>
            <Button
              type="submit"
              className="bg-purple-600 hover:bg-purple-700"
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? t('common.creating') : t('notes.createDebitItem')}
            </Button>
          </div>
        </form>
      </div>
    </AppLayout>
  );
}