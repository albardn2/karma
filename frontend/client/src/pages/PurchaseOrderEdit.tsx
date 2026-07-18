import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarIcon, ArrowLeft, Plus, Trash2, ChevronsUpDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";


const PurchaseOrderItemSchema = z.object({
  uuid: z.string().optional(),
  material_uuid: z.string().min(1, "Material is required"),
  quantity: z.number().min(1, "Quantity must be at least 1"),
  price_per_unit: z.number().min(0, "Price must be positive"),
  currency: z.string().optional(),
  unit: z.string().optional(),
  quantity_received: z.number().min(0, "Quantity received must be positive").default(0),
});

const UpdatePurchaseOrderSchema = z.object({
  vendor_uuid: z.string().min(1, "Vendor is required"),
  currency: z.string().min(1, "Currency is required"),
  notes: z.string().optional(),
  payout_due_date: z.date().optional(),
  purchase_order_items: z.array(PurchaseOrderItemSchema).min(1, "At least one item is required"),
});

type UpdatePurchaseOrderForm = z.infer<typeof UpdatePurchaseOrderSchema>;

export default function PurchaseOrderEdit() {
  const { id } = useParams();
  const [, setLocation] = useLocation();
  const [useManualVendorUuid, setUseManualVendorUuid] = useState(false);
  const [useManualMaterialUuid, setUseManualMaterialUuid] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { t } = useLanguage();

  // Fetch purchase order data
  const { data: purchaseOrder, isLoading } = useQuery({
    queryKey: ["/purchase-order", id],
    queryFn: () => apiRequest(`/purchase-order/${id}`),
    enabled: !!id,
  });

  // Fetch vendors
  const { data: vendorsData } = useQuery({
    queryKey: ["/vendor", { per_page: 1000 }],
    queryFn: () => apiRequest("/vendor?per_page=1000"),
  });

  // Fetch materials 
  const { data: materialsData } = useQuery({
    queryKey: ["/material", { per_page: 1000 }],
    queryFn: () => apiRequest("/material?per_page=1000"),
  });

  // Fetch currencies
  const { data: currenciesData } = useQuery({
    queryKey: ["/payment/currencies"],
    queryFn: async () => {
      return await apiRequest("/payment/currencies");
    },
  });

  const form = useForm<UpdatePurchaseOrderForm>({
    resolver: zodResolver(UpdatePurchaseOrderSchema),
    defaultValues: {
      vendor_uuid: "",
      currency: "",
      notes: "",
      purchase_order_items: [],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "purchase_order_items",
  });

  // Initialize form with purchase order data
  useEffect(() => {
    if (purchaseOrder) {
      form.reset({
        vendor_uuid: purchaseOrder.vendor_uuid,
        currency: purchaseOrder.currency,
        notes: purchaseOrder.notes || "",
        payout_due_date: purchaseOrder.payout_due_date ? new Date(purchaseOrder.payout_due_date) : undefined,
        purchase_order_items: purchaseOrder.purchase_order_items.map((item: any) => ({
          uuid: item.uuid,
          material_uuid: item.material_uuid,
          quantity: item.quantity,
          price_per_unit: item.price_per_unit,
          currency: item.currency,
          unit: item.unit,
          quantity_received: item.quantity_received,
        })),
      });
    }
  }, [purchaseOrder, form]);

  const updateMutation = useMutation({
    mutationFn: async (data: UpdatePurchaseOrderForm) => {
      const payload = {
        ...data,
        payout_due_date: data.payout_due_date?.toISOString() || null,
        notes: data.notes || null,
      };
      return apiRequest(`/purchase-order/${id}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/purchase-order"] });
      queryClient.invalidateQueries({ queryKey: ["/purchase-order", id] });
      toast({
        title: t('common.success'),
        description: t('purchaseOrders.updateSuccess'),
      });
      setLocation(`/purchase-orders/${id}`);
    },
    onError: (error: any) => {
      toast({
        title: t('common.error'),
        description: error.message || t('purchaseOrders.updateError'),
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: UpdatePurchaseOrderForm) => {
    updateMutation.mutate(data);
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="space-y-6 p-6">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-96" />
        </div>
      </AppLayout>
    );
  }

  if (!purchaseOrder) {
    return (
      <AppLayout>
        <div className="p-6">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-gray-900">{t('purchaseOrders.notFoundTitle')}</h2>
            <p className="mt-2 text-gray-600">{t('purchaseOrders.notFoundDesc')}</p>
            <Button className="mt-4" onClick={() => setLocation("/purchase-orders")}>
              {t('purchaseOrders.backToPurchaseOrders')}
            </Button>
          </div>
        </div>
      </AppLayout>
    );
  }

  const vendors = vendorsData?.items || [];
  const materials = materialsData?.items || [];
  const currencies = Array.isArray(currenciesData) ? currenciesData : [];

  return (
    <AppLayout>
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLocation(`/purchase-orders/${id}`)}
            >
              <ArrowLeft className="h-4 w-4 me-2" />
              {t('purchaseOrders.backToPurchaseOrder')}
            </Button>
            <div>
              <h1 className="text-2xl font-bold">
                {t('purchaseOrders.editTitle', { id: purchaseOrder.uuid.slice(-8).toUpperCase() })}
              </h1>
              <p className="text-muted-foreground">{t('purchaseOrders.editSubtitle')}</p>
            </div>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t('purchaseOrders.orderInfoCardTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="vendor_uuid"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('purchaseOrders.vendor')}</FormLabel>
                        <div className="flex gap-2 mb-2">
                          <Button
                            type="button"
                            variant={!useManualVendorUuid ? "default" : "outline"}
                            size="sm"
                            onClick={() => {
                              setUseManualVendorUuid(false);
                              setVendorOpen(false);
                              setVendorValue("");
                              field.onChange("");
                            }}
                          >
                            {t('purchaseOrders.selectVendorBtn')}
                          </Button>
                          <Button
                            type="button"
                            variant={useManualVendorUuid ? "default" : "outline"}
                            size="sm"
                            onClick={() => {
                              setUseManualVendorUuid(true);
                              setVendorOpen(false);
                              setVendorValue("");
                              field.onChange("");
                            }}
                          >
                            {t('purchaseOrders.enterUuidManually')}
                          </Button>
                        </div>
                        <FormControl>
                          {useManualVendorUuid ? (
                            <Input
                              placeholder={t('purchaseOrders.enterVendorUuid')}
                              value={field.value}
                              onChange={field.onChange}
                            />
                          ) : (
                            <Select onValueChange={field.onChange} value={field.value}>
                              <SelectTrigger>
                                <SelectValue placeholder={t('purchaseOrders.selectVendorPlaceholder')} />
                              </SelectTrigger>
                              <SelectContent>
                                {vendors.map((vendor: any) => (
                                  <SelectItem key={vendor.uuid} value={vendor.uuid}>
                                    {vendor.company_name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="currency"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('common.currency')}</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder={t('purchaseOrders.selectCurrency')} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {currencies && currencies.length > 0 ? (
                              currencies.map((currency: string) => (
                                <SelectItem key={currency} value={currency}>
                                  {currency}
                                </SelectItem>
                              ))
                            ) : (
                              <SelectItem value="" disabled>
                                {t('purchaseOrders.noCurrencies')}
                              </SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="payout_due_date"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>{t('purchaseOrders.dueDate')}</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant={"outline"}
                                className={cn(
                                  "w-full ps-3 text-start font-normal",
                                  !field.value && "text-muted-foreground"
                                )}
                              >
                                {field.value ? (
                                  format(field.value, "PPP")
                                ) : (
                                  <span>{t('purchaseOrders.pickDate')}</span>
                                )}
                                <CalendarIcon className="ms-auto h-4 w-4 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={field.value}
                              onSelect={field.onChange}
                              disabled={(date) =>
                                date < new Date(new Date().setHours(0, 0, 0, 0))
                              }
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('common.notes')}</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder={t('purchaseOrders.notesPlaceholder')}
                          className="resize-none"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>{t('purchaseOrders.itemsCardTitle')}</CardTitle>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => append({
                        material_uuid: "",
                        quantity: 1,
                        price_per_unit: 0,
                        currency: "",
                        unit: "",
                        quantity_received: 0,
                      })}
                    >
                      <Plus className="h-4 w-4 me-1" />
                      {t('purchaseOrders.addItem')}
                    </Button>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {fields.map((field, index) => (
                      <div key={field.id} className="p-4 border rounded-lg space-y-4">
                        <div className="flex items-center justify-between">
                          <h4 className="font-medium">{t('purchaseOrders.itemNumber', { number: index + 1 })}</h4>
                          {fields.length > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => remove(index)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          <FormField
                            control={form.control}
                            name={`purchase_order_items.${index}.material_uuid`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>{t('purchaseOrders.material')}</FormLabel>
                                <div className="flex gap-2 mb-2">
                                  <Button
                                    type="button"
                                    variant={!useManualMaterialUuid ? "default" : "outline"}
                                    size="sm"
                                    onClick={() => {
                                      setUseManualMaterialUuid(false);
                                      field.onChange("");
                                    }}
                                  >
                                    {t('purchaseOrders.selectMaterial')}
                                  </Button>
                                  <Button
                                    type="button"
                                    variant={useManualMaterialUuid ? "default" : "outline"}
                                    size="sm"
                                    onClick={() => {
                                      setUseManualMaterialUuid(true);
                                      field.onChange("");
                                    }}
                                  >
                                    {t('purchaseOrders.enterUuidManually')}
                                  </Button>
                                </div>
                                <FormControl>
                                  {useManualMaterialUuid ? (
                                    <Input
                                      placeholder={t('purchaseOrders.enterMaterialUuid')}
                                      value={field.value}
                                      onChange={field.onChange}
                                    />
                                  ) : (
                                    <Select onValueChange={field.onChange} value={field.value}>
                                      <SelectTrigger>
                                        <SelectValue placeholder={t('purchaseOrders.selectMaterialPlaceholder')} />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {materials.map((material: any) => (
                                          <SelectItem key={material.uuid} value={material.uuid}>
                                            {material.name}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  )}
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name={`purchase_order_items.${index}.quantity`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>{t('common.quantity')}</FormLabel>
                                <FormControl>
                                  <Input
                                    type="number"
                                    min="1"
                                    {...field}
                                    onChange={(e) => field.onChange(Number(e.target.value))}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name={`purchase_order_items.${index}.price_per_unit`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>{t('purchaseOrders.pricePerUnitLabel')}</FormLabel>
                                <FormControl>
                                  <Input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    {...field}
                                    onChange={(e) => field.onChange(Number(e.target.value))}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name={`purchase_order_items.${index}.unit`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>{t('purchaseOrders.unit')}</FormLabel>
                                <FormControl>
                                  <Input placeholder={t('purchaseOrders.unitPlaceholder')} {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name={`purchase_order_items.${index}.quantity_received`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>{t('purchaseOrders.quantityReceived')}</FormLabel>
                                <FormControl>
                                  <Input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    {...field}
                                    onChange={(e) => field.onChange(Number(e.target.value))}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <div className="flex justify-end space-x-2 rtl:space-x-reverse">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setLocation(`/purchase-orders/${id}`)}
                  >
                    {t('common.cancel')}
                  </Button>
                  <Button
                    type="submit"
                    disabled={updateMutation.isPending}
                    className="bg-[#5469D4] hover:bg-[#4356C7]"
                  >
                    {updateMutation.isPending ? t('common.updating') : t('purchaseOrders.updateOrderBtn')}
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}