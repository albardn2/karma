import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface WarehouseFormData {
  name: string;
  address: string;
  coordinates?: string | null;
  notes?: string | null;
}

export function AddWarehouseDialog() {
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState<WarehouseFormData>({
    name: "",
    address: "",
    coordinates: null,
    notes: null,
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const createWarehouseMutation = useMutation({
    mutationFn: async (data: WarehouseFormData) => {
      return await apiRequest("/warehouse/", { method: "POST", body: data });
    },
    onSuccess: () => {
      // Invalidate all warehouse queries to refresh the list
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const queryKey = query.queryKey[0] as string;
          return queryKey.includes("/warehouse");
        }
      });
      
      // Also refetch any active queries immediately
      queryClient.refetchQueries({
        predicate: (query) => {
          const queryKey = query.queryKey[0] as string;
          return queryKey.includes("/warehouse");
        }
      });
      
      setOpen(false);
      setFormData({
        name: "",
        address: "",
        coordinates: "",
        notes: "",
      });
      toast({
        title: "Success",
        description: "Warehouse created successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create warehouse",
        variant: "destructive",
      });
    },
  });

  const handleInputChange = (field: keyof WarehouseFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value || undefined }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Basic validation
    if (!formData.name || !formData.address) {
      toast({
        title: "Validation Error",
        description: "Warehouse name and address are required",
        variant: "destructive",
      });
      return;
    }

    // Convert empty strings to null for optional fields
    const cleanedData = {
      ...formData,
      coordinates: formData.coordinates?.trim() || null,
      notes: formData.notes?.trim() || null,
    };

    createWarehouseMutation.mutate(cleanedData);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          Add Warehouse
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Warehouse</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Warehouse Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => handleInputChange("name", e.target.value)}
              placeholder="Enter warehouse name"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="address">Address *</Label>
            <Textarea
              id="address"
              value={formData.address}
              onChange={(e) => handleInputChange("address", e.target.value)}
              placeholder="Enter warehouse address"
              required
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="coordinates">Coordinates (lat,lng)</Label>
            <Input
              id="coordinates"
              value={formData.coordinates || ""}
              onChange={(e) => handleInputChange("coordinates", e.target.value)}
              placeholder="e.g., 33.5138,36.2765"
            />
            <p className="text-xs text-muted-foreground">
              Optional. Enter coordinates as latitude,longitude for map display.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={formData.notes || ""}
              onChange={(e) => handleInputChange("notes", e.target.value)}
              placeholder="Additional notes about this warehouse"
              rows={3}
            />
          </div>

          <div className="flex justify-end space-x-2 rtl:space-x-reverse pt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createWarehouseMutation.isPending}>
              {createWarehouseMutation.isPending ? "Creating..." : "Create Warehouse"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}