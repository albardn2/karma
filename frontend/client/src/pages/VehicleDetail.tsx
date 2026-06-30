import { useState, useEffect } from "react";
import { useRoute } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { 
  ArrowLeft, 
  Edit, 
  Save, 
  X, 
  Car, 
  Calendar, 
  Palette,
  Copy,
  Trash2
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { VehicleStatus, type Vehicle, type VehicleUpdateData } from "@/lib/types";
import { VehicleInventoryDialog } from "@/components/vehicles/VehicleInventoryDialog";
import { VehicleInventoryChart } from "@/components/vehicles/VehicleInventoryChart";

const vehicleUpdateSchema = z.object({
  plate_number: z.string().min(1, "Plate number is required").optional(),
  make: z.string().min(1, "Make is required").optional(),
  model: z.string().min(1, "Model is required").optional(),
  year: z.number().min(1900, "Invalid year").max(new Date().getFullYear() + 1, "Invalid year").optional(),
  color: z.string().min(1, "Color is required").optional(),
  status: z.nativeEnum(VehicleStatus).optional(),
  vin: z.string().optional().or(z.literal("")),
  notes: z.string().optional().or(z.literal("")),
});

type VehicleUpdateFormValues = z.infer<typeof vehicleUpdateSchema>;

export default function VehicleDetail() {
  const [, params] = useRoute("/vehicles/:uuid");
  const uuid = params?.uuid;
  const [isEditing, setIsEditing] = useState(false);
  const { toast } = useToast();

  // Fetch vehicle details
  const { data: vehicle, isLoading } = useQuery<Vehicle>({
    queryKey: ["/vehicle/", uuid],
    queryFn: async () => {
      if (!uuid) throw new Error("Vehicle UUID is required");
      return await apiRequest(`/vehicle/${uuid}`);
    },
    enabled: !!uuid,
  });

  const form = useForm<VehicleUpdateFormValues>({
    resolver: zodResolver(vehicleUpdateSchema),
    defaultValues: {
      plate_number: "",
      make: "",
      model: "",
      year: new Date().getFullYear(),
      color: "",
      status: VehicleStatus.ACTIVE,
      vin: "",
      notes: "",
    },
  });

  // Update form when vehicle data loads
  useEffect(() => {
    if (vehicle) {
      form.reset({
        plate_number: vehicle.plate_number || "",
        make: vehicle.make || "",
        model: vehicle.model || "",
        year: vehicle.year || new Date().getFullYear(),
        color: vehicle.color || "",
        status: vehicle.status || VehicleStatus.ACTIVE,
        vin: vehicle.vin || "",
        notes: vehicle.notes || "",
      });
    }
  }, [vehicle, form]);

  // Update vehicle mutation
  const updateVehicleMutation = useMutation({
    mutationFn: async (data: VehicleUpdateData) => {
      if (!uuid) throw new Error("Vehicle UUID is required");
      
      // Clean up empty fields before sending
      const cleanData = Object.fromEntries(
        Object.entries(data).filter(([_, value]) => value !== "" && value !== undefined)
      );
      
      return await apiRequest(`/vehicle/${uuid}`, { method: "PUT", body: cleanData });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/vehicle/", uuid] });
      queryClient.invalidateQueries({ 
        queryKey: ["/vehicle/"],
        exact: false 
      });
      toast({
        title: "Success",
        description: "Vehicle updated successfully",
      });
      setIsEditing(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update vehicle",
        variant: "destructive",
      });
    },
  });

  const deleteVehicleMutation = useMutation({
    mutationFn: async () => {
      if (!uuid) throw new Error("Vehicle UUID is required");
      return await apiRequest(`/vehicle/${uuid}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const queryKey = query.queryKey[0] as string;
          return queryKey.includes("/vehicle/");
        }
      });
      
      queryClient.refetchQueries({
        predicate: (query) => {
          const queryKey = query.queryKey[0] as string;
          return queryKey.includes("/vehicle/");
        }
      });
      
      toast({
        title: "Success",
        description: "Vehicle deleted successfully",
      });
      history.back();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete vehicle",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: VehicleUpdateFormValues) => {
    updateVehicleMutation.mutate(data as VehicleUpdateData);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const getStatusBadgeColor = (status: VehicleStatus) => {
    switch (status) {
      case VehicleStatus.ACTIVE:
        return "bg-green-100 text-green-800";
      case VehicleStatus.INACTIVE:
        return "bg-gray-100 text-gray-800";
      case VehicleStatus.SOLD:
        return "bg-blue-100 text-blue-800";
      case VehicleStatus.MAINTENANCE:
        return "bg-yellow-100 text-yellow-800";
      case VehicleStatus.RETIRED:
        return "bg-red-100 text-red-800";
      case VehicleStatus.UTILIZED:
        return "bg-purple-100 text-purple-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const formatStatus = (status: VehicleStatus) => {
    return status.charAt(0).toUpperCase() + status.slice(1);
  };

  const handleCopyToClipboard = async (text: string, fieldName: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: "Copied to clipboard",
        description: `${fieldName} copied successfully.`,
      });
    } catch (error) {
      console.error("Failed to copy:", error);
      toast({
        title: "Copy failed",
        description: "Failed to copy to clipboard. Please try again.",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading vehicle details...</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (!vehicle) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-screen">
          <div className="text-center">
            <Car className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Vehicle not found</h2>
            <p className="text-gray-600 mb-4">The vehicle you're looking for doesn't exist.</p>
            <Button onClick={() => history.back()}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Go Back
            </Button>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="flex-1 overflow-auto p-4 lg:p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => history.back()}
              data-testid="button-back"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <div>
              <h2 className="text-2xl font-bold text-gray-900" data-testid="text-vehicle-title">
                {vehicle.plate_number}
              </h2>
              <p className="text-sm text-gray-500">
                {vehicle.make} {vehicle.model} ({vehicle.year})
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!isEditing && (
              <>
                <VehicleInventoryDialog vehicleUuid={uuid as string} />
                <Button
                  variant="outline"
                  onClick={() => setIsEditing(true)}
                  data-testid="button-edit"
                >
                  <Edit className="h-4 w-4 mr-2" />
                  Edit
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" data-testid="button-delete">
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete the vehicle "{vehicle.plate_number}". This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => deleteVehicleMutation.mutate()}
                        className="bg-red-600 hover:bg-red-700"
                        data-testid="button-confirm-delete"
                      >
                        Delete Vehicle
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            )}
            {isEditing && (
              <>
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsEditing(false);
                    form.reset();
                  }}
                  data-testid="button-cancel-edit"
                >
                  <X className="h-4 w-4 mr-2" />
                  Cancel
                </Button>
                <Button
                  onClick={form.handleSubmit(onSubmit)}
                  disabled={updateVehicleMutation.isPending}
                  data-testid="button-save"
                >
                  <Save className="h-4 w-4 mr-2" />
                  {updateVehicleMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Vehicle Information */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>Vehicle Information</CardTitle>
              </CardHeader>
              <CardContent>
                {!isEditing ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm font-medium text-gray-500 mb-1">Plate Number</p>
                        <div className="flex items-center justify-between">
                          <p className="text-base font-medium" data-testid="text-plate-number">{vehicle.plate_number}</p>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleCopyToClipboard(vehicle.plate_number, "Plate number")}
                            data-testid="button-copy-plate"
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-500 mb-1">Make</p>
                        <p className="text-base font-medium" data-testid="text-make">{vehicle.make}</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-500 mb-1">Model</p>
                        <p className="text-base font-medium" data-testid="text-model">{vehicle.model}</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-500 mb-1 flex items-center gap-1">
                          <Calendar className="h-4 w-4" />
                          Year
                        </p>
                        <p className="text-base font-medium" data-testid="text-year">{vehicle.year}</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-500 mb-1 flex items-center gap-1">
                          <Palette className="h-4 w-4" />
                          Color
                        </p>
                        <p className="text-base font-medium" data-testid="text-color">{vehicle.color}</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-500 mb-1">Status</p>
                        <Badge className={getStatusBadgeColor(vehicle.status)} data-testid="badge-status">
                          {formatStatus(vehicle.status)}
                        </Badge>
                      </div>
                    </div>

                    <Separator />

                    {vehicle.vin && (
                      <div>
                        <p className="text-sm font-medium text-gray-500 mb-1">VIN</p>
                        <div className="flex items-center justify-between">
                          <p className="text-base font-medium font-mono" data-testid="text-vin">{vehicle.vin}</p>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleCopyToClipboard(vehicle.vin!, "VIN")}
                            data-testid="button-copy-vin"
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )}

                    {vehicle.notes && (
                      <div>
                        <p className="text-sm font-medium text-gray-500 mb-1">Notes</p>
                        <p className="text-base text-gray-700 whitespace-pre-wrap" data-testid="text-notes">{vehicle.notes}</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="plate_number"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Plate Number</FormLabel>
                              <FormControl>
                                <Input {...field} data-testid="input-edit-plate" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="make"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Make</FormLabel>
                              <FormControl>
                                <Input {...field} data-testid="input-edit-make" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="model"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Model</FormLabel>
                              <FormControl>
                                <Input {...field} data-testid="input-edit-model" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="year"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Year</FormLabel>
                              <FormControl>
                                <Input 
                                  type="number" 
                                  {...field} 
                                  onChange={(e) => field.onChange(parseInt(e.target.value))}
                                  data-testid="input-edit-year"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="color"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Color</FormLabel>
                              <FormControl>
                                <Input {...field} data-testid="input-edit-color" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="status"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Status</FormLabel>
                              <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                  <SelectTrigger data-testid="select-edit-status">
                                    <SelectValue placeholder="Select status" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value={VehicleStatus.ACTIVE}>Active</SelectItem>
                                  <SelectItem value={VehicleStatus.INACTIVE}>Inactive</SelectItem>
                                  <SelectItem value={VehicleStatus.SOLD}>Sold</SelectItem>
                                  <SelectItem value={VehicleStatus.MAINTENANCE}>Maintenance</SelectItem>
                                  <SelectItem value={VehicleStatus.RETIRED}>Retired</SelectItem>
                                  <SelectItem value={VehicleStatus.UTILIZED}>Utilized</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <FormField
                        control={form.control}
                        name="vin"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>VIN (Optional)</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="Enter vehicle identification number" data-testid="input-edit-vin" />
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
                              <Textarea {...field} rows={3} placeholder="Enter any additional notes" data-testid="textarea-edit-notes" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </form>
                  </Form>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Metadata */}
          <div>
            <Card>
              <CardHeader>
                <CardTitle>Metadata</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm font-medium text-gray-500 mb-1">UUID</p>
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-mono text-gray-900 truncate" data-testid="text-uuid">{vehicle.uuid}</p>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCopyToClipboard(vehicle.uuid, "UUID")}
                      data-testid="button-copy-uuid"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <Separator />

                <div>
                  <p className="text-sm font-medium text-gray-500 mb-1 flex items-center gap-1">
                    <Calendar className="h-4 w-4" />
                    Created At
                  </p>
                  <p className="text-sm text-gray-900" data-testid="text-created-at">{formatDate(vehicle.created_at)}</p>
                </div>

                {vehicle.created_by_uuid && (
                  <div>
                    <p className="text-sm font-medium text-gray-500 mb-1">Created By</p>
                    <p className="text-sm font-mono text-gray-900 truncate" data-testid="text-created-by">{vehicle.created_by_uuid}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Inventory time series chart */}
        <div className="mt-6">
          <VehicleInventoryChart vehicleUuid={uuid as string} />
        </div>
      </div>
    </AppLayout>
  );
}
