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
import { Plus, Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";

const inventorySchema = z.object({
  material_uuid: z.string().min(1, "Material UUID is required"),
  warehouse_uuid: z.string().min(1, "Warehouse UUID is required"),
  notes: z.string().optional(),
  lot_id: z.string().optional(),
  expiration_date: z.string().optional(),
  is_active: z.boolean(),
});

type InventoryFormData = z.infer<typeof inventorySchema>;

export function AddInventoryDialog() {
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
    resolver: zodResolver(inventorySchema),
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
        title: "Success",
        description: "Inventory item created successfully",
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
        title: "Error",
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
          Add Inventory
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add New Inventory Item</DialogTitle>
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
                            ? materials?.find((material) => material.uuid === materialValue)?.name || "Material not found"
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
                                <div className="px-3 py-2 text-gray-500">No materials found.</div>
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
                  <FormLabel>Warehouse</FormLabel>
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
                      Select Warehouse
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
                      Enter UUID manually
                    </Button>
                  </div>
                  <FormControl>
                    {useManualWarehouseUuid ? (
                      <Input
                        placeholder="Enter warehouse UUID..."
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
                            ? warehouses?.find((warehouse) => warehouse.uuid === warehouseValue)?.name || "Warehouse not found"
                            : "Select warehouse..."}
                          <ChevronsUpDown className="ms-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                        
                        {warehouseOpen && (
                          <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg">
                            <div className="p-2">
                              <Input
                                placeholder="Search warehouses..."
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
                                <div className="px-3 py-2 text-gray-500">No warehouses found.</div>
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
                  <FormLabel>Notes (Optional)</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Enter notes"
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
                    <FormLabel>Lot ID (Optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter lot ID" {...field} />
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
                    <FormLabel>Expiration Date (Optional)</FormLabel>
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
                  <FormLabel>Status</FormLabel>
                  <Select onValueChange={(value) => field.onChange(value === "true")} defaultValue="true">
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="true">Active</SelectItem>
                      <SelectItem value="false">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end space-x-2 rtl:space-x-reverse pt-4">
              <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createInventoryMutation.isPending} className="bg-[#5469D4] hover:bg-[#5469D4]/90">
                {createInventoryMutation.isPending ? "Creating..." : "Create Inventory"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}