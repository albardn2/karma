import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Plus } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useLanguage } from "@/contexts/LanguageContext";

const makeInventoryEventSchema = (t: (key: string) => string) => z.object({
  inventory_uuid: z.string().min(1, t('inventoryEvents.inventoryUuidRequired')),
  event_type: z.string().min(1, t('inventoryEvents.eventTypeRequired')),
  quantity: z.string().min(1, t('inventoryEvents.quantityRequired')),
  notes: z.string().optional(),
  cost_per_unit: z.string().optional(),
  currency: z.string().optional(),
  affect_original: z.boolean(),
});

type InventoryEventFormData = z.infer<ReturnType<typeof makeInventoryEventSchema>>;

export function AddInventoryEventDialog() {
  const { t, te } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch event types
  const { data: eventTypes } = useQuery<string[]>({
    queryKey: ["/inventory-event/event_types"],
    queryFn: async () => {
      return await apiRequest("/inventory-event/event_types");
    },
    enabled: isOpen,
  });

  // Fetch currencies
  const { data: currencies } = useQuery<string[]>({
    queryKey: ["/payment/currencies"],
    queryFn: async () => {
      return await apiRequest("/payment/currencies");
    },
    enabled: isOpen,
  });

  const form = useForm<InventoryEventFormData>({
    resolver: zodResolver(makeInventoryEventSchema(t)),
    defaultValues: {
      inventory_uuid: "",
      event_type: "",
      quantity: "",
      notes: "",
      cost_per_unit: "",
      currency: "",
      affect_original: false,
    },
  });

  const createInventoryEventMutation = useMutation({
    mutationFn: async (data: InventoryEventFormData) => {
      const payload = {
        inventory_uuid: data.inventory_uuid,
        event_type: data.event_type,
        quantity: parseFloat(data.quantity),
        notes: data.notes || null,
        cost_per_unit: data.cost_per_unit ? parseFloat(data.cost_per_unit) : null,
        currency: data.currency || null,
        affect_original: data.affect_original,
      };

      return await apiRequest("/inventory-event/", { method: "POST", body: payload });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/inventory-event/"] });
      queryClient.refetchQueries({ queryKey: ["/inventory-event/"] });
      
      toast({
        title: t('common.success'),
        description: t('common.created'),
      });

      form.reset();
      setIsOpen(false);
    },
    onError: (error: Error) => {
      toast({
        title: t('common.error'),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: InventoryEventFormData) => {
    createInventoryEventMutation.mutate(data);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button className="bg-[#5469D4] hover:bg-[#4356C7] text-white">
          <Plus className="h-4 w-4 me-2" />
          {t('inventoryEvents.addEvent')}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('inventoryEvents.addNewEvent')}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="inventory_uuid"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('inventoryEvents.inventoryUuid')}</FormLabel>
                  <FormControl>
                    <Input placeholder={t('inventoryEvents.inventoryUuidPlaceholder')} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="event_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('inventoryEvents.eventType')}</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={t('inventoryEvents.selectEventType')} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {eventTypes?.map((type) => (
                        <SelectItem key={type} value={type}>
                          {te(type)}
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
              name="quantity"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('common.quantity')}</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" placeholder={t('inventoryEvents.quantityPlaceholder')} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="cost_per_unit"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('inventoryEvents.costPerUnitOptional')}</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" placeholder={t('inventoryEvents.costPlaceholder')} {...field} />
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
                    <FormLabel>{t('inventoryEvents.currencyOptional')}</FormLabel>
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
            </div>

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

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('inventoryEvents.notesOptional')}</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder={t('inventoryEvents.notesPlaceholder')}
                      className="resize-none"
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsOpen(false)}
              >
                {t('common.cancel')}
              </Button>
              <Button
                type="submit"
                disabled={createInventoryEventMutation.isPending}
                className="bg-[#5469D4] hover:bg-[#4356C7]"
              >
                {createInventoryEventMutation.isPending ? t('common.creating') : t('inventoryEvents.createEvent')}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}