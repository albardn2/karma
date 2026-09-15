import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { useLocation, useRoute } from "wouter";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, Save } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, apiErrorMessage } from "@/lib/queryClient";
import { ServiceAreaDrawMap } from "@/components/service-areas/ServiceAreaDrawMap";
import { useLanguage } from "@/contexts/LanguageContext";

const FORM_ID = "service-area-edit-form";

interface ServiceArea {
  uuid: string;
  name: string;
  description?: string | null;
  geometry: string;
}

type ServiceAreaFormData = {
  name: string;
  description?: string;
  geometry: string;
};

/**
 * Redraw an existing service area, full page — the same shape as the create
 * page, for the same reason: the boundary is what you are here to change, and
 * it was being edited in a 500px box inside a detail card.
 *
 * The area being edited is passed as excludeServiceAreaUuid so the reference
 * overlay skips it: it is already on the map as the editable polygon, and
 * drawing it twice (amber reference under your own shape) reads as a bug.
 */
export default function ServiceAreaEdit() {
  const { t } = useLanguage();
  const [, params] = useRoute("/service-areas/:uuid/edit");
  const [, setLocation] = useLocation();
  const uuid = params?.uuid;
  const [geometry, setGeometry] = useState<string>("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const serviceAreaSchema = z.object({
    name: z.string().min(1, t("serviceAreas.nameRequired")),
    description: z.string().optional(),
    geometry: z.string().min(1, t("serviceAreas.geometryRequired")),
  });

  const form = useForm<ServiceAreaFormData>({
    resolver: zodResolver(serviceAreaSchema),
    defaultValues: { name: "", description: "", geometry: "" },
  });

  const { data: serviceArea, isLoading, isError } = useQuery<ServiceArea>({
    queryKey: ["/service-area/", uuid],
    queryFn: () => apiRequest(`/service-area/${uuid}`),
    enabled: !!uuid,
  });

  // Seed the form once the record arrives. Keyed on uuid rather than on the
  // record so a background refetch cannot overwrite edits in progress.
  useEffect(() => {
    if (!serviceArea) return;
    form.reset({
      name: serviceArea.name,
      description: serviceArea.description || "",
      geometry: serviceArea.geometry,
    });
    setGeometry(serviceArea.geometry);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uuid, !!serviceArea]);

  const updateMutation = useMutation({
    mutationFn: async (data: ServiceAreaFormData) =>
      apiRequest(`/service-area/${uuid}`, {
        method: "PUT",
        body: {
          name: data.name,
          description: data.description || null,
          geometry: data.geometry,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/service-area/", uuid] });
      // prefix-invalidates the list AND the draw map's reference overlay
      queryClient.invalidateQueries({ queryKey: ["/service-area/"] });
      toast({ title: t('common.success'), description: t('serviceAreas.updateSuccess') });
      setLocation(`/service-areas/${uuid}`);
    },
    onError: (error: unknown) => {
      toast({
        title: t('common.error'),
        description: apiErrorMessage(error, t('serviceAreas.updateError')),
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: ServiceAreaFormData) => {
    // Enter in a field submits the form directly, not via the Save button, so
    // that button's disabled state is not a guard on its own.
    if (updateMutation.isPending) return;
    if (!geometry) {
      toast({
        title: t('common.error'),
        description: t('serviceAreas.drawPolygonError'),
        variant: "destructive",
      });
      return;
    }
    updateMutation.mutate({ ...data, geometry });
  };

  const handleGeometryChange = (newGeometry: string) => {
    setGeometry(newGeometry);
    form.setValue("geometry", newGeometry, { shouldValidate: true });
  };

  const cancel = () => setLocation(uuid ? `/service-areas/${uuid}` : "/service-areas");

  if (isLoading) {
    return (
      <AppLayout>
        <div className="p-4 md:p-8 space-y-6">
          <div className="h-9 w-64 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(280px,340px)_1fr] gap-6">
            <div className="h-72 animate-pulse rounded-lg bg-gray-200 dark:bg-gray-700" />
            <div className="h-[460px] animate-pulse rounded-lg bg-gray-200 dark:bg-gray-700" />
          </div>
        </div>
      </AppLayout>
    );
  }

  // Only the ABSENCE of data means "not found". react-query keeps `data` and
  // flips status to error when a REFETCH fails, so gating on isError here tore
  // the form (and a half-redrawn boundary) down mid-session for a record that
  // exists — with refetchOnWindowFocus off, unrecoverably.
  if (!serviceArea) {
    return (
      <AppLayout>
        <div className="p-4 md:p-8 space-y-4">
          <h1 className="text-2xl font-semibold">{t('serviceAreas.notFound')}</h1>
          <Button variant="outline" onClick={() => setLocation("/service-areas")}>
            <ArrowLeft className="h-4 w-4 me-2" />
            {t('common.back')}
          </Button>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-4 md:p-8 space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={cancel}>
              <ArrowLeft className="h-4 w-4 me-2" />
              {t('common.back')}
            </Button>
            <div>
              <h1 className="text-2xl md:text-3xl font-semibold text-gray-900 dark:text-gray-100">
                {t('serviceAreas.editTitle')}
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {serviceArea.name}
              </p>
              {isError && (
                <p className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-500">
                  {t('serviceAreas.refreshFailed')}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={cancel} disabled={updateMutation.isPending}>
              {t('common.cancel')}
            </Button>
            {/* form= makes this the form's default submit button despite living
                in the header, so implicit submission (Enter in a field) hits a
                DISABLED button instead of firing a second PUT past the guard. */}
            <Button
              type="submit"
              form={FORM_ID}
              disabled={updateMutation.isPending || !geometry}
              className="bg-[#5469D4] hover:bg-[#4356C7] text-white"
              data-testid="save-service-area"
            >
              <Save className="h-4 w-4 me-2" />
              {updateMutation.isPending ? t('common.saving') : t('common.save')}
            </Button>
          </div>
        </div>

        <Form {...form}>
          <form
            id={FORM_ID}
            onSubmit={form.handleSubmit(onSubmit)}
            className="grid grid-cols-1 lg:grid-cols-[minmax(280px,340px)_1fr] gap-6 items-start"
          >
            <Card className="lg:sticky lg:top-6">
              <CardContent className="p-5 space-y-5">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('common.name')}</FormLabel>
                      <FormControl>
                        <Input
                          placeholder={t('serviceAreas.enterName')}
                          data-testid="service-area-name"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('serviceAreas.descriptionOptional')}</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder={t('serviceAreas.enterDescription')}
                          className="resize-none"
                          rows={3}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div>
                  <FormLabel>{t('serviceAreas.geometry')}</FormLabel>
                  <p className="text-sm text-muted-foreground mt-1">
                    {t('serviceAreas.redrawPolygonHint')}
                  </p>
                  {geometry ? (
                    <div
                      dir="ltr"
                      className="mt-2 max-h-32 overflow-y-auto rounded bg-gray-50 dark:bg-gray-800 p-2 text-xs font-mono break-all"
                    >
                      {geometry}
                    </div>
                  ) : (
                    <p className="mt-2 rounded border border-dashed p-2 text-xs text-muted-foreground">
                      {t('serviceAreas.noPolygonYet')}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Same as create: the map gets the viewport, with a min-height so a
                short window shrinks it rather than collapsing it. */}
            <div
              dir="ltr"
              className="h-[calc(100vh-14rem)] min-h-[460px] border rounded-lg overflow-hidden"
            >
              <ServiceAreaDrawMap
                onGeometryChange={handleGeometryChange}
                initialGeometry={serviceArea.geometry}
                excludeServiceAreaUuid={serviceArea.uuid}
              />
            </div>
          </form>
        </Form>
      </div>
    </AppLayout>
  );
}
