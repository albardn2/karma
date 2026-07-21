import { useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { MapPin, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useLanguage } from "@/contexts/LanguageContext";

interface LocationTrackingConfig {
  trip_cadence_seconds: number;
  history_cadence_seconds: number;
  history_retention_days: number;
  updated_at: string;
}

const buildLocationConfigSchema = (
  t: (key: string, vars?: Record<string, string | number>) => string
) =>
  z.object({
    trip_cadence_seconds: z.coerce
      .number({ invalid_type_error: t("location.errMustBeNumber") })
      .int(t("location.errMustBeWholeNumber"))
      .min(1, t("location.errMinOneSecond")),
    history_cadence_seconds: z.coerce
      .number({ invalid_type_error: t("location.errMustBeNumber") })
      .int(t("location.errMustBeWholeNumber"))
      .min(1, t("location.errMinOneSecond")),
    history_retention_days: z.coerce
      .number({ invalid_type_error: t("location.errMustBeNumber") })
      .int(t("location.errMustBeWholeNumber"))
      .min(1, t("location.errMinOneDay")),
  });

type LocationConfigFormValues = z.infer<ReturnType<typeof buildLocationConfigSchema>>;

// Rendered as the "Location Tracking" tab inside the Super Admin page.
export function LocationTrackingPanel() {
  const { toast } = useToast();
  const { t } = useLanguage();
  const locationConfigSchema = useMemo(() => buildLocationConfigSchema(t), [t]);

  // Fetch current location tracking configuration
  const { data: config, isLoading } = useQuery<LocationTrackingConfig>({
    queryKey: ["/location/config"],
    queryFn: async () => {
      return await apiRequest("/location/config");
    },
  });

  const form = useForm<LocationConfigFormValues>({
    resolver: zodResolver(locationConfigSchema),
    defaultValues: {
      trip_cadence_seconds: undefined,
      history_cadence_seconds: undefined,
      history_retention_days: undefined,
    },
  });

  // Update form when config loads
  useEffect(() => {
    if (config) {
      form.reset({
        trip_cadence_seconds: config.trip_cadence_seconds,
        history_cadence_seconds: config.history_cadence_seconds,
        history_retention_days: config.history_retention_days,
      });
    }
  }, [config, form]);

  const updateConfigMutation = useMutation({
    mutationFn: async (data: LocationConfigFormValues) => {
      return await apiRequest("/location/config", {
        method: "PUT",
        body: {
          trip_cadence_seconds: data.trip_cadence_seconds,
          history_cadence_seconds: data.history_cadence_seconds,
          history_retention_days: data.history_retention_days,
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/location/config"] });
      toast({
        title: t("common.success"),
        description: t("location.settingsUpdated"),
      });
    },
    onError: (error: any) => {
      toast({
        title: t("common.error"),
        description: error.message || t("location.failedUpdateSettings"),
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: LocationConfigFormValues) => {
    updateConfigMutation.mutate(data);
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (isLoading) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600">{t("location.loadingSettings")}</p>
      </div>
    );
  }

  return (
      <div className="space-y-6 max-w-3xl">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <MapPin className="h-6 w-6" />
                {t("location.settingsTitle")}
              </h1>
              <p className="text-sm text-gray-600 mt-1">
                {t("location.settingsSubtitle")}
              </p>
            </div>
          </div>

          <p className="text-sm text-gray-600">
            {t("location.settingsNote")}
          </p>

          <Card>
            <CardHeader>
              <CardTitle>{t("location.storageConfig")}</CardTitle>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="trip_cadence_seconds"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("location.tripCadence")}</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={1}
                            placeholder={t("location.tripCadencePlaceholder")}
                            {...field}
                            value={field.value ?? ""}
                          />
                        </FormControl>
                        <FormDescription>
                          {t("location.tripCadenceDesc")}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="history_cadence_seconds"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("location.historyCadence")}</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={1}
                            placeholder={t("location.historyCadencePlaceholder")}
                            {...field}
                            value={field.value ?? ""}
                          />
                        </FormControl>
                        <FormDescription>
                          {t("location.historyCadenceDesc")}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="history_retention_days"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("location.historyRetention")}</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={1}
                            placeholder={t("location.historyRetentionPlaceholder")}
                            {...field}
                            value={field.value ?? ""}
                          />
                        </FormControl>
                        <FormDescription>
                          {t("location.historyRetentionDesc")}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="flex items-center justify-between pt-4">
                    {config?.updated_at ? (
                      <p className="text-xs text-gray-500">
                        {t("location.lastUpdated", { date: formatDateTime(config.updated_at) })}
                      </p>
                    ) : (
                      <span />
                    )}
                    <Button type="submit" disabled={updateConfigMutation.isPending}>
                      <Save className="h-4 w-4 me-2" />
                      {updateConfigMutation.isPending ? t("common.saving") : t("location.saveSettings")}
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
      </div>
  );
}
