import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Save } from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { AppLayout } from "@/components/layout/AppLayout";
import type { Warehouse } from "@/lib/types";

interface WarehouseFormData {
  name: string;
  address: string;
  coordinates?: string | null;
  notes?: string | null;
}

export default function WarehouseEdit() {
  const [, params] = useRoute("/warehouses/:id/edit");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const id = params?.id;

  const [formData, setFormData] = useState<WarehouseFormData>({
    name: "",
    address: "",
    coordinates: null,
    notes: null,
  });

  // Fetch warehouse data
  const { data: warehouse, isLoading } = useQuery<Warehouse>({
    queryKey: [`/warehouse/${id}`],
    queryFn: async () => {
      return await apiRequest(`/warehouse/${id}`);
    },
    enabled: !!id,
  });

  // Update form data when warehouse data is loaded
  useEffect(() => {
    if (warehouse) {
      setFormData({
        name: warehouse.name || "",
        address: warehouse.address || "",
        coordinates: warehouse.coordinates || null,
        notes: warehouse.notes || null,
      });
    }
  }, [warehouse]);

  const updateWarehouseMutation = useMutation({
    mutationFn: async (data: WarehouseFormData) => {
      return await apiRequest(`/warehouse/${id}`, { method: "PUT", body: data });
    },
    onSuccess: () => {
      // Invalidate all warehouse queries to refresh cached data
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const queryKey = query.queryKey[0] as string;
          return queryKey.includes("/warehouse");
        }
      });
      
      toast({
        title: "Success",
        description: "Warehouse updated successfully",
      });
      
      // Navigate back to warehouse detail page
      setLocation(`/warehouses/${id}`);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update warehouse",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Convert empty strings to null for optional fields
    const cleanedData = {
      ...formData,
      coordinates: formData.coordinates?.trim() || null,
      notes: formData.notes?.trim() || null,
    };
    
    updateWarehouseMutation.mutate(cleanedData);
  };

  const handleInputChange = (field: keyof WarehouseFormData, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="p-4 lg:p-6">
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <Link href={`/warehouses/${id}`}>
                <Button variant="outline" size="sm">
                  <ArrowLeft className="h-4 w-4 me-2" />
                  Back
                </Button>
              </Link>
            </div>
            <div className="animate-pulse space-y-6">
              <div className="h-8 bg-gray-200 rounded w-1/3"></div>
              <div className="h-96 bg-gray-200 rounded"></div>
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (!warehouse) {
    return (
      <AppLayout>
        <div className="p-4 lg:p-6">
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <Link href="/warehouses">
                <Button variant="outline" size="sm">
                  <ArrowLeft className="h-4 w-4 me-2" />
                  Back to Warehouses
                </Button>
              </Link>
            </div>
            <Card>
              <CardContent className="p-6">
                <p className="text-center text-muted-foreground">Warehouse not found</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-4 lg:p-6">
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center gap-4">
            <Link href={`/warehouses/${id}`}>
              <Button variant="outline" size="sm">
                <ArrowLeft className="h-4 w-4 me-2" />
                Back
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold">Edit Warehouse</h1>
              <p className="text-muted-foreground">Update warehouse information</p>
            </div>
          </div>

          {/* Edit Form */}
          <Card>
            <CardHeader>
              <CardTitle>Warehouse Information</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid gap-6 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="name">Name *</Label>
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
                    <Input
                      id="address"
                      value={formData.address}
                      onChange={(e) => handleInputChange("address", e.target.value)}
                      placeholder="Enter warehouse address"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="coordinates">Coordinates</Label>
                  <Input
                    id="coordinates"
                    value={formData.coordinates || ""}
                    onChange={(e) => handleInputChange("coordinates", e.target.value)}
                    placeholder="e.g., 33.5138,36.2765"
                  />
                  <p className="text-sm text-muted-foreground">
                    Optional: Enter coordinates as latitude,longitude
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    value={formData.notes || ""}
                    onChange={(e) => handleInputChange("notes", e.target.value)}
                    placeholder="Enter any additional notes"
                    rows={4}
                  />
                </div>

                <div className="flex gap-2 pt-4">
                  <Button
                    type="submit"
                    disabled={updateWarehouseMutation.isPending}
                  >
                    <Save className="h-4 w-4 me-2" />
                    {updateWarehouseMutation.isPending ? "Saving..." : "Save Changes"}
                  </Button>
                  <Link href={`/warehouses/${id}`}>
                    <Button variant="outline" type="button">
                      Cancel
                    </Button>
                  </Link>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}