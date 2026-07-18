import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { CustomerFormData } from "@/lib/types";

interface AddCustomerDialogProps {
  categories: string[];
}

export function AddCustomerDialog({ categories }: AddCustomerDialogProps) {
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState<CustomerFormData>({
    company_name: "",
    full_name: "",
    phone_number: "",
    email_address: "",
    full_address: "",
    category: "",
    notes: "",
    coordinates: "",
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const createCustomerMutation = useMutation({
    mutationFn: async (data: CustomerFormData) => {
      return await apiRequest("/customer/", { method: "POST", body: data });
    },
    onSuccess: () => {
      // Invalidate all customer queries to refresh the list
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const queryKey = query.queryKey[0] as string;
          return queryKey.includes("/customer");
        }
      });
      
      // Also refetch any active queries immediately
      queryClient.refetchQueries({
        predicate: (query) => {
          const queryKey = query.queryKey[0] as string;
          return queryKey.includes("/customer");
        }
      });
      
      setOpen(false);
      setFormData({
        company_name: "",
        full_name: "",
        phone_number: "",
        email_address: "",
        full_address: "",
        category: "",
        notes: "",
        coordinates: "",
      });
      toast({
        title: "Success",
        description: "Customer created successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to create customer",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.company_name || !formData.full_name || !formData.phone_number || !formData.category) {
      toast({
        title: "Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    // Create payload with only required fields initially
    const payload: Partial<CustomerFormData> = {
      company_name: formData.company_name,
      full_name: formData.full_name,
      phone_number: formData.phone_number,
      full_address: formData.full_address,
      category: formData.category,
    };

    // Only include optional fields if they have values
    if (formData.email_address && formData.email_address.trim()) {
      payload.email_address = formData.email_address.trim();
    }
    if (formData.notes && formData.notes.trim()) {
      payload.notes = formData.notes.trim();
    }
    if (formData.coordinates && formData.coordinates.trim()) {
      payload.coordinates = formData.coordinates.trim();
    }

    createCustomerMutation.mutate(payload as CustomerFormData);
  };

  const handleInputChange = (field: keyof CustomerFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="brand-gradient hover:opacity-90">
          <Plus className="w-4 h-4 me-2" />
          Add Customer
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Customer</DialogTitle>
          <DialogDescription>
            Create a new customer record with their company and contact information.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="company_name">Company Name *</Label>
            <Input
              id="company_name"
              value={formData.company_name}
              onChange={(e) => handleInputChange("company_name", e.target.value)}
              placeholder="Enter company name"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="full_name">Contact Person *</Label>
            <Input
              id="full_name"
              value={formData.full_name}
              onChange={(e) => handleInputChange("full_name", e.target.value)}
              placeholder="Enter contact person name"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="phone_number">Phone Number *</Label>
              <Input
                id="phone_number"
                value={formData.phone_number}
                onChange={(e) => handleInputChange("phone_number", e.target.value)}
                placeholder="+1 (555) 123-4567"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email_address">Email Address</Label>
              <Input
                id="email_address"
                type="email"
                value={formData.email_address}
                onChange={(e) => handleInputChange("email_address", e.target.value)}
                placeholder="email@company.com"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="category">Category *</Label>
            <Select value={formData.category} onValueChange={(value) => handleInputChange("category", value)}>
              <SelectTrigger>
                <SelectValue placeholder="Select customer category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((category) => (
                  <SelectItem key={category} value={category} className="capitalize">
                    {category.charAt(0).toUpperCase() + category.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="full_address">Address *</Label>
            <Textarea
              id="full_address"
              value={formData.full_address}
              onChange={(e) => handleInputChange("full_address", e.target.value)}
              placeholder="Enter complete address"
              required
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="coordinates">Coordinates</Label>
            <Input
              id="coordinates"
              value={formData.coordinates}
              onChange={(e) => handleInputChange("coordinates", e.target.value)}
              placeholder="latitude,longitude (e.g., 33.5138,36.2765)"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => handleInputChange("notes", e.target.value)}
              placeholder="Additional notes or comments"
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={createCustomerMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={createCustomerMutation.isPending}
              className="brand-gradient hover:opacity-90"
            >
              {createCustomerMutation.isPending ? "Creating..." : "Create Customer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}