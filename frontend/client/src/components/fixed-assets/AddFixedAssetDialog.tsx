import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";

const buildFixedAssetSchema = (t: (key: string) => string) =>
  z.object({
    name: z.string().min(1, t('fixedAssets.nameRequired')),
    description: z.string().optional(),
    purchase_date: z.string().optional(),
    annual_depreciation_rate: z.string().min(1, t('fixedAssets.rateRequired')),
    purchase_order_item_uuid: z.string().optional(),
    material_uuid: z.string().optional(),
    quantity: z.string().optional(),
    price_per_unit: z.string().optional(),
  });

type FixedAssetFormData = z.infer<ReturnType<typeof buildFixedAssetSchema>>;

export function AddFixedAssetDialog() {
  const { t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<FixedAssetFormData>({
    resolver: zodResolver(buildFixedAssetSchema(t)),
    defaultValues: {
      name: "",
      description: "",
      purchase_date: "",
      annual_depreciation_rate: "",
      purchase_order_item_uuid: "",
      material_uuid: "",
      quantity: "",
      price_per_unit: "",
    },
  });

  const createFixedAssetMutation = useMutation({
    mutationFn: async (data: FixedAssetFormData) => {
      const payload = {
        name: data.name,
        description: data.description || null,
        purchase_date: data.purchase_date || null,
        annual_depreciation_rate: parseFloat(data.annual_depreciation_rate),
        purchase_order_item_uuid: data.purchase_order_item_uuid || null,
        material_uuid: data.material_uuid || null,
        quantity: data.quantity ? parseFloat(data.quantity) : null,
        price_per_unit: data.price_per_unit ? parseFloat(data.price_per_unit) : null,
      };

      return await apiRequest("/fixed-asset/", { method: "POST", body: payload });
    },
    onSuccess: () => {
      // Invalidate and refetch fixed assets list
      queryClient.invalidateQueries({ queryKey: ["/fixed-asset/"] });
      queryClient.refetchQueries({ queryKey: ["/fixed-asset/"] });
      
      toast({
        title: t('common.success'),
        description: t('fixedAssets.createSuccess'),
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

  const onSubmit = (data: FixedAssetFormData) => {
    createFixedAssetMutation.mutate(data);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button className="bg-[#5469D4] hover:bg-[#4356C7] text-white">
          <Plus className="h-4 w-4 me-2" />
          {t('fixedAssets.addFixedAsset')}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('fixedAssets.addNewFixedAsset')}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('common.name')}</FormLabel>
                  <FormControl>
                    <Input placeholder={t('fixedAssets.enterAssetName')} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('fixedAssets.descriptionOptional')}</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder={t('fixedAssets.enterDescription')}
                      className="resize-none"
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="purchase_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('fixedAssets.purchaseDateOptional')}</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="annual_depreciation_rate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('fixedAssets.depreciationRatePercent')}</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder={t('fixedAssets.enterRate')}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="quantity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('fixedAssets.quantityOptional')}</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder={t('fixedAssets.enterQuantity')}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="price_per_unit"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('fixedAssets.pricePerUnitOptional')}</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder={t('fixedAssets.enterPrice')}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="purchase_order_item_uuid"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('fixedAssets.purchaseOrderItemUuidOptional')}</FormLabel>
                  <FormControl>
                    <Input placeholder={t('fixedAssets.enterPurchaseOrderItemUuid')} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
                )}
            />

            <FormField
              control={form.control}
              name="material_uuid"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('fixedAssets.materialUuidOptional')}</FormLabel>
                  <FormControl>
                    <Input placeholder={t('fixedAssets.enterMaterialUuid')} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex gap-2 pt-4">
              <Button
                type="submit"
                disabled={createFixedAssetMutation.isPending}
                className="flex-1 bg-[#5469D4] hover:bg-[#4356C7] text-white"
              >
                {createFixedAssetMutation.isPending ? t('common.creating') : t('fixedAssets.createFixedAsset')}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsOpen(false)}
              >
                {t('common.cancel')}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}