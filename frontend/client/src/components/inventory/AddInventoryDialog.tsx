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
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import { Plus, Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";

const makeInventorySchema = (t: (key: string) => string) =>
  z.object({
    material_uuid: z.string().min(1, t("inventory.materialRequired")),
    warehouse_uuid: z.string().min(1, t("inventory.warehouseRequired")),
    notes: z.string().optional(),
    lot_id: z.string().optional(),
    expiration_date: z.string().optional(),
    is_active: z.boolean(),
  });

type InventoryFormData = z.infer<ReturnType<typeof makeInventorySchema>>;

export function AddInventoryDialog() {
  const { t, te } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const [materialOpen, setMaterialOpen] = useState(false);
  const [warehouseOpen, setWarehouseOpen] = useState(false);
  const [materialSearch, setMaterialSearch] = useState("");
  const [warehouseSearch, setWarehouseSearch] = useState("");
  const [materialValue, setMaterialValue] = useState("");
  const [warehouseValue, setWarehouseValue] = useState("");
  const [useManualMaterialUuid, setUseManualMaterialUuid] = useState(false);
  const [useManualWarehouseUuid, setUseManualWarehouseUuid] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch materials
  const { data: materialsData } = useQuery({
    queryKey: ["/material/", materialSearch],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: "1",
        per_page: "10",
      });
      
      if (materialSearch) {
        params.append("name", materialSearch);
      }

      return await apiRequest(`/material/?${params.toString()}`);
    },
    enabled: isOpen,
  });

  // Fetch warehouses
  const { data: warehousesData } = useQuery({
    queryKey: ["/warehouse/", warehouseSearch],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: "1",
        per_page: "10",
      });
      
      if (warehouseSearch) {
        params.append("name", warehouseSearch);
      }

      return await apiRequest(`/warehouse/?${params.toString()}`);
    },
    enabled: isOpen,
  });

  const materials = materialsData?.materials || [];
  const warehouses = warehousesData?.warehouses || [];

  const form = useForm<InventoryFormData>({
    resolver: zodResolver(makeInventorySchema(t)),
    defaultValues: {
      material_uuid: "",
      warehouse_uuid: "",
      notes: "",
      lot_id: "",
      expiration_date: "",
      is_active: true,
    },
  });

  const createInventoryMutation = useMutation({
    mutationFn: async (data: InventoryFormData) => {
      const payload = {
        material_uuid: data.material_uuid,
        warehouse_uuid: data.warehouse_uuid,
        notes: data.notes || null,
        lot_id: data.lot_id || null,
        expiration_date: data.expiration_date || null,
        is_active: data.is_active,
      };

      return await apiRequest("/inventory/", { method: "POST", body: payload });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/inventory/"] });
      queryClient.refetchQueries({ queryKey: ["/inventory/"] });
      
      toast({
        title: t('common.success'),
        description: t('inventory.createSuccess'),
      });

      form.reset();
      setMaterialValue("");
      setWarehouseValue("");
      setMaterialSearch("");
      setWarehouseSearch("");
      setUseManualMaterialUuid(false);
      setUseManualWarehouseUuid(false);
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

  const onSubmit = (data: InventoryFormData) => {
    createInventoryMutation.mutate(data);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button className="bg-[#5469D4] hover:bg-[#5469D4]/90">
          <Plus className="h-4 w-4 me-2" />
          {t('inventory.addInventory')}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('inventory.addNewItem')}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="material_uuid"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('inventory.material')}</FormLabel>
                  <div className="flex gap-2 mb-2">
                    <Button
                      type="button"
                      variant={!useManualMaterialUuid ? "default" : "outline"}
                      size="sm"
                      onClick={() => {
                        setUseManualMaterialUuid(false);
                        setMaterialOpen(false);
                        setMaterialValue("");
                        field.onChange("");
                      }}
                    >
                      {t('inventory.selectMaterial')}
                    </Button>
                    <Button
                      type="button"
                      variant={useManualMaterialUuid ? "default" : "outline"}
                      size="sm"
                      onClick={() => {
                        setUseManualMaterialUuid(true);
                        setMaterialOpen(false);
                        setMaterialValue("");
                        field.onChange("");
                      }}
                    >
                      {t('inventory.enterUuidManually')}
                    </Button>
                  </div>
                  <FormControl>
                    {useManualMaterialUuid ? (
                      <Input
                        placeholder={t('inventory.materialUuidPlaceholder')}
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
                            ? materials?.find((material) => material.uuid === materialValue)?.name || t('inventory.materialNotFound')
                            : t('inventory.selectMaterialPlaceholder')}
                          <ChevronsUpDown className="ms-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                        
                        {materialOpen && (
                          <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg">
                            <div className="p-2">
                              <Input
                                placeholder={t('inventory.searchMaterials')}
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
                                <div className="px-3 py-2 text-gray-500">{t('inventory.noMaterialsFound')}</div>
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
              name="warehouse_uuid"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('inventory.warehouse')}</FormLabel>
                  <div className="flex gap-2 mb-2">
                    <Button
                      type="button"
                      variant={!useManualWarehouseUuid ? "default" : "outline"}
                      size="sm"
                      onClick={() => {
                        setUseManualWarehouseUuid(false);
                        setWarehouseOpen(false);
                        setWarehouseValue("");
                        field.onChange("");
                      }}
                    >
                      {t('inventory.selectWarehouse')}
                    </Button>
                    <Button
                      type="button"
                      variant={useManualWarehouseUuid ? "default" : "outline"}
                      size="sm"
                      onClick={() => {
                        setUseManualWarehouseUuid(true);
                        setWarehouseOpen(false);
                        setWarehouseValue("");
                        field.onChange("");
                      }}
                    >
                      {t('inventory.enterUuidManually')}
                    </Button>
                  </div>
                  <FormControl>
                    {useManualWarehouseUuid ? (
                      <Input
                        placeholder={t('inventory.warehouseUuidPlaceholder')}
                        value={field.value}
                        onChange={(e) => {
                          field.onChange(e.target.value);
                          setWarehouseValue(e.target.value);
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
                            setWarehouseOpen(!warehouseOpen);
                          }}
                        >
                          {warehouseValue
                            ? warehouses?.find((warehouse) => warehouse.uuid === warehouseValue)?.name || t('inventory.warehouseNotFound')
                            : t('inventory.selectWarehousePlaceholder')}
                          <ChevronsUpDown className="ms-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                        
                        {warehouseOpen && (
                          <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg">
                            <div className="p-2">
                              <Input
                                placeholder={t('inventory.searchWarehouses')}
                                value={warehouseSearch}
                                onChange={(e) => setWarehouseSearch(e.target.value)}
                                className="mb-2"
                              />
                            </div>
                            <div className="max-h-48 overflow-y-auto">
                              {warehouses?.length > 0 ? (
                                warehouses.map((warehouse) => (
                                  <div
                                    key={warehouse.uuid}
                                    className="px-3 py-2 hover:bg-gray-100 cursor-pointer flex items-center"
                                    onClick={() => {
                                      setWarehouseValue(warehouse.uuid);
                                      field.onChange(warehouse.uuid);
                                      setWarehouseOpen(false);
                                    }}
                                  >
                                    <Check
                                      className={cn(
                                        "me-2 h-4 w-4",
                                        warehouseValue === warehouse.uuid ? "opacity-100" : "opacity-0"
                                      )}
                                    />
                                    {warehouse.name}
                                  </div>
                                ))
                              ) : (
                                <div className="px-3 py-2 text-gray-500">{t('inventory.noWarehousesFound')}</div>
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
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('inventory.notesOptional')}</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder={t('inventory.enterNotes')}
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
                name="lot_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('inventory.lotIdOptional')}</FormLabel>
                    <FormControl>
                      <Input placeholder={t('inventory.enterLotId')} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="expiration_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('inventory.expirationDateOptional')}</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="is_active"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('common.status')}</FormLabel>
                  <Select onValueChange={(value) => field.onChange(value === "true")} defaultValue="true">
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={t('inventory.selectStatus')} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="true">{te('active')}</SelectItem>
                      <SelectItem value="false">{te('inactive')}</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end space-x-2 rtl:space-x-reverse pt-4">
              <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={createInventoryMutation.isPending} className="bg-[#5469D4] hover:bg-[#5469D4]/90">
                {createInventoryMutation.isPending ? t('common.creating') : t('inventory.createInventory')}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}