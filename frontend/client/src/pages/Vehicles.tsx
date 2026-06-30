import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trash2, Car, Calendar, Palette } from "lucide-react";
import { AddVehicleDialog } from "@/components/vehicles/AddVehicleDialog";
import { VehicleFiltersComponent, type VehicleFilters } from "@/components/vehicles/VehicleFilters";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { Vehicle, VehiclePage, VehicleStatus } from "@/lib/types";

export default function Vehicles() {
  const [, setLocation] = useLocation();
  const [filters, setFilters] = useState<VehicleFilters>({
    page: 1,
    per_page: 12,
  });
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Build API URL with filters
  const buildApiUrl = (baseFilters: VehicleFilters) => {
    const params = new URLSearchParams();
    Object.entries(baseFilters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        params.append(key, value.toString());
      }
    });
    return `/vehicle/?${params.toString()}`;
  };

  // Fetch vehicles with filters
  const { data: vehiclesData, isLoading, isError } = useQuery<VehiclePage>({
    queryKey: ["/vehicle/", filters],
    queryFn: async () => {
      return await apiRequest(buildApiUrl(filters));
    },
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    retry: false,
  });

  // Create isolated display state
  const [displayVehicles, setDisplayVehicles] = useState<Vehicle[]>([]);
  const [displayCount, setDisplayCount] = useState<number>(0);
  const [displayText, setDisplayText] = useState<string>("Loading vehicles...");

  // Update display data from fresh API data
  useEffect(() => {
    if (isError) {
      setDisplayVehicles([]);
      setDisplayCount(0);
      setDisplayText("Unable to load vehicles - backend endpoint not available");
    } else {
      const vehicles = vehiclesData?.items || [];
      setDisplayVehicles(vehicles);
      setDisplayCount(vehicles.length);
      setDisplayText(isLoading ? "Loading vehicles..." : `${vehicles.length} vehicles on this page`);
    }
  }, [vehiclesData, isLoading, isError]);

  // Handle filter changes
  const handleFiltersChange = (newFilters: VehicleFilters) => {
    setFilters({ ...newFilters, page: 1 }); // Reset to first page when filters change
  };

  // Handle clear filters
  const handleClearFilters = () => {
    setFilters({ page: 1, per_page: 12 });
  };

  // Delete vehicle mutation
  const deleteVehicleMutation = useMutation({
    mutationFn: async (uuid: string) => {
      return await apiRequest(`/vehicle/${uuid}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        queryKey: ["/vehicle/"],
        exact: false 
      });
      toast({
        title: "Success",
        description: "Vehicle deleted successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error", 
        description: error.message || "Failed to delete vehicle",
        variant: "destructive",
      });
    },
  });

  const handleDeleteVehicle = (uuid: string, plateNumber: string) => {
    if (confirm(`Are you sure you want to delete vehicle "${plateNumber}"? This action cannot be undone.`)) {
      deleteVehicleMutation.mutate(uuid);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const getStatusBadgeColor = (status: VehicleStatus) => {
    switch (status) {
      case "active":
        return "bg-green-100 text-green-800";
      case "inactive":
        return "bg-gray-100 text-gray-800";
      case "sold":
        return "bg-blue-100 text-blue-800";
      case "maintenance":
        return "bg-yellow-100 text-yellow-800";
      case "retired":
        return "bg-red-100 text-red-800";
      case "utilized":
        return "bg-purple-100 text-purple-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const formatStatus = (status: VehicleStatus) => {
    return status.charAt(0).toUpperCase() + status.slice(1);
  };

  return (
    <AppLayout>
      <div className="flex-1 overflow-auto p-4 lg:p-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Vehicles</h2>
          </div>
          <AddVehicleDialog />
        </div>

        {/* Status Banner */}
        <div className="mb-6">
          <div className={`rounded-lg px-4 py-3 border ${
            isError 
              ? "bg-gradient-to-r from-red-50 to-orange-50 border-red-200" 
              : "bg-gradient-to-r from-indigo-50 to-purple-50 border-indigo-200"
          }`}>
            <div className="flex items-center">
              <div className={`w-3 h-3 rounded-full mr-3 ${
                isError ? "bg-red-500" : "bg-indigo-500"
              }`}></div>
              <span className={`text-sm font-medium ${
                isError ? "text-red-900" : "text-indigo-900"
              }`}>
                {displayText}
              </span>
            </div>
          </div>
        </div>

        {/* Filters Row */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4">
          <div></div> {/* Empty div for spacing */}
          {!isError && (
            <VehicleFiltersComponent 
              filters={filters} 
              onFiltersChange={handleFiltersChange}
              onClearFilters={handleClearFilters}
            />
          )}
        </div>

        {/* Content Area */}
        {isError ? (
          <div className="text-center py-12">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-red-100 rounded-full mb-4">
              <Car className="w-8 h-8 text-red-600" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">Backend Not Available</h3>
            <p className="text-gray-600 mb-4">
              The vehicles endpoint is not configured in your Flask backend.
            </p>
            <p className="text-sm text-gray-500">
              To enable vehicle management, add the /vehicle endpoint to your backend API.
            </p>
          </div>
        ) : displayVehicles.length === 0 && !isLoading ? (
          <div className="text-center py-12">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-full mb-4">
              <Car className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No vehicles found</h3>
            <p className="text-gray-600">
              No vehicles match your current filters.
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {displayVehicles.map((vehicle: Vehicle) => (
                <Card 
                  key={vehicle.uuid} 
                  className="hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => setLocation(`/vehicles/${vehicle.uuid}`)}
                  data-testid={`card-vehicle-${vehicle.uuid}`}
                >
                  <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                    <div className="space-y-1 flex-1">
                      <h3 className="font-semibold text-lg leading-none tracking-tight" data-testid={`text-plate-${vehicle.uuid}`}>
                        {vehicle.plate_number}
                      </h3>
                      <p className="text-sm text-muted-foreground flex items-center gap-1">
                        <Car className="h-3 w-3" />
                        {vehicle.make} {vehicle.model}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteVehicle(vehicle.uuid, vehicle.plate_number);
                      }}
                      data-testid={`button-delete-${vehicle.uuid}`}
                    >
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </Button>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          Year
                        </span>
                        <span className="font-medium" data-testid={`text-year-${vehicle.uuid}`}>{vehicle.year}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground flex items-center gap-1">
                          <Palette className="h-3 w-3" />
                          Color
                        </span>
                        <span className="font-medium" data-testid={`text-color-${vehicle.uuid}`}>{vehicle.color}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Status</span>
                        <Badge className={getStatusBadgeColor(vehicle.status)} data-testid={`badge-status-${vehicle.uuid}`}>
                          {formatStatus(vehicle.status)}
                        </Badge>
                      </div>
                      {vehicle.vin && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">VIN</span>
                          <span className="font-medium text-xs truncate ml-2" data-testid={`text-vin-${vehicle.uuid}`}>{vehicle.vin}</span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Pagination */}
            {vehiclesData && vehiclesData.pages > 1 && (
              <div className="flex items-center justify-between mt-6">
                <div className="text-sm text-gray-700">
                  Page {vehiclesData.page} of {vehiclesData.pages} ({vehiclesData.total_count} total vehicles)
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setFilters({ ...filters, page: Math.max(1, filters.page! - 1) })}
                    disabled={filters.page === 1}
                    data-testid="button-prev-page"
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setFilters({ ...filters, page: (filters.page || 1) + 1 })}
                    disabled={filters.page === vehiclesData.pages}
                    data-testid="button-next-page"
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}
