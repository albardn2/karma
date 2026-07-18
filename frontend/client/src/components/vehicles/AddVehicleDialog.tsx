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
import { useLanguage } from "@/contexts/LanguageContext";
import { apiRequest } from "@/lib/queryClient";
import { VehicleStatus, type VehicleFormData } from "@/lib/types";

const makeVehicleFormSchema = (t: (key: string) => string) =>
  z.object({
    plate_number: z.string().min(1, t("vehicles.plateRequired")),
    make: z.string().min(1, t("vehicles.makeRequired")),
    model: z.string().min(1, t("vehicles.modelRequired")),
    year: z.coerce.number().int().min(1900, t("vehicles.yearMin")).max(new Date().getFullYear() + 1, t("vehicles.yearFuture")),
    color: z.string().min(1, t("vehicles.colorRequired")),
    status: z.nativeEnum(VehicleStatus),
    vin: z.string().optional().or(z.literal("")),
    notes: z.string().optional().or(z.literal("")),
  });

type VehicleFormValues = z.infer<ReturnType<typeof makeVehicleFormSchema>>;

export function AddVehicleDialog() {
  const [open, setOpen] = useState(false);
  const { t, te } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<VehicleFormValues>({
    resolver: zodResolver(makeVehicleFormSchema(t)),
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
        title: t("common.success"),
        description: t("vehicles.createSuccess"),
      });
    },
    onError: (error: any) => {
      toast({
        title: t("common.error"),
        description: error.message || t("vehicles.createFailed"),
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
          {t("vehicles.addVehicle")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("vehicles.addNewVehicle")}</DialogTitle>
          <DialogDescription>
            {t("vehicles.addDescription")}
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
                    <FormLabel>{t("vehicles.plateNumber")}*</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder={t("vehicles.platePlaceholder")}
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
                    <FormLabel>{t("vehicles.make")}*</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder={t("vehicles.makePlaceholder")}
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
                    <FormLabel>{t("vehicles.model")}*</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder={t("vehicles.modelPlaceholder")}
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
                    <FormLabel>{t("vehicles.year")}*</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        {...field}
                        placeholder={t("vehicles.yearPlaceholder")}
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
                    <FormLabel>{t("vehicles.color")}*</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder={t("vehicles.colorPlaceholder")}
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
                    <FormLabel>{t("common.status")}*</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-status">
                          <SelectValue placeholder={t("vehicles.selectStatus")} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={VehicleStatus.ACTIVE}>{te(VehicleStatus.ACTIVE)}</SelectItem>
                        <SelectItem value={VehicleStatus.INACTIVE}>{te(VehicleStatus.INACTIVE)}</SelectItem>
                        <SelectItem value={VehicleStatus.SOLD}>{te(VehicleStatus.SOLD)}</SelectItem>
                        <SelectItem value={VehicleStatus.MAINTENANCE}>{te(VehicleStatus.MAINTENANCE)}</SelectItem>
                        <SelectItem value={VehicleStatus.RETIRED}>{te(VehicleStatus.RETIRED)}</SelectItem>
                        <SelectItem value={VehicleStatus.UTILIZED}>{te(VehicleStatus.UTILIZED)}</SelectItem>
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
                    <FormLabel>{t("vehicles.vinOptional")}</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder={t("vehicles.vinPlaceholder")}
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
                    <FormLabel>{t("vehicles.notesOptional")}</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        placeholder={t("vehicles.notesPlaceholder")}
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
                {t("common.cancel")}
              </Button>
              <Button
                type="submit"
                disabled={createVehicleMutation.isPending}
                data-testid="button-submit"
              >
                {createVehicleMutation.isPending ? t("common.creating") : t("vehicles.createVehicle")}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
