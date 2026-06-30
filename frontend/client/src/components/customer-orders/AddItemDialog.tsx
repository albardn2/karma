import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ChevronsUpDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";

const ItemSchema = z.object({
  material_uuid: z.string().min(1, "Material is required"),
  quantity: z.number().min(1, "Quantity must be at least 1"),
  price_per_unit: z.number().min(0, "Price must be non-negative"),
  unit: z.string().optional(),
});

type ItemForm = z.infer<typeof ItemSchema> & { material_name?: string };

interface AddItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddItem: (item: ItemForm) => void;
}

export function AddItemDialog({ open, onOpenChange, onAddItem }: AddItemDialogProps) {
  const [materialOpen, setMaterialOpen] = useState(false);
  const [materialSearch, setMaterialSearch] = useState("");
  const [materialValue, setMaterialValue] = useState("");
  const [materialName, setMaterialName] = useState("");
  const [materialUnit, setMaterialUnit] = useState("");
  const [useManualMaterialUuid, setUseManualMaterialUuid] = useState(false);

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
  });

  // Fetch individual material details when material is selected
  const { data: materialDetailsData } = useQuery({
    queryKey: ["/material/detail", materialValue],
    queryFn: async () => {
      if (!materialValue) return null;
      return await apiRequest(`/material/${materialValue}`);
    },
    enabled: !!materialValue && !useManualMaterialUuid,
  });

  const form = useForm<ItemForm>({
    resolver: zodResolver(ItemSchema),
    defaultValues: {
      material_uuid: "",
      quantity: 1,
      price_per_unit: 0,
      unit: "",
    },
  });

  const materials = materialsData?.materials || [];

  React.useEffect(() => {
    if (materialDetailsData) {
      setMaterialUnit(materialDetailsData.measure_unit || "");
      form.setValue("unit", materialDetailsData.measure_unit || "");
    }
  }, [materialDetailsData, form]);

  const onSubmit = (data: ItemForm) => {
    const itemData = {
      ...data,
      material_name: materialName,
      unit: materialUnit,
    };
    onAddItem(itemData);
    form.reset();
    setMaterialValue("");
    setMaterialName("");
    setMaterialUnit("");
    setMaterialSearch("");
    onOpenChange(false);
  };

  const handleClose = () => {
    form.reset();
    setMaterialValue("");
    setMaterialName("");
    setMaterialUnit("");
    setMaterialSearch("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px] z-[9999]">
        <DialogHeader>
          <DialogTitle>Add Item</DialogTitle>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Material Selection */}
            <div className="space-y-4">
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={!useManualMaterialUuid ? "default" : "outline"}
                  size="sm"
                  className={!useManualMaterialUuid ? "bg-[#5469D4] hover:bg-[#4356C7]" : ""}
                  onClick={() => {
                    setUseManualMaterialUuid(false);
                    setMaterialSearch("");
                    setMaterialValue("");
                    form.setValue("material_uuid", "");
                  }}
                >
                  Select
                </Button>
                <Button
                  type="button"
                  variant={useManualMaterialUuid ? "default" : "outline"}
                  size="sm"
                  className={useManualMaterialUuid ? "bg-[#5469D4] hover:bg-[#4356C7]" : ""}
                  onClick={() => {
                    setUseManualMaterialUuid(true);
                    setMaterialSearch("");
                    setMaterialValue("");
                    form.setValue("material_uuid", "");
                  }}
                >
                  Enter UUID manually
                </Button>
              </div>

              {useManualMaterialUuid ? (
                <FormField
                  control={form.control}
                  name="material_uuid"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Material UUID</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter material UUID..." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : (
                <div className="space-y-2">
                  <FormLabel>Material</FormLabel>
                  <div className="relative">
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full justify-between"
                      onClick={() => setMaterialOpen(!materialOpen)}
                    >
                      {materialValue
                        ? materials?.find((material: any) => material.uuid === materialValue)?.name || "Material not found"
                        : "Select material..."}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                    
                    {materialOpen && (
                      <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg">
                        <div className="p-3">
                          <Input
                            placeholder="Search materials..."
                            value={materialSearch}
                            onChange={(e) => setMaterialSearch(e.target.value)}
                            className="mb-2"
                          />
                        </div>
                        <div className="max-h-48 overflow-y-auto">
                          {materials && materials.length > 0 ? (
                            materials.map((material: any) => (
                              <div
                                key={material.uuid}
                                className="px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer flex items-center"
                                onClick={() => {
                                  setMaterialValue(material.uuid);
                                  setMaterialName(material.name);
                                  form.setValue("material_uuid", material.uuid);
                                  setMaterialOpen(false);
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    materialValue === material.uuid ? "opacity-100" : "opacity-0"
                                  )}
                                />
                                {material.name}
                              </div>
                            ))
                          ) : (
                            <div className="px-3 py-2 text-gray-500 dark:text-gray-400">
                              {materials === undefined ? "Loading..." : "No materials found."}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  {form.formState.errors.material_uuid && (
                    <p className="text-sm text-red-600 dark:text-red-400">{form.formState.errors.material_uuid.message}</p>
                  )}
                </div>
              )}
            </div>

            {/* Quantity */}
            <FormField
              control={form.control}
              name="quantity"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Quantity {materialUnit && `(${materialUnit})`}</FormLabel>
                  <FormControl>
                    <Input 
                      type="number" 
                      placeholder="Enter quantity..." 
                      {...field}
                      onChange={(e) => field.onChange(Number(e.target.value))}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Price per Unit */}
            <FormField
              control={form.control}
              name="price_per_unit"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Price per Unit {materialUnit && `(per ${materialUnit})`}</FormLabel>
                  <FormControl>
                    <Input 
                      type="number" 
                      step="0.01"
                      placeholder="Enter price per unit..." 
                      {...field}
                      onChange={(e) => field.onChange(Number(e.target.value))}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Unit (Read-only) */}
            {materialUnit && (
              <div className="space-y-2">
                <FormLabel>Unit</FormLabel>
                <Input 
                  value={materialUnit}
                  readOnly
                  className="bg-gray-50 dark:bg-gray-700"
                />
              </div>
            )}

            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button type="submit" className="bg-[#5469D4] hover:bg-[#4356C7]">
                Add Item
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}