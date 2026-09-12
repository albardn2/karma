import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { useLocation } from "wouter";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft } from "lucide-react";
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

const FORM_ID = "service-area-create-form";

type ServiceAreaFormData = {
  name: string;
  description?: string;
  geometry: string;
};

/**
 * Draw a new service area, full page.
 *
 * This was a modal, and the map was the casualty: a 400px box inside a
 * scrolling dialog, which is the one element here that genuinely needs room —
 * you are tracing a boundary around customer pins and between neighbouring
 * areas. The page gives the map the viewport and leaves the three fields
 * (name, description, the resulting WKT) in a narrow column beside it.
 */
export default function ServiceAreaCreate() {
  const { t } = useLanguage();
  const [, setLocation] = useLocation();
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

  const createServiceAreaMutation = useMutation({
    mutationFn: async (data: ServiceAreaFormData) =>
      apiRequest("/service-area/", {
        method: "POST",
        body: {
          name: data.name,
          description: data.description || null,
          geometry: data.geometry,
        },
      }),
    onSuccess: () => {
      // the draw map's reference overlay reads through this prefix too, so the
      // area just created shows up as context for the next one
      queryClient.invalidateQueries({ queryKey: ["/service-area/"] });
      toast({ title: t('common.success'), description: t('serviceAreas.createSuccess') });
      setLocation("/service-areas");
    },
    onError: (error: unknown) => {
      toast({
        title: t('common.error'),
        description: apiErrorMessage(error, t('serviceAreas.createError')),
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: ServiceAreaFormData) => {
    // Enter in the name field implicitly submits the form, which does not go
    // through the Create button — so its disabled state guards nothing here.
    if (createServiceAreaMutation.isPending) return;
    if (!geometry) {
      toast({
        title: t('common.error'),
        description: t('serviceAreas.drawPolygonError'),
        variant: "destructive",
      });
      return;
    }
    createServiceAreaMutation.mutate({ ...data, geometry });
  };

  const handleGeometryChange = (newGeometry: string) => {
    setGeometry(newGeometry);
    form.setValue("geometry", newGeometry, { shouldValidate: true });
  };

  const cancel = () => setLocation("/service-areas");

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
                {t('serviceAreas.addNew')}
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {t('serviceAreas.createSubtitle')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={cancel} disabled={createServiceAreaMutation.isPending}>
              {t('common.cancel')}
            </Button>
            {/* form= makes this the form's default submit button even though it
                sits in the header: implicit submission (Enter in a field) then
                hits a DISABLED default button and does nothing, instead of
                firing a second POST past the guard. */}
            <Button
              type="submit"
              form={FORM_ID}
              disabled={createServiceAreaMutation.isPending || !geometry}
              className="bg-[#5469D4] hover:bg-[#4356C7] text-white"
              data-testid="create-service-area"
            >
              {createServiceAreaMutation.isPending
                ? t('common.creating')
                : t('serviceAreas.createServiceArea')}
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
                    {t('serviceAreas.drawPolygonHint')}
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

            {/* The point of the page: the map gets the viewport. min-height keeps
                it usable on a short window, where vh alone would collapse it. */}
            <div
              dir="ltr"
              className="h-[calc(100vh-14rem)] min-h-[460px] border rounded-lg overflow-hidden"
            >
              <ServiceAreaDrawMap onGeometryChange={handleGeometryChange} initialGeometry="" />
            </div>
          </form>
        </Form>
      </div>
    </AppLayout>
  );
}
