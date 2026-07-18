import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useForm, SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
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
import { ArrowLeft } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

const createSchema = z.object({
  amount: z.number().positive("notes.validationAmount"),
  currency: z.string().min(1, "notes.validationCurrency"),
  notes: z.string().optional(),
  reference_uuid: z.string().uuid("notes.validationUuid"),
  inventory_change: z.number().optional(),
  create_payout: z.boolean().default(false)
});

type CreateFormData = z.infer<typeof createSchema>;

export default function CreditNoteItemCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { t, te } = useLanguage();

  // Get URL params for pre-filling
  const urlParams = new URLSearchParams(window.location.search);
  const prefilledData = {
    invoice_item_uuid: urlParams.get('invoice_item_uuid') || undefined,
    customer_uuid: urlParams.get('customer_uuid') || undefined,
    vendor_uuid: urlParams.get('vendor_uuid') || undefined,
    purchase_order_item_uuid: urlParams.get('purchase_order_item_uuid') || undefined,
    amount: urlParams.get('amount') ? parseFloat(urlParams.get('amount')!) : undefined,
    currency: urlParams.get('currency') || undefined,
  };

  // Determine initial reference type and UUID based on prefilled data
  const getInitialReferenceType = () => {
    if (prefilledData.invoice_item_uuid) return "invoice_item";
    if (prefilledData.customer_uuid) return "customer";
    if (prefilledData.vendor_uuid) return "vendor";
    if (prefilledData.purchase_order_item_uuid) return "purchase_order_item";
    return "invoice_item";
  };

  const getInitialReferenceUuid = () => {
    if (prefilledData.invoice_item_uuid) return prefilledData.invoice_item_uuid;
    if (prefilledData.customer_uuid) return prefilledData.customer_uuid;
    if (prefilledData.vendor_uuid) return prefilledData.vendor_uuid;
    if (prefilledData.purchase_order_item_uuid) return prefilledData.purchase_order_item_uuid;
    return "";
  };

  const [referenceType, setReferenceType] = useState<string>(getInitialReferenceType());
  const [initialReferenceType] = useState(getInitialReferenceType());

  const form = useForm<CreateFormData>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      inventory_change: 0,
      notes: "",
      create_payout: false,
      reference_uuid: getInitialReferenceUuid(),
      amount: prefilledData.amount,
      currency: prefilledData.currency
    }
  });

  // Fetch currencies
  const { data: currencies, isLoading: currenciesLoading } = useQuery({
    queryKey: ["/payment/currencies"],
    enabled: true
  });

  const createMutation = useMutation({
    mutationFn: async (data: CreateFormData) => {
      // Create the base payload
      const basePayload = {
        amount: data.amount,
        currency: data.currency,
        notes: data.notes || null,
        inventory_change: data.inventory_change || null,
        create_payout: data.create_payout
      };

      // Add the correct UUID field based on reference type
      const payloadWithReference = {
        ...basePayload,
        ...(referenceType === "invoice_item" && { invoice_item_uuid: data.reference_uuid }),
        ...(referenceType === "customer" && { customer_uuid: data.reference_uuid }),
        ...(referenceType === "vendor" && { vendor_uuid: data.reference_uuid }),
        ...(referenceType === "purchase_order_item" && { purchase_order_item_uuid: data.reference_uuid })
      };

      const response = await apiRequest("/credit-note-item/", {
        method: "POST",
        body: payloadWithReference
      });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/credit-note-item/"] });
      toast({
        title: t('common.success'),
        description: t('notes.creditCreated'),
      });
      setLocation("/credit-note-items");
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: t('common.error'),
        description: error.message || t('notes.creditCreateFailed'),
      });
    }
  });

  const onSubmit: SubmitHandler<CreateFormData> = (data) => {
    createMutation.mutate(data);
  };

  const isReferenceUuidPrefilled = () => {
    return getInitialReferenceUuid() !== "";
  };

  const handleTabChange = (value: string) => {
    setReferenceType(value);
    // Clear the reference UUID when switching tabs unless it's the initial tab with prefilled data
    if (value !== initialReferenceType) {
      form.setValue("reference_uuid", "");
    }
  };

  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="flex items-center gap-4 mb-6">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation("/credit-note-items")}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{t('notes.createCreditItem')}</h1>
            <p className="text-gray-600 mt-1">
              {t('notes.createCreditSubtitle')}
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t('notes.creditItemInfo')}</CardTitle>
            <CardDescription>
              {t('notes.creditItemInfoDesc')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Amount */}
                <div className="space-y-2">
                  <Label htmlFor="amount">{t('common.amount')} *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    {...form.register("amount", { valueAsNumber: true })}
                    placeholder="0.00"
                    className={prefilledData.amount ? "border-blue-300 bg-blue-50" : ""}
                  />
                  {prefilledData.amount && (
                    <p className="text-xs text-blue-600">{t('notes.prefilledReferring')}</p>
                  )}
                  {form.formState.errors.amount && (
                    <p className="text-sm text-red-600">{t(form.formState.errors.amount.message || '')}</p>
                  )}
                </div>

                {/* Currency */}
                <div className="space-y-2">
                  <Label htmlFor="currency">{t('common.currency')} *</Label>
                  <Select
                    value={form.watch("currency") || ""}
                    onValueChange={(value) => form.setValue("currency", value)}
                    disabled={currenciesLoading}
                  >
                    <SelectTrigger className={prefilledData.currency ? "border-blue-300 bg-blue-50" : ""}>
                      <SelectValue placeholder={currenciesLoading ? t('notes.loadingCurrencies') : t('notes.selectCurrencyDots')} />
                    </SelectTrigger>
                    <SelectContent>
                      {currencies && Array.isArray(currencies) ? currencies.map((currency: string) => (
                        <SelectItem key={currency} value={currency}>
                          {te(currency)}
                        </SelectItem>
                      )) : (
                        <SelectItem value="loading" disabled>{t('notes.loadingCurrencies')}</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                  {prefilledData.currency && (
                    <p className="text-xs text-blue-600">{t('notes.prefilledReferring')}</p>
                  )}
                  {form.formState.errors.currency && (
                    <p className="text-sm text-red-600">{t(form.formState.errors.currency.message || '')}</p>
                  )}
                </div>
              </div>

              {/* Reference Information with Tabs */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium">{t('notes.referenceInformation')}</h3>
                <p className="text-sm text-gray-600">{t('notes.selectReferenceProvideUuid')}</p>

                <Tabs value={referenceType} onValueChange={handleTabChange} className="w-full">
                  <TabsList className="grid w-full grid-cols-4">
                    <TabsTrigger value="invoice_item">{t('notes.refInvoiceItem')}</TabsTrigger>
                    <TabsTrigger value="customer">{t('notes.refCustomer')}</TabsTrigger>
                    <TabsTrigger value="vendor">{t('notes.refVendor')}</TabsTrigger>
                    <TabsTrigger value="purchase_order_item">{t('notes.refPurchaseOrderItem')}</TabsTrigger>
                  </TabsList>

                  <TabsContent value="invoice_item" className="space-y-2">
                    <Label htmlFor="reference_uuid">{t('notes.invoiceItemUuid')} *</Label>
                    <Input
                      {...form.register("reference_uuid")}
                      placeholder={t('notes.enterInvoiceItemUuid')}
                      className={isReferenceUuidPrefilled() && referenceType === "invoice_item" ? "border-blue-300 bg-blue-50" : ""}
                    />
                    {isReferenceUuidPrefilled() && referenceType === "invoice_item" && (
                      <p className="text-xs text-blue-600">{t('notes.prefilledReferring')}</p>
                    )}
                  </TabsContent>

                  <TabsContent value="customer" className="space-y-2">
                    <Label htmlFor="reference_uuid">{t('notes.customerUuid')} *</Label>
                    <Input
                      {...form.register("reference_uuid")}
                      placeholder={t('notes.enterCustomerUuid')}
                      className={isReferenceUuidPrefilled() && referenceType === "customer" ? "border-blue-300 bg-blue-50" : ""}
                    />
                    {isReferenceUuidPrefilled() && referenceType === "customer" && (
                      <p className="text-xs text-blue-600">{t('notes.prefilledReferring')}</p>
                    )}
                  </TabsContent>

                  <TabsContent value="vendor" className="space-y-2">
                    <Label htmlFor="reference_uuid">{t('notes.vendorUuid')} *</Label>
                    <Input
                      {...form.register("reference_uuid")}
                      placeholder={t('notes.enterVendorUuid')}
                      className={isReferenceUuidPrefilled() && referenceType === "vendor" ? "border-blue-300 bg-blue-50" : ""}
                    />
                    {isReferenceUuidPrefilled() && referenceType === "vendor" && (
                      <p className="text-xs text-blue-600">{t('notes.prefilledReferring')}</p>
                    )}
                  </TabsContent>

                  <TabsContent value="purchase_order_item" className="space-y-2">
                    <Label htmlFor="reference_uuid">{t('notes.purchaseOrderItemUuid')} *</Label>
                    <Input
                      {...form.register("reference_uuid")}
                      placeholder={t('notes.enterPurchaseOrderItemUuid')}
                      className={isReferenceUuidPrefilled() && referenceType === "purchase_order_item" ? "border-blue-300 bg-blue-50" : ""}
                    />
                    {isReferenceUuidPrefilled() && referenceType === "purchase_order_item" && (
                      <p className="text-xs text-blue-600">{t('notes.prefilledReferring')}</p>
                    )}
                  </TabsContent>
                </Tabs>

                {form.formState.errors.reference_uuid && (
                  <p className="text-sm text-red-600">{t(form.formState.errors.reference_uuid.message || '')}</p>
                )}
              </div>

              {/* Inventory Change */}
              <div className="space-y-2">
                <Label htmlFor="inventory_change">{t('notes.inventoryChange')}</Label>
                <Input
                  type="number"
                  {...form.register("inventory_change", { valueAsNumber: true })}
                  placeholder="0"
                />
                <p className="text-xs text-gray-500">
                  {t('notes.inventoryChangeHint')}
                </p>
                {form.formState.errors.inventory_change && (
                  <p className="text-sm text-red-600">{t(form.formState.errors.inventory_change.message || '')}</p>
                )}
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <Label htmlFor="notes">{t('common.notes')}</Label>
                <Textarea
                  {...form.register("notes")}
                  placeholder={t('notes.notesPlaceholder')}
                  rows={3}
                />
                {form.formState.errors.notes && (
                  <p className="text-sm text-red-600">{t(form.formState.errors.notes.message || '')}</p>
                )}
              </div>

              {/* Auto Pay Checkbox */}
              <div className="flex items-center space-x-2 rtl:space-x-reverse">
                <Checkbox
                  id="create_payout"
                  checked={form.watch("create_payout")}
                  onCheckedChange={(checked) => form.setValue("create_payout", checked as boolean)}
                />
                <Label htmlFor="create_payout" className="text-sm font-medium">
                  {t('notes.autoPayCredit')}
                </Label>
              </div>

              {/* Form Actions */}
              <div className="flex justify-end space-x-3 rtl:space-x-reverse pt-6 border-t">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setLocation("/credit-note-items")}
                  disabled={createMutation.isPending}
                >
                  {t('common.cancel')}
                </Button>
                <Button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="bg-purple-600 hover:bg-purple-700"
                >
                  {createMutation.isPending ? t('common.creating') : t('notes.createCreditItem')}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}