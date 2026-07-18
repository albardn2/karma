import React, { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon, ArrowLeft, Plus, Edit, Trash2, ChevronsUpDown, Check } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { AddItemDialog } from "@/components/purchase-orders/AddItemDialog";
import { EditItemDialog } from "@/components/purchase-orders/EditItemDialog";
import { useLanguage } from "@/contexts/LanguageContext";

interface PurchaseOrderItem {
  temp_id?: string;
  material_uuid: string;
  material_name?: string;
  quantity: number;
  price_per_unit: number;
  unit?: string;
}

const CreatePurchaseOrderSchema = z.object({
  vendor_uuid: z.string().min(1, "Vendor is required"),
  currency: z.string().min(1, "Currency is required"),
  notes: z.string().optional(),
  payout_due_date: z.date().optional(),
});

type CreatePurchaseOrderForm = z.infer<typeof CreatePurchaseOrderSchema>;

export default function PurchaseOrderCreate() {
  const [, setLocation] = useLocation();
  const [items, setItems] = useState<PurchaseOrderItem[]>([]);
  const [addItemDialogOpen, setAddItemDialogOpen] = useState(false);
  const [editItemDialog, setEditItemDialog] = useState<{ open: boolean; item?: PurchaseOrderItem; index?: number }>({ open: false });
  
  // Extract URL parameters
  const urlParams = new URLSearchParams(window.location.search);
  const referrer = urlParams.get('referrer') || localStorage.getItem('purchase_order_create_referrer') || '/purchase-orders';
  const prefilledVendorUuid = urlParams.get('vendor_uuid');
  
  // Store referrer in localStorage for form persistence
  if (urlParams.get('referrer')) {
    localStorage.setItem('purchase_order_create_referrer', urlParams.get('referrer')!);
  }
  
  // Vendor selection state
  const [vendorOpen, setVendorOpen] = useState(false);
  const [vendorSearch, setVendorSearch] = useState("");
  const [vendorValue, setVendorValue] = useState("");
  const [useManualVendorUuid, setUseManualVendorUuid] = useState(!!prefilledVendorUuid);

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { t } = useLanguage();

  // Fetch vendors
  const { data: vendorsData } = useQuery({
    queryKey: ["/vendor/", vendorSearch],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: "1",
        per_page: "10",
      });
      
      if (vendorSearch) {
        params.append("company_name", vendorSearch);
      }

      return await apiRequest(`/vendor/?${params.toString()}`);
    },
  });

  // Fetch currencies
  const { data: currenciesData } = useQuery({
    queryKey: ["/payment/currencies"],
    queryFn: async () => {
      return await apiRequest("/payment/currencies");
    },
  });

  const form = useForm<CreatePurchaseOrderForm>({
    resolver: zodResolver(CreatePurchaseOrderSchema),
    defaultValues: {
      vendor_uuid: prefilledVendorUuid || "",
      currency: "",
      notes: "",
    },
  });

  // Pre-populate form fields if provided
  useEffect(() => {
    if (prefilledVendorUuid && !form.getValues("vendor_uuid")) {
      form.setValue("vendor_uuid", prefilledVendorUuid);
      setVendorValue(prefilledVendorUuid);
    }
  }, [prefilledVendorUuid, form]);

  const createMutation = useMutation({
    mutationFn: async (data: CreatePurchaseOrderForm) => {
      const payload = {
        vendor_uuid: data.vendor_uuid,
        currency: data.currency,
        payout_due_date: data.payout_due_date ? 
          data.payout_due_date.toISOString().replace('Z', '').replace(/\.\d{3}$/, '') + '.000000' : null,
        notes: data.notes || null,
        purchase_order_items: items.map(item => ({
          material_uuid: item.material_uuid,
          quantity: item.quantity,
          price_per_unit: item.price_per_unit,
          unit: item.unit || null,
        })),
      };
      
      return await apiRequest("/purchase-order/with-items", { method: "POST", body: payload });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/purchase-order/"] });
      queryClient.refetchQueries({ queryKey: ["/purchase-order/"] });
      
      // If created from vendor detail page, also invalidate vendor cache
      if (prefilledVendorUuid) {
        queryClient.invalidateQueries({ 
          predicate: (query) => query.queryKey[0] === "/vendor"
        });
      }
      
      toast({
        title: t('common.success'),
        description: t('purchaseOrders.createSuccess'),
      });

      // Clear referrer from localStorage and redirect
      localStorage.removeItem('purchase_order_create_referrer');
      setLocation(referrer);
    },
    onError: (error: any) => {
      toast({
        title: t('common.error'),
        description: error.message || t('purchaseOrders.createError'),
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: CreatePurchaseOrderForm) => {
    if (items.length === 0) {
      toast({
        title: t('common.error'),
        description: t('purchaseOrders.addAtLeastOneItem'),
        variant: "destructive",
      });
      return;
    }
    
    createMutation.mutate(data);
  };

  const handleAddItem = (item: PurchaseOrderItem) => {
    const newItem = { ...item, temp_id: Date.now().toString() };
    setItems(prev => [...prev, newItem]);
    setAddItemDialogOpen(false);
  };

  const handleEditItem = (item: PurchaseOrderItem, index: number) => {
    const updatedItems = [...items];
    updatedItems[index] = { ...item, temp_id: items[index].temp_id };
    setItems(updatedItems);
    setEditItemDialog({ open: false });
  };

  const handleDeleteItem = (index: number) => {
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  const openEditDialog = (item: PurchaseOrderItem, index: number) => {
    setEditItemDialog({ open: true, item, index });
  };

  const vendors = vendorsData?.vendors || [];
  const currencies = Array.isArray(currenciesData) ? currenciesData : [];

  return (
    <AppLayout>
      <div className="p-8 max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLocation("/purchase-orders")}
            >
              <ArrowLeft className="h-4 w-4 me-2" />
              {t('common.back')}
            </Button>
            <div>
              <h1 className="text-3xl font-semibold text-gray-900 dark:text-gray-100">
                {t('purchaseOrders.createTitle')}
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {t('purchaseOrders.createSubtitle')}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <Button 
              variant="outline" 
              onClick={() => setLocation("/purchase-orders")}
              disabled={createMutation.isPending}
            >
              {t('common.cancel')}
            </Button>
            <Button
              onClick={form.handleSubmit(onSubmit)}
              disabled={createMutation.isPending || items.length === 0}
              className="bg-[#5469D4] hover:bg-[#4356C7] text-white"
            >
              {createMutation.isPending ? t('common.creating') : t('purchaseOrders.createTitle')}
            </Button>
          </div>
        </div>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          {/* Purchase Order Details */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t('purchaseOrders.detailsCardTitle')}</CardTitle>
            </CardHeader>
            <CardContent className="p-8">
              {/* Creative asymmetric layout */}
              <div className="space-y-10">
                {/* Primary Section - Vendor (Full Width for Impact) */}
                <div className="relative">
                  <div className="absolute inset-0 bg-gradient-to-r from-[#5469D4]/5 to-transparent rounded-lg -m-4"></div>
                  <div className="relative space-y-6 p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-8 bg-gradient-to-b from-[#5469D4] to-[#4356C7] rounded-full"></div>
                      <div>
                        <Label className="text-lg font-semibold text-gray-800 dark:text-gray-200">
                          {t('purchaseOrders.vendorSelection')} * {prefilledVendorUuid && t('purchaseOrders.preFilled')}
                        </Label>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                          {prefilledVendorUuid
                            ? t('purchaseOrders.vendorPrefilledDesc')
                            : t('purchaseOrders.vendorChooseDesc')
                          }
                        </p>
                      </div>
                    </div>
                    
                    <div className="space-y-6">
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant={!useManualVendorUuid ? "default" : "outline"}
                          size="sm"
                          className={cn(
                            "transition-all duration-200",
                            !useManualVendorUuid ? "bg-[#5469D4] hover:bg-[#4356C7] shadow-md" : ""
                          )}
                          onClick={() => {
                            setUseManualVendorUuid(false);
                            setVendorSearch("");
                            setVendorValue("");
                            form.setValue("vendor_uuid", "");
                          }}
                        >
                          {t('purchaseOrders.browse')}
                        </Button>
                        <Button
                          type="button"
                          variant={useManualVendorUuid ? "default" : "outline"}
                          size="sm"
                          className={cn(
                            "transition-all duration-200",
                            useManualVendorUuid ? "bg-[#5469D4] hover:bg-[#4356C7] shadow-md" : ""
                          )}
                          onClick={() => {
                            setUseManualVendorUuid(true);
                            setVendorSearch("");
                            setVendorValue("");
                            form.setValue("vendor_uuid", "");
                          }}
                        >
                          {t('purchaseOrders.manualEntry')}
                        </Button>
                      </div>

                      <div className="lg:col-span-2">
                        {useManualVendorUuid ? (
                        <Input
                          placeholder={t('purchaseOrders.enterVendorUuid')}
                          value={form.watch("vendor_uuid")}
                          onChange={(e) => {
                            form.setValue("vendor_uuid", e.target.value);
                            setVendorValue(e.target.value);
                          }}
                          className={cn(
                            "h-12 text-lg border-2 border-gray-200 dark:border-gray-600 focus:border-[#5469D4] transition-colors",
                            prefilledVendorUuid ? "bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-600" : ""
                          )}
                        />
                      ) : (
                        <div className="relative">
                          <Button
                            variant="outline"
                            type="button"
                            className="w-full justify-between h-12 text-lg text-start border-2 border-gray-200 dark:border-gray-600 hover:border-[#5469D4] transition-colors"
                            onClick={() => setVendorOpen(!vendorOpen)}
                          >
                            {vendorValue
                              ? vendors?.find((vendor: any) => vendor.uuid === vendorValue)?.company_name || t('purchaseOrders.vendorNotFound')
                              : t('purchaseOrders.selectVendorEllipsis')}
                            <ChevronsUpDown className="ms-2 h-5 w-5 shrink-0 opacity-50" />
                          </Button>
                          
                          {vendorOpen && (
                            <div className="absolute z-50 w-full mt-2 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-lg shadow-xl">
                              <div className="p-4">
                                <Input
                                  placeholder={t('purchaseOrders.searchVendors')}
                                  value={vendorSearch}
                                  onChange={(e) => setVendorSearch(e.target.value)}
                                  className="mb-2"
                                />
                              </div>
                              <div className="max-h-48 overflow-y-auto">
                                {vendors && vendors.length > 0 ? (
                                  vendors.map((vendor: any) => (
                                    <div
                                      key={vendor.uuid}
                                      className="px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer flex items-center transition-colors"
                                      onClick={() => {
                                        setVendorValue(vendor.uuid);
                                        form.setValue("vendor_uuid", vendor.uuid);
                                        setVendorOpen(false);
                                      }}
                                    >
                                      <Check
                                        className={cn(
                                          "me-3 h-4 w-4 text-[#5469D4]",
                                          vendorValue === vendor.uuid ? "opacity-100" : "opacity-0"
                                        )}
                                      />
                                      <span className="font-medium">{vendor.company_name}</span>
                                    </div>
                                  ))
                                ) : (
                                  <div className="px-4 py-3 text-gray-500 dark:text-gray-400 text-center">
                                    {vendors === undefined ? t('common.loading') : t('purchaseOrders.noVendorsFound')}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                        )}
                        {form.formState.errors.vendor_uuid && (
                          <p className="text-sm text-red-600 dark:text-red-400 mt-2 font-medium">{form.formState.errors.vendor_uuid.message}</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Secondary Row - Compact Side-by-Side */}
                <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
                  {/* Currency - Compact */}
                  <div className="lg:col-span-2 space-y-4">
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-6 bg-green-500 rounded-full"></div>
                      <div>
                        <Label className="text-base font-semibold text-gray-800 dark:text-gray-200">
                          {t('common.currency')} *
                        </Label>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {t('purchaseOrders.transactionCurrency')}
                        </p>
                      </div>
                    </div>
                    
                    <Select 
                      value={form.watch("currency")} 
                      onValueChange={(value) => form.setValue("currency", value)}
                    >
                      <SelectTrigger className="h-12 text-lg border-2 border-gray-200 dark:border-gray-600 focus:border-green-500 transition-colors">
                        <SelectValue placeholder={t('purchaseOrders.selectCurrency')} />
                      </SelectTrigger>
                      <SelectContent>
                        {currencies.map((currency: string) => (
                          <SelectItem key={currency} value={currency} className="text-lg">
                            {currency}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {form.formState.errors.currency && (
                      <p className="text-sm text-red-600 dark:text-red-400 font-medium">{form.formState.errors.currency.message}</p>
                    )}
                  </div>

                  {/* Due Date - Compact */}
                  <div className="lg:col-span-3 space-y-4">
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-6 bg-amber-500 rounded-full"></div>
                      <div>
                        <Label className="text-base font-semibold text-gray-800 dark:text-gray-200">
                          {t('purchaseOrders.paymentDueDate')}
                        </Label>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {t('purchaseOrders.paymentDueDateDesc')}
                        </p>
                      </div>
                    </div>
                    
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full h-12 ps-4 text-lg text-start font-normal justify-start border-2 border-gray-200 dark:border-gray-600 hover:border-amber-500 transition-colors",
                            !form.watch("payout_due_date") && "text-muted-foreground"
                          )}
                        >
                          {form.watch("payout_due_date") ? (
                            format(form.watch("payout_due_date"), "EEEE, MMMM do, yyyy")
                          ) : (
                            <span>{t('purchaseOrders.chooseDueDate')}</span>
                          )}
                          <CalendarIcon className="ms-auto h-5 w-5 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={form.watch("payout_due_date")}
                          onSelect={(date) => form.setValue("payout_due_date", date)}
                          disabled={(date) =>
                            date < new Date(new Date().setHours(0, 0, 0, 0))
                          }
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>

                {/* Notes Section - Full Width with Creative Layout */}
                <div className="relative">
                  <div className="absolute inset-0 bg-gradient-to-br from-slate-50 to-gray-50 dark:from-gray-800/50 dark:to-gray-900/50 rounded-lg -m-4"></div>
                  <div className="relative space-y-4 p-4">
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-6 bg-slate-500 rounded-full"></div>
                      <div>
                        <Label className="text-base font-semibold text-gray-800 dark:text-gray-200">
                          {t('purchaseOrders.additionalNotes')}
                        </Label>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {t('purchaseOrders.additionalNotesDesc')}
                        </p>
                      </div>
                    </div>
                    
                    <Textarea
                      placeholder={t('purchaseOrders.notesPlaceholderLong')}
                      value={form.watch("notes")}
                      onChange={(e) => form.setValue("notes", e.target.value)}
                      rows={4}
                      className="resize-none text-base border-2 border-gray-200 dark:border-gray-600 focus:border-slate-500 transition-colors"
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Purchase Order Items */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">{t('purchaseOrders.itemsCardTitle')}</CardTitle>
              <Button
                type="button"
                onClick={() => setAddItemDialogOpen(true)}
                variant="outline"
                size="sm"
                className="bg-[#5469D4] hover:bg-[#4356C7] text-white border-[#5469D4]"
              >
                <Plus className="h-4 w-4 me-2" />
                {t('purchaseOrders.addItem')}
              </Button>
            </CardHeader>
            <CardContent>
              {items.length === 0 ? (
                <div className="text-center py-12">
                  <div className="mx-auto w-12 h-12 bg-gray-100 dark:bg-gray-800 rounded-lg flex items-center justify-center mb-4">
                    <Plus className="h-6 w-6 text-gray-400" />
                  </div>
                  <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                    {t('purchaseOrders.noItemsTitle')}
                  </h3>
                  <p className="text-gray-500 dark:text-gray-400 mb-6">
                    {t('purchaseOrders.noItemsDesc')}
                  </p>
                  <Button
                    type="button"
                    onClick={() => setAddItemDialogOpen(true)}
                    className="bg-[#5469D4] hover:bg-[#4356C7] text-white"
                  >
                    <Plus className="h-4 w-4 me-2" />
                    {t('purchaseOrders.addFirstItem')}
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="border-b border-gray-200 dark:border-gray-700">
                        <tr>
                          <th className="text-start py-3 text-sm font-medium text-gray-500 dark:text-gray-400">{t('purchaseOrders.material')}</th>
                          <th className="text-start py-3 text-sm font-medium text-gray-500 dark:text-gray-400">{t('common.quantity')}</th>
                          <th className="text-start py-3 text-sm font-medium text-gray-500 dark:text-gray-400">{t('purchaseOrders.unitPrice')}</th>
                          <th className="text-start py-3 text-sm font-medium text-gray-500 dark:text-gray-400">{t('common.total')}</th>
                          <th className="text-start py-3 text-sm font-medium text-gray-500 dark:text-gray-400">{t('common.actions')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                        {items.map((item, index) => (
                          <tr key={item.temp_id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                            <td className="py-4">
                              <div>
                                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                  {item.material_name || t('purchaseOrders.materialFallback', { id: item.material_uuid.substring(0, 8) })}
                                </p>
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                  {item.material_uuid.substring(0, 8)}...
                                </p>
                              </div>
                            </td>
                            <td className="py-4">
                              <div className="text-sm text-gray-900 dark:text-gray-100">
                                {item.quantity} {item.unit}
                              </div>
                            </td>
                            <td className="py-4">
                              <div className="text-sm text-gray-900 dark:text-gray-100">
                                ${item.price_per_unit.toFixed(2)}
                              </div>
                            </td>
                            <td className="py-4">
                              <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                ${(item.quantity * item.price_per_unit).toFixed(2)}
                              </div>
                            </td>
                            <td className="py-4">
                              <div className="flex items-center gap-2">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => openEditDialog(item, index)}
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDeleteItem(index)}
                                  className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Total Section */}
                  <div className="flex justify-end pt-4 border-t border-gray-200 dark:border-gray-700">
                    <div className="text-end space-y-2">
                      <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                        {t('common.total')}: ${items.reduce((sum, item) => sum + (item.quantity * item.price_per_unit), 0).toFixed(2)}
                      </div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {items.length} {items.length !== 1 ? t('purchaseOrders.items') : t('purchaseOrders.item')}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Bottom Action Buttons - Inside Form */}
          <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-end gap-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate("/purchase-orders")}
                className="px-6"
              >
                {t('common.cancel')}
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending}
                className="bg-[#5469D4] hover:bg-[#4356C7] text-white px-6"
              >
                {createMutation.isPending ? t('common.creating') : t('purchaseOrders.createTitle')}
              </Button>
            </div>
          </div>
        </form>

        {/* Dialogs */}
        <AddItemDialog
          open={addItemDialogOpen}
          onOpenChange={setAddItemDialogOpen}
          onAddItem={handleAddItem}
        />

        {editItemDialog.open && editItemDialog.item && (
          <EditItemDialog
            open={editItemDialog.open}
            onOpenChange={(open) => setEditItemDialog({ open })}
            onEditItem={(item) => handleEditItem(item, editItemDialog.index!)}
            item={editItemDialog.item}
          />
        )}
      </div>
    </AppLayout>
  );
}