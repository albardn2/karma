import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, ChevronsUpDown, Check } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";

interface PricingFormData {
  material_uuid: string;
  price_per_unit: string;
  currency: string;
}

interface Material {
  uuid: string;
  name: string;
  sku?: string;
}

export function AddPricingDialog() {
  const { t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const [materialOpen, setMaterialOpen] = useState(false);
  const [materialValue, setMaterialValue] = useState("");
  const [materialSearch, setMaterialSearch] = useState("");
  const [useManualUuid, setUseManualUuid] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch materials with search
  const { data: materialsData } = useQuery<{ materials: Material[] }>({
    queryKey: ["/material/", materialSearch],
    queryFn: async () => {
      const params = new URLSearchParams({
        per_page: "10",
        ...(materialSearch && { name: materialSearch })
      });
      
      return await apiRequest(`/material/?${params.toString()}`);
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

  const materials = materialsData?.materials || [];

  const pricingSchema = z.object({
    material_uuid: z.string().min(1, t('pricing.materialRequired')),
    price_per_unit: z.string().min(1, t('pricing.priceRequired')),
    currency: z.string().min(1, t('pricing.currencyRequired')),
  });

  const form = useForm<PricingFormData>({
    resolver: zodResolver(pricingSchema),
    defaultValues: {
      material_uuid: "",
      price_per_unit: "",
      currency: "",
    },
  });

  const createPricingMutation = useMutation({
    mutationFn: async (data: PricingFormData) => {
      const payload = {
        material_uuid: data.material_uuid,
        price_per_unit: parseFloat(data.price_per_unit),
        currency: data.currency,
      };

      return await apiRequest("/pricing/", { method: "POST", body: payload });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/pricing/"] });
      queryClient.refetchQueries({ queryKey: ["/pricing/"] });
      
      toast({
        title: t('common.success'),
        description: t('pricing.createdSuccess'),
      });

      form.reset();
      setMaterialValue("");
      setMaterialSearch("");
      setUseManualUuid(false);
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

  const onSubmit = (data: PricingFormData) => {
    createPricingMutation.mutate(data);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button className="bg-[#5469D4] hover:bg-[#4356C7] text-white">
          <Plus className="h-4 w-4 me-2" />
          {t('pricing.addPricing')}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('pricing.addNewPricing')}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="material_uuid"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('pricing.material')}</FormLabel>
                  <div className="flex gap-2 mb-2">
                    <Button
                      type="button"
                      variant={!useManualUuid ? "default" : "outline"}
                      size="sm"
                      onClick={() => {
                        setUseManualUuid(false);
                        setMaterialValue("");
                        field.onChange("");
                      }}
                    >
                      {t('pricing.selectFromList')}
                    </Button>
                    <Button
                      type="button"
                      variant={useManualUuid ? "default" : "outline"}
                      size="sm"
                      onClick={() => {
                        setUseManualUuid(true);
                        setMaterialOpen(false);
                        setMaterialValue("");
                        field.onChange("");
                      }}
                    >
                      {t('pricing.enterUuidManually')}
                    </Button>
                  </div>
                  <FormControl>
                    {useManualUuid ? (
                      <Input
                        placeholder={t('pricing.enterMaterialUuid')}
                        value={field.value}
                        onChange={(e) => {
                          field.onChange(e.target.value);
                          setMaterialValue(e.target.value);
                        }}
                      />
                    ) : (
                      <div className="relative">
                        <Button
                          variant="outline"
                          type="button"
                          className="w-full justify-between"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setMaterialOpen(!materialOpen);
                          }}
                        >
                          {materialValue
                            ? materials?.find((material) => material.uuid === materialValue)?.name || t('pricing.materialNotFound')
                            : t('pricing.selectMaterial')}
                          <ChevronsUpDown className="ms-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                        
                        {materialOpen && (
                          <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg">
                            <div className="p-2">
                              <Input
                                placeholder={t('pricing.searchMaterials')}
                                value={materialSearch}
                                onChange={(e) => setMaterialSearch(e.target.value)}
                                className="mb-2"
                              />
                            </div>
                            <div className="max-h-48 overflow-y-auto">
                              {materials?.length > 0 ? (
                                materials.map((material) => (
                                  <div
                                    key={material.uuid}
                                    className="px-3 py-2 hover:bg-gray-100 cursor-pointer flex items-center"
                                    onClick={() => {
                                      setMaterialValue(material.uuid);
                                      field.onChange(material.uuid);
                                      setMaterialOpen(false);
                                    }}
                                  >
                                    <Check
                                      className={cn(
                                        "me-2 h-4 w-4",
                                        materialValue === material.uuid ? "opacity-100" : "opacity-0"
                                      )}
                                    />
                                    {material.name} {material.sku ? `(${material.sku})` : ''}
                                  </div>
                                ))
                              ) : (
                                <div className="px-3 py-2 text-gray-500">{t('pricing.noMaterialsFound')}</div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
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
                  <FormLabel>{t('pricing.pricePerUnit')}</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder={t('pricing.enterPrice')}
                      {...field}
                    />
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
                  <FormControl>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger>
                        <SelectValue placeholder={t('pricing.selectCurrencyPlaceholder')} />
                      </SelectTrigger>
                      <SelectContent>
                        {currencies?.map((currency) => (
                          <SelectItem key={currency} value={currency}>
                            {currency}
                          </SelectItem>
                        )) || []}
                      </SelectContent>
                    </Select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex gap-2 pt-4">
              <Button
                type="submit"
                disabled={createPricingMutation.isPending}
                className="flex-1 bg-[#5469D4] hover:bg-[#4356C7] text-white"
              >
                {createPricingMutation.isPending ? t('common.creating') : t('pricing.createPricing')}
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