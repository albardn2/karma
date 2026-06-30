import { useState } from "react";
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
import { ArrowLeft, Edit2, Trash2, Copy, Check, Save, X, Package } from "lucide-react";
import { Link, useLocation } from "wouter";

interface Inventory {
  uuid: string;
  material_uuid: string;
  warehouse_uuid: string | null;
  created_by_uuid: string | null;
  notes: string | null;
  lot_id: string | null;
  expiration_date: string | null;
  cost_per_unit: number | null;
  unit: string;
  current_quantity: number | null;
  original_quantity: number | null;
  is_active: boolean;
  currency: string | null;
  created_at: string;
  is_deleted: boolean;
  total_original_cost: number | null;
}

const inventoryUpdateSchema = z.object({
  warehouse_uuid: z.string().optional(),
  notes: z.string().optional(),
  expiration_date: z.string().optional(),
  is_active: z.boolean().optional(),
});

type InventoryUpdateData = z.infer<typeof inventoryUpdateSchema>;

export default function InventoryDetail() {
  const [, params] = useRoute("/inventory/:uuid");
  const [, setLocation] = useLocation();
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<InventoryUpdateData>({
    resolver: zodResolver(inventoryUpdateSchema),
  });

  // Fetch inventory data
  const { data: inventory, isLoading } = useQuery<Inventory>({
    queryKey: ["/inventory/", params?.uuid],
    queryFn: async () => {
      return await apiRequest(`/inventory/${params?.uuid}`);
    },
    enabled: !!params?.uuid,
  });

  // Set form values when data loads
  useState(() => {
    if (inventory) {
      form.reset({
        warehouse_uuid: inventory.warehouse_uuid || "",
        notes: inventory.notes || "",
        expiration_date: inventory.expiration_date ? inventory.expiration_date.split('T')[0] : "",
        is_active: inventory.is_active,
      });
    }
  });

  // Update inventory mutation
  const updateInventoryMutation = useMutation({
    mutationFn: async (data: InventoryUpdateData) => {
      const payload = {
        warehouse_uuid: data.warehouse_uuid || null,
        notes: data.notes || null,
        expiration_date: data.expiration_date || null,
        is_active: data.is_active,
      };

      return await apiRequest(`/inventory/${params?.uuid}`, { method: "PUT", body: payload });
    },
    onSuccess: () => {
      // Refresh both detail and list views
      queryClient.invalidateQueries({ queryKey: ["/inventory/", params?.uuid] });
      queryClient.invalidateQueries({ queryKey: ["/inventory/"] });
      queryClient.refetchQueries({ queryKey: ["/inventory/"] });
      
      toast({
        title: "Success",
        description: "Inventory updated successfully",
      });
      setIsEditing(false);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update inventory",
        variant: "destructive",
      });
    },
  });

  // Delete inventory mutation
  const deleteInventoryMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest(`/inventory/${params?.uuid}`, { method: "DELETE" });
    },
    onSuccess: () => {
      // Comprehensive cache invalidation for inventory list refresh
      queryClient.invalidateQueries({ queryKey: ["/inventory/"] });
      queryClient.refetchQueries({ queryKey: ["/inventory/"] });
      queryClient.removeQueries({ queryKey: ["/inventory/", params?.uuid] });
      
      toast({
        title: "Success",
        description: "Inventory deleted successfully",
      });
      setLocation("/inventory");
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete inventory",
        variant: "destructive",
      });
    },
  });

  const handleSave = (data: InventoryUpdateData) => {
    updateInventoryMutation.mutate(data);
  };

  const handleCancel = () => {
    if (inventory) {
      form.reset({
        warehouse_uuid: inventory.warehouse_uuid || "",
        notes: inventory.notes || "",
        expiration_date: inventory.expiration_date ? inventory.expiration_date.split('T')[0] : "",
        is_active: inventory.is_active,
      });
    }
    setIsEditing(false);
  };

  const copyToClipboard = async (text: string, fieldName: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(fieldName);
      setTimeout(() => setCopiedField(null), 2000);
      toast({
        title: "Copied",
        description: `${fieldName} copied to clipboard`,
      });
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to copy to clipboard",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="space-y-6 p-6 max-w-4xl mx-auto">
          <Skeleton className="h-8 w-64" />
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-48" />
            </CardHeader>
            <CardContent className="space-y-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-4 w-full" />
              ))}
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  if (!inventory) {
    return (
      <AppLayout>
        <div className="text-center py-12">
          <h1 className="text-2xl font-bold">Inventory Not Found</h1>
          <p className="text-muted-foreground mt-2">The inventory item you're looking for doesn't exist.</p>
          <Link href="/inventory">
            <Button className="mt-4">Back to Inventory</Button>
          </Link>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6 p-6 max-w-4xl mx-auto">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/inventory">
              <Button variant="outline" size="icon">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Inventory Details</h1>
              <p className="text-muted-foreground">Material: {inventory.material_uuid}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isEditing ? (
              <>
                <Button variant="outline" onClick={handleCancel} size="sm">
                  <X className="h-4 w-4 mr-2" />
                  Cancel
                </Button>
                <Button 
                  onClick={form.handleSubmit(handleSave)} 
                  disabled={updateInventoryMutation.isPending}
                  size="sm"
                  className="bg-[#5469D4] hover:bg-[#5469D4]/90"
                >
                  <Save className="h-4 w-4 mr-2" />
                  {updateInventoryMutation.isPending ? "Saving..." : "Save"}
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => setIsEditing(true)} size="sm">
                  <Edit2 className="h-4 w-4 mr-2" />
                  Edit
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700">
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete Inventory Item</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to delete this inventory item? This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => deleteInventoryMutation.mutate()}
                        disabled={deleteInventoryMutation.isPending}
                        className="bg-red-600 hover:bg-red-700"
                      >
                        {deleteInventoryMutation.isPending ? "Deleting..." : "Delete"}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            )}
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-gradient-to-br from-[#5469D4] via-[#6B73E0] to-[#8B5CF6]">
                <Package className="h-5 w-5 text-white" />
              </div>
              Inventory Information
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isEditing ? (
              <Form {...form}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-muted-foreground">UUID</label>
                    <p className="text-sm">{inventory.uuid}</p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-muted-foreground">Material UUID</label>
                    <p className="text-sm">{inventory.material_uuid}</p>
                  </div>

                  <FormField
                    control={form.control}
                    name="warehouse_uuid"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Warehouse UUID</FormLabel>
                        <FormControl>
                          <Input placeholder="Enter warehouse UUID" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-muted-foreground">Current Quantity</label>
                    <p className="text-sm">{inventory.current_quantity || 'N/A'} {inventory.unit}</p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-muted-foreground">Original Quantity</label>
                    <p className="text-sm">{inventory.original_quantity || 'N/A'} {inventory.unit}</p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-muted-foreground">Cost per Unit</label>
                    <p className="text-sm">{inventory.cost_per_unit ? `${inventory.cost_per_unit} ${inventory.currency || ''}` : 'N/A'}</p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-muted-foreground">Total Original Cost</label>
                    <p className="text-sm">{inventory.total_original_cost ? `${inventory.total_original_cost} ${inventory.currency || ''}` : 'N/A'}</p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-muted-foreground">Lot ID</label>
                    <p className="text-sm">{inventory.lot_id || 'N/A'}</p>
                  </div>

                  <FormField
                    control={form.control}
                    name="expiration_date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Expiration Date</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="is_active"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Status</FormLabel>
                        <Select onValueChange={(value) => field.onChange(value === "true")} value={field.value?.toString()}>
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

                  <div className="md:col-span-2">
                    <FormField
                      control={form.control}
                      name="notes"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Notes</FormLabel>
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
                  </div>
                </div>
              </Form>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Read-only fields with copy functionality */}
                {[
                  { label: "UUID", value: inventory.uuid, key: "uuid" },
                  { label: "Material UUID", value: inventory.material_uuid, key: "material_uuid" },
                  { label: "Warehouse UUID", value: inventory.warehouse_uuid || 'N/A', key: "warehouse_uuid" },
                  { label: "Current Quantity", value: `${inventory.current_quantity || 'N/A'} ${inventory.unit}`, key: "current_quantity" },
                  { label: "Original Quantity", value: `${inventory.original_quantity || 'N/A'} ${inventory.unit}`, key: "original_quantity" },
                  { label: "Cost per Unit", value: inventory.cost_per_unit ? `${inventory.cost_per_unit} ${inventory.currency || ''}` : 'N/A', key: "cost_per_unit" },
                  { label: "Total Original Cost", value: inventory.total_original_cost ? `${inventory.total_original_cost} ${inventory.currency || ''}` : 'N/A', key: "total_original_cost" },
                  { label: "Lot ID", value: inventory.lot_id || 'N/A', key: "lot_id" },
                  { label: "Expiration Date", value: inventory.expiration_date ? new Date(inventory.expiration_date).toLocaleDateString() : 'N/A', key: "expiration_date" },
                  { label: "Created By UUID", value: inventory.created_by_uuid || 'N/A', key: "created_by_uuid" },
                  { label: "Created At", value: new Date(inventory.created_at).toLocaleString(), key: "created_at" },
                ].map((field) => (
                  <div key={field.key} className="space-y-2 group">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium text-muted-foreground">{field.label}</label>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(field.value, field.label)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 p-0"
                      >
                        {copiedField === field.label ? (
                          <Check className="h-3 w-3 text-green-600" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </Button>
                    </div>
                    <p className="text-sm">{field.value}</p>
                  </div>
                ))}

                <div className="space-y-2 group">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-muted-foreground">Status</label>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(inventory.is_active ? 'Active' : 'Inactive', 'Status')}
                      className="opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 p-0"
                    >
                      {copiedField === 'Status' ? (
                        <Check className="h-3 w-3 text-green-600" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </Button>
                  </div>
                  <Badge variant={inventory.is_active ? "default" : "secondary"}>
                    {inventory.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </div>

                {inventory.notes && (
                  <div className="md:col-span-2 space-y-2 group">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium text-muted-foreground">Notes</label>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(inventory.notes || '', 'Notes')}
                        className="opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 p-0"
                      >
                        {copiedField === 'Notes' ? (
                          <Check className="h-3 w-3 text-green-600" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </Button>
                    </div>
                    <p className="text-sm">{inventory.notes}</p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}