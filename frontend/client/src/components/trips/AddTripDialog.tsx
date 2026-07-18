import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import { apiRequest } from "@/lib/queryClient";
import { TripStatus, type TripFormData } from "@/lib/types";

const makeTripFormSchema = (t: (key: string) => string) =>
  z.object({
    vehicle_uuid: z.string().min(1, t("trips.vehicleRequired")),
    status: z.nativeEnum(TripStatus),
    start_warehouse_uuid: z.string().optional().or(z.literal("")),
    end_warehouse_uuid: z.string().optional().or(z.literal("")),
    start_time: z.string().optional().or(z.literal("")),
    end_time: z.string().optional().or(z.literal("")),
    notes: z.string().optional().or(z.literal("")),
  });

type TripFormValues = z.infer<ReturnType<typeof makeTripFormSchema>>;

interface AddTripDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function AddTripDialog({ open, onOpenChange, onSuccess }: AddTripDialogProps) {
  const { toast } = useToast();
  const { t, te } = useLanguage();
  const tripFormSchema = makeTripFormSchema(t);
  const queryClient = useQueryClient();

  // Fetch vehicles for dropdown
  const { data: vehiclesData } = useQuery({
    queryKey: ["/vehicle/"],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append("page", "1");
      params.append("per_page", "100");
      return await apiRequest(`/vehicle/?${params.toString()}`);
    },
    enabled: open,
  });

  // Fetch warehouses for dropdown
  const { data: warehousesData } = useQuery({
    queryKey: ["/warehouse/"],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append("page", "1");
      params.append("per_page", "100");
      return await apiRequest(`/warehouse/?${params.toString()}`);
    },
    enabled: open,
  });

  const vehicles = vehiclesData?.items || [];
  const warehouses = warehousesData?.items || [];

  const form = useForm<TripFormValues>({
    resolver: zodResolver(tripFormSchema),
    defaultValues: {
      vehicle_uuid: "",
      status: TripStatus.PLANNED,
      start_warehouse_uuid: "",
      end_warehouse_uuid: "",
      start_time: "",
      end_time: "",
      notes: "",
    },
  });

  const createTripMutation = useMutation({
    mutationFn: async (data: TripFormData) => {
      const cleanedData = {
        ...data,
        start_warehouse_uuid: data.start_warehouse_uuid?.trim() || undefined,
        end_warehouse_uuid: data.end_warehouse_uuid?.trim() || undefined,
        start_time: data.start_time?.trim() || undefined,
        end_time: data.end_time?.trim() || undefined,
        notes: data.notes?.trim() || undefined,
      };
      return await apiRequest("/trip/", { method: "POST", body: cleanedData });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/trip/"] });
      form.reset();
      onOpenChange(false);
      toast({
        title: t("common.success"),
        description: t("trips.createdSuccess"),
      });
      if (onSuccess) onSuccess();
    },
    onError: (error: any) => {
      toast({
        title: t("common.error"),
        description: error.message || t("trips.failedCreate"),
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: TripFormValues) => {
    createTripMutation.mutate(data as TripFormData);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("trips.createDialogTitle")}</DialogTitle>
          <DialogDescription>
            {t("trips.createDialogDescription")}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="max-h-96 overflow-y-auto pe-2 space-y-4">
              <FormField
                control={form.control}
                name="vehicle_uuid"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("trips.formVehicle")}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-vehicle">
                          <SelectValue placeholder={t("trips.selectVehicle")} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {vehicles.map((vehicle: any) => (
                          <SelectItem key={vehicle.uuid} value={vehicle.uuid}>
                            {vehicle.plate_number} - {vehicle.make} {vehicle.model}
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
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("trips.formStatus")}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-status">
                          <SelectValue placeholder={t("trips.selectStatus")} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={TripStatus.PLANNED}>{te(TripStatus.PLANNED)}</SelectItem>
                        <SelectItem value={TripStatus.IN_PROGRESS}>{te(TripStatus.IN_PROGRESS)}</SelectItem>
                        <SelectItem value={TripStatus.COMPLETED}>{te(TripStatus.COMPLETED)}</SelectItem>
                        <SelectItem value={TripStatus.CANCELLED}>{te(TripStatus.CANCELLED)}</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="start_warehouse_uuid"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("trips.formStartWarehouse")}</FormLabel>
                    <Select
                      onValueChange={(value) => field.onChange(value || undefined)}
                      value={field.value || undefined}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="select-start-warehouse">
                          <SelectValue placeholder={t("trips.selectStartWarehouse")} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {warehouses.map((warehouse: any) => (
                          <SelectItem key={warehouse.uuid} value={warehouse.uuid}>
                            {warehouse.name}
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
                name="end_warehouse_uuid"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("trips.formEndWarehouse")}</FormLabel>
                    <Select
                      onValueChange={(value) => field.onChange(value || undefined)}
                      value={field.value || undefined}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="select-end-warehouse">
                          <SelectValue placeholder={t("trips.selectEndWarehouse")} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {warehouses.map((warehouse: any) => (
                          <SelectItem key={warehouse.uuid} value={warehouse.uuid}>
                            {warehouse.name}
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
                name="start_time"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("trips.startTime")}</FormLabel>
                    <FormControl>
                      <Input
                        type="datetime-local"
                        {...field}
                        data-testid="input-start-time"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="end_time"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("trips.endTime")}</FormLabel>
                    <FormControl>
                      <Input
                        type="datetime-local"
                        {...field}
                        data-testid="input-end-time"
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
                    <FormLabel>{t("common.notes")}</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        placeholder={t("trips.notesInstructionsPlaceholder")}
                        rows={3}
                        data-testid="input-notes"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="flex gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => onOpenChange(false)}
                data-testid="button-cancel"
              >
                {t("common.cancel")}
              </Button>
              <Button
                type="submit"
                className="flex-1 bg-[#5469D4] hover:bg-[#4356C7] text-white"
                disabled={createTripMutation.isPending}
                data-testid="button-submit"
              >
                {createTripMutation.isPending ? t("common.creating") : t("trips.createTrip")}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
