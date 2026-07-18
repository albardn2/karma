import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { VehicleStatus, type VehicleFormData } from "@/lib/types";

const vehicleFormSchema = z.object({
  plate_number: z.string().min(1, "Plate number is required"),
  make: z.string().min(1, "Make is required"),
  model: z.string().min(1, "Model is required"),
  year: z.coerce.number().int().min(1900, "Year must be 1900 or later").max(new Date().getFullYear() + 1, "Year cannot be in the future"),
  color: z.string().min(1, "Color is required"),
  status: z.nativeEnum(VehicleStatus),
  vin: z.string().optional().or(z.literal("")),
  notes: z.string().optional().or(z.literal("")),
});

type VehicleFormValues = z.infer<typeof vehicleFormSchema>;

export function AddVehicleDialog() {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<VehicleFormValues>({
    resolver: zodResolver(vehicleFormSchema),
    defaultValues: {
      plate_number: "",
      model: "",
      make: "",
      year: new Date().getFullYear(),
      color: "",
      status: VehicleStatus.ACTIVE,
      notes: "",
      vin: "",
    },
  });

  const createVehicleMutation = useMutation({
    mutationFn: async (data: VehicleFormData) => {
      // Clean up empty strings to undefined
      const cleanedData = {
        ...data,
        notes: data.notes?.trim() || undefined,
        vin: data.vin?.trim() || undefined,
      };
      return await apiRequest("/vehicle/", { method: "POST", body: cleanedData });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/vehicle/"] });
      form.reset();
      setOpen(false);
      toast({
        title: "Success",
        description: "Vehicle created successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create vehicle",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: VehicleFormValues) => {
    createVehicleMutation.mutate(data as VehicleFormData);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="button-add-vehicle">
          <Plus className="h-4 w-4 me-2" />
          Add Vehicle
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add New Vehicle</DialogTitle>
          <DialogDescription>
            Create a new vehicle entry for your fleet.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="max-h-96 overflow-y-auto pe-2 space-y-4">
              <FormField
                control={form.control}
                name="plate_number"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Plate Number*</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="Enter plate number"
                        data-testid="input-plate-number"
                      />
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
                    <FormLabel>Make*</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="e.g., Toyota, Ford, Honda"
                        data-testid="input-make"
                      />
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
                    <FormLabel>Model*</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="e.g., Camry, F-150, Civic"
                        data-testid="input-model"
                      />
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
                    <FormLabel>Year*</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        {...field}
                        placeholder="Enter year"
                        data-testid="input-year"
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
                    <FormLabel>Color*</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="Enter color"
                        data-testid="input-color"
                      />
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
                    <FormLabel>Status*</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-status">
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

              <FormField
                control={form.control}
                name="vin"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>VIN (Optional)</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="Enter vehicle identification number"
                        data-testid="input-vin"
                      />
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
                        {...field}
                        placeholder="Enter any additional notes"
                        rows={2}
                        data-testid="textarea-notes"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={createVehicleMutation.isPending}
                data-testid="button-cancel"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createVehicleMutation.isPending}
                data-testid="button-submit"
              >
                {createVehicleMutation.isPending ? "Creating..." : "Create Vehicle"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
