import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { AppLayout } from "@/components/layout/AppLayout";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Edit2, Trash2, Copy, Check, Save, X, Calendar } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useLanguage } from "@/contexts/LanguageContext";

interface InventoryEvent {
  uuid: string;
  inventory_uuid: string;
  material_uuid: string;
  event_type: string;
  quantity: number;
  notes?: string;
  cost_per_unit?: number;
  currency?: string;
  affect_original: boolean;
  created_at: string;
  is_deleted: boolean;
}

const makeInventoryEventUpdateSchema = (t: (key: string) => string) => z.object({
  quantity: z.string().min(1, t('inventoryEvents.quantityRequired')),
  notes: z.string().optional(),
  cost_per_unit: z.string().optional(),
  currency: z.string().optional(),
  affect_original: z.boolean(),
});

type InventoryEventUpdateData = z.infer<ReturnType<typeof makeInventoryEventUpdateSchema>>;

export default function InventoryEventDetail() {
  const { t, te } = useLanguage();
  const [, params] = useRoute("/inventory-events/:uuid");
  const [, setLocation] = useLocation();
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<InventoryEventUpdateData>({
    resolver: zodResolver(makeInventoryEventUpdateSchema(t)),
  });

  // Fetch inventory event data
  const { data: inventoryEvent, isLoading } = useQuery<InventoryEvent>({
    queryKey: ["/inventory-event/", params?.uuid],
    queryFn: async () => {
      return await apiRequest(`/inventory-event/${params?.uuid}`);
    },
    enabled: !!params?.uuid,
  });

  // Fetch currencies for editing
  const { data: currencies } = useQuery<string[]>({
    queryKey: ["/payment/currencies"],
    queryFn: async () => {
      return await apiRequest("/payment/currencies");
    },
    enabled: isEditing,
  });

  // Set form values when data loads or editing mode changes
  React.useEffect(() => {
    if (inventoryEvent && isEditing) {
      form.reset({
        quantity: String(inventoryEvent.quantity),
        notes: inventoryEvent.notes || "",
        cost_per_unit: inventoryEvent.cost_per_unit ? String(inventoryEvent.cost_per_unit) : "",
        currency: inventoryEvent.currency || "",
        affect_original: inventoryEvent.affect_original,
      });
    }
  }, [inventoryEvent, isEditing, form]);

  // Update inventory event mutation
  const updateInventoryEventMutation = useMutation({
    mutationFn: async (data: InventoryEventUpdateData) => {
      const payload = {
        quantity: parseFloat(data.quantity),
        notes: data.notes || null,
        cost_per_unit: data.cost_per_unit ? parseFloat(data.cost_per_unit) : null,
        currency: data.currency || null,
        affect_original: data.affect_original,
      };

      return await apiRequest(`/inventory-event/${params?.uuid}`, {
        method: "PUT",
        body: payload,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/inventory-event/", params?.uuid] });
      queryClient.invalidateQueries({ queryKey: ["/inventory-event/"] });
      queryClient.refetchQueries({ queryKey: ["/inventory-event/"] });
      
      toast({
        title: t('common.success'),
        description: t('common.updated'),
      });
      setIsEditing(false);
    },
    onError: (error: Error) => {
      toast({
        title: t('common.error'),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Delete inventory event mutation
  const deleteInventoryEventMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest(`/inventory-event/${params?.uuid}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/inventory-event/"] });
      queryClient.refetchQueries({ queryKey: ["/inventory-event/"] });
      queryClient.removeQueries({ queryKey: ["/inventory-event/", params?.uuid] });
      
      toast({
        title: t('common.success'),
        description: t('common.deleted'),
      });
      setLocation("/inventory-events");
    },
    onError: (error: Error) => {
      toast({
        title: t('common.error'),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const fieldLabels: Record<string, string> = {
    "UUID": t('inventoryEvents.uuid'),
    "Inventory UUID": t('inventoryEvents.inventoryUuid'),
    "Material UUID": t('inventoryEvents.materialUuid'),
    "Quantity": t('common.quantity'),
    "Cost per Unit": t('inventoryEvents.costPerUnit'),
    "Created At": t('common.createdAt'),
    "Notes": t('common.notes'),
  };

  const handleSave = (data: InventoryEventUpdateData) => {
    updateInventoryEventMutation.mutate(data);
  };

  const copyToClipboard = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
      toast({
        title: t('inventoryEvents.copied'),
        description: t('inventoryEvents.copiedToClipboard', { field: fieldLabels[field] ?? field }),
      });
    } catch (err) {
      toast({
        title: t('common.error'),
        description: t('inventoryEvents.copyFailed'),
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="space-y-6 p-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-96 w-full" />
        </div>
      </AppLayout>
    );
  }

  if (!inventoryEvent) {
    return (
      <AppLayout>
        <div className="space-y-6 p-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold">{t('inventoryEvents.notFoundTitle')}</h1>
            <Link href="/inventory-events">
              <Button className="mt-4">
                <ArrowLeft className="h-4 w-4 me-2" />
                {t('inventoryEvents.backToList')}
              </Button>
            </Link>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/inventory-events">
              <Button variant="outline" size="icon">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold">{t('inventoryEvents.detailsTitle')}</h1>
              <p className="text-muted-foreground">{te(inventoryEvent.event_type)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!isEditing ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => setIsEditing(true)}
                  disabled={inventoryEvent.event_type !== 'manual'}
                >
                  <Edit2 className="h-4 w-4 me-2" />
                  {t('common.edit')}
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive">
                      <Trash2 className="h-4 w-4 me-2" />
                      {t('common.delete')}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t('common.areYouSure')}</AlertDialogTitle>
                      <AlertDialogDescription>
                        {t('inventoryEvents.deleteConfirm')}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => deleteInventoryEventMutation.mutate()}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        {t('common.delete')}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsEditing(false);
                    // Reset form to original values
                    if (inventoryEvent) {
                      form.reset({
                        quantity: String(inventoryEvent.quantity),
                        notes: inventoryEvent.notes || "",
                        cost_per_unit: inventoryEvent.cost_per_unit ? String(inventoryEvent.cost_per_unit) : "",
                        currency: inventoryEvent.currency || "",
                        affect_original: inventoryEvent.affect_original,
                      });
                    }
                  }}
                >
                  <X className="h-4 w-4 me-2" />
                  {t('common.cancel')}
                </Button>
                <Button
                  onClick={form.handleSubmit(handleSave)}
                  disabled={updateInventoryEventMutation.isPending}
                  className="bg-[#5469D4] hover:bg-[#4356C7]"
                >
                  <Save className="h-4 w-4 me-2" />
                  {updateInventoryEventMutation.isPending ? t('common.saving') : t('common.save')}
                </Button>
              </>
            )}
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-[#5469D4] via-[#6B73E0] to-[#8B5CF6]">
                <Calendar className="h-4 w-4 text-white" />
              </div>
              {t('inventoryEvents.infoTitle')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!isEditing ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between group">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">{t('inventoryEvents.uuid')}</p>
                      <p className="text-sm">{inventoryEvent.uuid}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => copyToClipboard(inventoryEvent.uuid, "UUID")}
                    >
                      {copiedField === "UUID" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>

                  <div className="flex items-center justify-between group">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">{t('inventoryEvents.inventoryUuid')}</p>
                      <p className="text-sm">{inventoryEvent.inventory_uuid}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => copyToClipboard(inventoryEvent.inventory_uuid, "Inventory UUID")}
                    >
                      {copiedField === "Inventory UUID" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>

                  <div className="flex items-center justify-between group">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">{t('inventoryEvents.materialUuid')}</p>
                      <p className="text-sm">{inventoryEvent.material_uuid}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => copyToClipboard(inventoryEvent.material_uuid, "Material UUID")}
                    >
                      {copiedField === "Material UUID" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>

                  <div>
                    <p className="text-sm font-medium text-muted-foreground">{t('inventoryEvents.eventType')}</p>
                    <Badge variant="outline" className="mt-1">
                      {te(inventoryEvent.event_type)}
                    </Badge>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between group">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">{t('common.quantity')}</p>
                      <p className="text-sm">{inventoryEvent.quantity}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => copyToClipboard(String(inventoryEvent.quantity), "Quantity")}
                    >
                      {copiedField === "Quantity" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>

                  <div className="flex items-center justify-between group">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">{t('inventoryEvents.costPerUnit')}</p>
                      <p className="text-sm">{inventoryEvent.cost_per_unit ? `${inventoryEvent.cost_per_unit} ${inventoryEvent.currency || ''}` : t('inventoryEvents.notAvailable')}</p>
                    </div>
                    {inventoryEvent.cost_per_unit && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => copyToClipboard(`${inventoryEvent.cost_per_unit} ${inventoryEvent.currency || ''}`, "Cost per Unit")}
                      >
                        {copiedField === "Cost per Unit" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    )}
                  </div>

                  <div>
                    <p className="text-sm font-medium text-muted-foreground">{t('inventoryEvents.affectsOriginal')}</p>
                    <Badge variant={inventoryEvent.affect_original ? "default" : "secondary"} className="mt-1">
                      {inventoryEvent.affect_original ? t('common.yes') : t('common.no')}
                    </Badge>
                  </div>

                  <div className="flex items-center justify-between group">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">{t('common.createdAt')}</p>
                      <p className="text-sm">{new Date(inventoryEvent.created_at).toLocaleString()}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => copyToClipboard(new Date(inventoryEvent.created_at).toLocaleString(), "Created At")}
                    >
                      {copiedField === "Created At" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>

                {inventoryEvent.notes && (
                  <div className="md:col-span-2">
                    <div className="flex items-start justify-between group">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-muted-foreground">{t('common.notes')}</p>
                        <p className="text-sm mt-1">{inventoryEvent.notes}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => copyToClipboard(inventoryEvent.notes!, "Notes")}
                      >
                        {copiedField === "Notes" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <Form {...form}>
                <form onSubmit={form.handleSubmit(handleSave)} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField
                      control={form.control}
                      name="quantity"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('common.quantity')}</FormLabel>
                          <FormControl>
                            <Input type="number" step="0.01" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="cost_per_unit"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('inventoryEvents.costPerUnit')}</FormLabel>
                          <FormControl>
                            <Input type="number" step="0.01" {...field} />
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
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder={t('inventoryEvents.selectCurrency')} />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {currencies?.map((currency) => (
                                <SelectItem key={currency} value={currency}>
                                  {currency}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="affect_original"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                          <div className="space-y-0.5">
                            <FormLabel className="text-base">{t('inventoryEvents.affectOriginalQuantity')}</FormLabel>
                            <div className="text-sm text-muted-foreground">
                              {t('inventoryEvents.affectOriginalHint')}
                            </div>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
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
                            className="resize-none"
                            rows={3}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </form>
              </Form>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}