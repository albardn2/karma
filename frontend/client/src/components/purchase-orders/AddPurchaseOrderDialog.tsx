import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CalendarIcon, Plus, Trash2, ChevronsUpDown, Check } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";


const PurchaseOrderItemSchema = z.object({
  material_uuid: z.string().min(1, "Material is required"),
  quantity: z.number().min(1, "Quantity must be at least 1"),
  price_per_unit: z.number().min(0, "Price must be positive"),
  currency: z.string().optional(),
  unit: z.string().optional(),
  quantity_received: z.number().min(0, "Quantity received must be positive").default(0),
});

const CreatePurchaseOrderSchema = z.object({
  vendor_uuid: z.string().min(1, "Vendor is required"),
  currency: z.string().min(1, "Currency is required"),
  notes: z.string().optional(),
  payout_due_date: z.date().optional(),
  purchase_order_items: z.array(PurchaseOrderItemSchema).min(1, "At least one item is required"),
});

type CreatePurchaseOrderForm = z.infer<typeof CreatePurchaseOrderSchema>;

export function AddPurchaseOrderDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const [vendorOpen, setVendorOpen] = useState(false);
  const [vendorSearch, setVendorSearch] = useState("");
  const [vendorValue, setVendorValue] = useState("");
  const [useManualVendorUuid, setUseManualVendorUuid] = useState(false);
  const [materialStates, setMaterialStates] = useState<{
    [key: number]: {
      materialOpen: boolean;
      materialSearch: string;
      materialValue: string;
      useManualMaterialUuid: boolean;
      materialUnit: string;
    };
  }>({});
  const queryClient = useQueryClient();
  const { toast } = useToast();

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
    enabled: isOpen,
  });

  // Helper functions for material state management
  const getMaterialState = (index: number) => {
    return materialStates[index] || {
      materialOpen: false,
      materialSearch: "",
      materialValue: "",
      useManualMaterialUuid: false,
      materialUnit: "",
    };
  };

  const updateMaterialState = (index: number, updates: Partial<typeof materialStates[0]>) => {
    setMaterialStates(prev => ({
      ...prev,
      [index]: {
        ...getMaterialState(index),
        ...updates,
      },
    }));
  };

  // Fetch material details to get unit
  const fetchMaterialUnit = async (materialUuid: string, index: number) => {
    if (!materialUuid) return;
    
    try {
      const materialData = await apiRequest(`/material/${materialUuid}`);
      updateMaterialState(index, { materialUnit: materialData.unit || "" });
    } catch (error) {
      console.error("Failed to fetch material unit:", error);
    }
  };

  // Fetch materials - using search from all items
  const allMaterialSearches = Object.values(materialStates).map(state => state.materialSearch).filter(Boolean);
  const uniqueSearches = [...new Set(allMaterialSearches)];
  
  const { data: materialsData } = useQuery({
    queryKey: ["/material/", uniqueSearches.join(",")],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: "1",
        per_page: "50", // Increased to handle multiple searches
      });

      return await apiRequest(`/material/?${params.toString()}`);
    },
    enabled: isOpen,
  });

  // Fetch currencies
  const { data: currenciesData } = useQuery({
    queryKey: ["/payment/currencies"],
    queryFn: async () => {
      return await apiRequest("/payment/currencies");
    },
    enabled: isOpen,
  });

  const form = useForm<CreatePurchaseOrderForm>({
    resolver: zodResolver(CreatePurchaseOrderSchema),
    defaultValues: {
      vendor_uuid: "",
      currency: "",
      notes: "",
      purchase_order_items: [
        {
          material_uuid: "",
          quantity: 1,
          price_per_unit: 0,
          currency: "",
          unit: "",
          quantity_received: 0,
        }
      ],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "purchase_order_items",
  });

  const createMutation = useMutation({
    mutationFn: async (data: CreatePurchaseOrderForm) => {
      const payload = {
        ...data,
        payout_due_date: data.payout_due_date?.toISOString() || null,
        notes: data.notes || null,
      };
      return await apiRequest("/purchase-order/with-items", { method: "POST", body: payload });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/purchase-order"] });
      queryClient.refetchQueries({ queryKey: ["/purchase-order"] });
      toast({
        title: "Success",
        description: "Purchase order created successfully",
      });
      // Reset form and close dialog
      form.reset();
      setVendorOpen(false);
      setVendorSearch("");
      setVendorValue("");
      setUseManualVendorUuid(false);
      setMaterialStates({});
      setIsOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create purchase order",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: CreatePurchaseOrderForm) => {
    createMutation.mutate(data);
  };

  const vendors = vendorsData?.vendors || [];
  const materials = materialsData?.materials || [];
  const currencies = Array.isArray(currenciesData) ? currenciesData : [];



  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button className="bg-[#5469D4] hover:bg-[#4356C7]">
          <Plus className="h-4 w-4 me-2" />
          Add Purchase Order
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Purchase Order</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="vendor_uuid"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Vendor</FormLabel>
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
                        Select Vendor
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
                        Enter UUID manually
                      </Button>
                    </div>
                    <FormControl>
                      {useManualVendorUuid ? (
                        <Input
                          placeholder="Enter vendor UUID..."
                          value={field.value}
                          onChange={(e) => {
                            field.onChange(e.target.value);
                            setVendorValue(e.target.value);
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
                              setVendorOpen(!vendorOpen);
                            }}
                          >
                            {vendorValue
                              ? vendors?.find((vendor: any) => vendor.uuid === vendorValue)?.company_name || "Vendor not found"
                              : "Select vendor..."}
                            <ChevronsUpDown className="ms-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                          
                          {vendorOpen && (
                            <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg">
                              <div className="p-2">
                                <Input
                                  placeholder="Search vendors..."
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
                                      className="px-3 py-2 hover:bg-gray-100 cursor-pointer flex items-center"
                                      onClick={() => {

                                        setVendorValue(vendor.uuid);
                                        field.onChange(vendor.uuid);
                                        setVendorOpen(false);
                                      }}
                                    >
                                      <Check
                                        className={cn(
                                          "me-2 h-4 w-4",
                                          vendorValue === vendor.uuid ? "opacity-100" : "opacity-0"
                                        )}
                                      />
                                      {vendor.company_name}
                                    </div>
                                  ))
                                ) : (
                                  <div className="px-3 py-2 text-gray-500">
                                    {vendors === undefined ? "Loading..." : "No vendors found."}
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
                name="currency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Currency</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select currency" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {currencies.map((currency: string) => (
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
                name="payout_due_date"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Due Date</FormLabel>
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
                              <span>Pick a date</span>
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
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Enter any additional notes..."
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
                <CardTitle>Purchase Order Items</CardTitle>
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
                  Add Item
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                {fields.map((field, index) => (
                  <div key={field.id} className="p-4 border rounded-lg space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium">Item {index + 1}</h4>
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
                        render={({ field }) => {
                          const itemState = getMaterialState(index);
                          
                          return (
                            <FormItem>
                              <FormLabel>Material</FormLabel>
                              <div className="flex gap-2 mb-2">
                                <Button
                                  type="button"
                                  variant={!itemState.useManualMaterialUuid ? "default" : "outline"}
                                  size="sm"
                                  onClick={() => {
                                    updateMaterialState(index, {
                                      useManualMaterialUuid: false,
                                      materialOpen: false,
                                      materialValue: "",
                                    });
                                    field.onChange("");
                                  }}
                                >
                                  Select Material
                                </Button>
                                <Button
                                  type="button"
                                  variant={itemState.useManualMaterialUuid ? "default" : "outline"}
                                  size="sm"
                                  onClick={() => {
                                    updateMaterialState(index, {
                                      useManualMaterialUuid: true,
                                      materialOpen: false,
                                      materialValue: "",
                                    });
                                    field.onChange("");
                                  }}
                                >
                                  Enter UUID manually
                                </Button>
                              </div>
                              <FormControl>
                                {itemState.useManualMaterialUuid ? (
                                  <Input
                                    placeholder="Enter material UUID..."
                                    value={field.value}
                                    onChange={(e) => {
                                      const value = e.target.value;
                                      field.onChange(value);
                                      updateMaterialState(index, { materialValue: value });
                                      if (value && value.length > 0) {
                                        fetchMaterialUnit(value, index);
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
                                        updateMaterialState(index, { materialOpen: !itemState.materialOpen });
                                      }}
                                    >
                                      {itemState.materialValue
                                        ? materials?.find((material: any) => material.uuid === itemState.materialValue)?.name || "Material not found"
                                        : "Select material..."}
                                      <ChevronsUpDown className="ms-2 h-4 w-4 shrink-0 opacity-50" />
                                    </Button>
                                    
                                    {itemState.materialOpen && (
                                      <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg">
                                        <div className="p-2">
                                          <Input
                                            placeholder="Search materials..."
                                            value={itemState.materialSearch}
                                            onChange={(e) => updateMaterialState(index, { materialSearch: e.target.value })}
                                            className="mb-2"
                                          />
                                        </div>
                                        <div className="max-h-48 overflow-y-auto">
                                          {materials && materials.length > 0 ? (
                                            materials.filter((material: any) => 
                                              !itemState.materialSearch || 
                                              material.name.toLowerCase().includes(itemState.materialSearch.toLowerCase())
                                            ).map((material: any) => (
                                              <div
                                                key={material.uuid}
                                                className="px-3 py-2 hover:bg-gray-100 cursor-pointer flex items-center"
                                                onClick={(e) => {
                                                  e.preventDefault();
                                                  e.stopPropagation();
                                                  updateMaterialState(index, { 
                                                    materialValue: material.uuid,
                                                    materialOpen: false 
                                                  });
                                                  field.onChange(material.uuid);
                                                  fetchMaterialUnit(material.uuid, index);
                                                }}
                                              >
                                                <Check
                                                  className={cn(
                                                    "me-2 h-4 w-4",
                                                    itemState.materialValue === material.uuid ? "opacity-100" : "opacity-0"
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
                          );
                        }}
                      />

                      <FormField
                        control={form.control}
                        name={`purchase_order_items.${index}.quantity`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Quantity</FormLabel>
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
                            <FormLabel>Price per Unit</FormLabel>
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
                            <FormLabel>Unit</FormLabel>
                            <FormControl>
                              <Input placeholder="e.g., kg, pcs, m" {...field} />
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
                            <FormLabel>Quantity Received</FormLabel>
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
                onClick={() => setIsOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending}
                className="bg-[#5469D4] hover:bg-[#4356C7]"
              >
                {createMutation.isPending ? "Creating..." : "Create Purchase Order"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}