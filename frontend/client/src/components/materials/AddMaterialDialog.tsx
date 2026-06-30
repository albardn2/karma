import { useState } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { MaterialFormData } from "@/lib/types";

export function AddMaterialDialog() {
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState<MaterialFormData>({
    name: "",
    sku: "",
    type: "",
    description: null,
    measure_unit: null,
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch material categories and units
  const { data: materialTypes } = useQuery<string[]>({
    queryKey: ["/material/material-type"],
    queryFn: async () => {
      return await apiRequest("/material/material-type");
    },
  });

  const { data: unitOfMeasures } = useQuery<string[]>({
    queryKey: ["/material/unit-of-measure"],
    queryFn: async () => {
      return await apiRequest("/material/unit-of-measure");
    },
  });

  const createMaterialMutation = useMutation({
    mutationFn: async (data: MaterialFormData) => {
      return await apiRequest("/material/", { method: "POST", body: data });
    },
    onSuccess: () => {
      // Invalidate and refetch all material-related queries
      queryClient.invalidateQueries({ queryKey: ["/material/"] });
      queryClient.invalidateQueries({ queryKey: ["/material/list"] });
      queryClient.refetchQueries({ queryKey: ["/material/"] });
      queryClient.refetchQueries({ queryKey: ["/material/list"] });
    },
  });

  const handleInputChange = (field: keyof MaterialFormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = () => {
    if (!formData.name.trim()) {
      toast({
        title: "Error",
        description: "Material name is required",
        variant: "destructive",
      });
      return;
    }

    if (!formData.sku.trim()) {
      toast({
        title: "Error",
        description: "SKU is required",
        variant: "destructive",
      });
      return;
    }

    if (!formData.type.trim()) {
      toast({
        title: "Error",
        description: "Material type is required",
        variant: "destructive",
      });
      return;
    }

    createMaterialMutation.mutate(formData, {
      onSuccess: () => {
        setOpen(false);
        setFormData({
          name: "",
          sku: "",
          type: "",
          description: null,
          measure_unit: null,
        });
        toast({
          title: "Success",
          description: "Material created successfully",
        });
      },
      onError: (error: any) => {
        toast({
          title: "Error",
          description: error.message || "Failed to create material",
          variant: "destructive",
        });
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Add Material
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add New Material</DialogTitle>
          <DialogDescription>
            Create a new material entry for your inventory system.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Material Name*</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => handleInputChange("name", e.target.value)}
              placeholder="Enter material name"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="sku">SKU*</Label>
            <Input
              id="sku"
              value={formData.sku}
              onChange={(e) => handleInputChange("sku", e.target.value)}
              placeholder="Enter SKU code"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="type">Material Type*</Label>
            <Select
              value={formData.type || ""}
              onValueChange={(value: string) => handleInputChange("type", value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select material type" />
              </SelectTrigger>
              <SelectContent>
                {materialTypes?.map(type => (
                  <SelectItem key={type} value={type}>
                    {type.replace('_', ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase())}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="measure_unit">Unit of Measure</Label>
            <Select
              value={formData.measure_unit || "none"}
              onValueChange={(value: string) => handleInputChange("measure_unit", value === "none" ? null : value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select unit" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No unit</SelectItem>
                {unitOfMeasures?.map(unit => (
                  <SelectItem key={unit} value={unit}>
                    {unit}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description || ""}
              onChange={(e) => handleInputChange("description", e.target.value || null)}
              placeholder="Enter material description"
              rows={2}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={createMaterialMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={createMaterialMutation.isPending}
          >
            {createMaterialMutation.isPending ? "Creating..." : "Create Material"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}