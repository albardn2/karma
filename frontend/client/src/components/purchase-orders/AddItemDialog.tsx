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
    enabled: open,
  });

  const materials = materialsData?.materials || [];

  const form = useForm<ItemForm>({
    resolver: zodResolver(ItemSchema),
    defaultValues: {
      material_uuid: "",
      quantity: 1,
      price_per_unit: 0,
      unit: "",
    },
  });

  // Fetch material details to get unit
  const fetchMaterialUnit = async (materialUuid: string) => {
    if (!materialUuid) return;
    
    try {
      const materialData = await apiRequest(`/material/${materialUuid}`);
      const unit = materialData.measure_unit || "";
      setMaterialUnit(unit);
      form.setValue("unit", unit);
      // Force form re-render
      form.trigger("unit");
    } catch (error) {
      console.error("Failed to fetch material unit:", error);
      setMaterialUnit("");
      form.setValue("unit", "");
    }
  };

  const onSubmit = (data: ItemForm) => {
    const itemToAdd = {
      ...data,
      material_name: materialName || materials.find(m => m.uuid === data.material_uuid)?.name,
      unit: materialUnit || data.unit,
    };
    onAddItem(itemToAdd);
    
    // Reset form
    form.reset();
    setMaterialValue("");
    setMaterialName("");
    setMaterialUnit("");
    setMaterialSearch("");
    setUseManualMaterialUuid(false);
    setMaterialOpen(false);
  };

  const handleClose = () => {
    form.reset();
    setMaterialValue("");
    setMaterialName("");
    setMaterialUnit("");
    setMaterialSearch("");
    setUseManualMaterialUuid(false);
    setMaterialOpen(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Purchase Order Item</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="material_uuid"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Material</FormLabel>
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
                      Select Material
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
                      Enter UUID manually
                    </Button>
                  </div>
                  <FormControl>
                    {useManualMaterialUuid ? (
                      <Input
                        placeholder="Enter material UUID..."
                        value={field.value}
                        onChange={(e) => {
                          const value = e.target.value;
                          field.onChange(value);
                          setMaterialValue(value);
                          if (value && value.length > 0) {
                            fetchMaterialUnit(value);
                          }
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
                            ? materials?.find((material: any) => material.uuid === materialValue)?.name || "Material not found"
                            : "Select material..."}
                          <ChevronsUpDown className="ms-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                        
                        {materialOpen && (
                          <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg">
                            <div className="p-2">
                              <Input
                                placeholder="Search materials..."
                                value={materialSearch}
                                onChange={(e) => setMaterialSearch(e.target.value)}
                                className="mb-2"
                              />
                            </div>
                            <div className="max-h-48 overflow-y-auto">
                              {materials && materials.length > 0 ? (
                                materials.filter((material: any) => 
                                  !materialSearch || 
                                  material.name.toLowerCase().includes(materialSearch.toLowerCase())
                                ).map((material: any) => (
                                  <div
                                    key={material.uuid}
                                    className="px-3 py-2 hover:bg-gray-100 cursor-pointer flex items-center"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      setMaterialValue(material.uuid);
                                      setMaterialName(material.name);
                                      field.onChange(material.uuid);
                                      setMaterialOpen(false);
                                      fetchMaterialUnit(material.uuid);
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
                                <div className="px-3 py-2 text-gray-500">
                                  {materials === undefined ? "Loading..." : "No materials found."}
                                </div>
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
              name="unit"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Unit</FormLabel>
                  <FormControl>
                    <Input 
                      {...field} 
                      value={materialUnit || ""}
                      readOnly
                      placeholder="Unit will be fetched from material"
                      className="bg-gray-50"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="quantity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Quantity
                      {materialUnit && (
                        <span className="text-sm text-gray-500 ms-1">({materialUnit})</span>
                      )}
                    </FormLabel>
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
                name="price_per_unit"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Price per Unit
                      {materialUnit && (
                        <span className="text-sm text-gray-500 ms-1">(per {materialUnit})</span>
                      )}
                    </FormLabel>
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



            <div className="flex justify-end space-x-2 rtl:space-x-reverse pt-4">
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