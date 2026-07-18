import { useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AppLayout } from "@/components/layout/AppLayout";
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

interface LocationTrackingConfig {
  trip_cadence_seconds: number;
  history_cadence_seconds: number;
  history_retention_days: number;
  updated_at: string;
}

const locationConfigSchema = z.object({
  trip_cadence_seconds: z.coerce
    .number({ invalid_type_error: "Must be a number" })
    .int("Must be a whole number")
    .min(1, "Must be at least 1 second"),
  history_cadence_seconds: z.coerce
    .number({ invalid_type_error: "Must be a number" })
    .int("Must be a whole number")
    .min(1, "Must be at least 1 second"),
  history_retention_days: z.coerce
    .number({ invalid_type_error: "Must be a number" })
    .int("Must be a whole number")
    .min(1, "Must be at least 1 day"),
});

type LocationConfigFormValues = z.infer<typeof locationConfigSchema>;

export default function LocationTrackingSettings() {
  const { toast } = useToast();

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
        title: "Success",
        description: "Location tracking settings updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update location tracking settings",
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
      <AppLayout>
        <div className="flex-1 overflow-auto p-4 lg:p-6">
          <div className="text-center py-12">
            <p className="text-gray-600">Loading location tracking settings...</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="flex-1 overflow-auto p-4 lg:p-6">
        <div className="space-y-6 max-w-3xl">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <MapPin className="h-6 w-6" />
                Location Tracking Settings
              </h1>
              <p className="text-sm text-gray-600 mt-1">
                Global configuration for how user location data is stored and retained.
              </p>
            </div>
          </div>

          <p className="text-sm text-gray-600">
            These settings apply to all users. The live publish cadence (how often the mobile
            app sends location updates for a specific user) is configured per user on the
            user's page.
          </p>

          <Card>
            <CardHeader>
              <CardTitle>Storage Configuration</CardTitle>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="trip_cadence_seconds"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Trip cadence (seconds)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={1}
                            placeholder="Enter trip cadence in seconds"
                            {...field}
                            value={field.value ?? ""}
                          />
                        </FormControl>
                        <FormDescription>
                          Spacing of stored points during a trip
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
                        <FormLabel>History cadence (seconds)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={1}
                            placeholder="Enter history cadence in seconds"
                            {...field}
                            value={field.value ?? ""}
                          />
                        </FormControl>
                        <FormDescription>
                          Spacing of stored points outside trips
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
                        <FormLabel>History retention (days)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={1}
                            placeholder="Enter retention period in days"
                            {...field}
                            value={field.value ?? ""}
                          />
                        </FormControl>
                        <FormDescription>
                          How far back user history is kept; trip points are kept forever
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="flex items-center justify-between pt-4">
                    {config?.updated_at ? (
                      <p className="text-xs text-gray-500">
                        Last updated: {formatDateTime(config.updated_at)}
                      </p>
                    ) : (
                      <span />
                    )}
                    <Button type="submit" disabled={updateConfigMutation.isPending}>
                      <Save className="h-4 w-4 me-2" />
                      {updateConfigMutation.isPending ? "Saving..." : "Save Settings"}
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
