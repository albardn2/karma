import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Plus } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { ServiceAreaDrawMap } from "./ServiceAreaDrawMap";
import { useLanguage } from "@/contexts/LanguageContext";

type ServiceAreaFormData = {
  name: string;
  description?: string;
  geometry: string;
};

export function AddServiceAreaDialog() {
  const { t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
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
    defaultValues: {
      name: "",
      description: "",
      geometry: "",
    },
  });

  const createServiceAreaMutation = useMutation({
    mutationFn: async (data: ServiceAreaFormData) => {
      const payload = {
        name: data.name,
        description: data.description || null,
        geometry: data.geometry,
      };

      return await apiRequest("/service-area/", { method: "POST", body: payload });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/service-area/"] });
      queryClient.refetchQueries({ queryKey: ["/service-area/"] });
      
      toast({
        title: t('common.success'),
        description: t('serviceAreas.createSuccess'),
      });

      form.reset();
      setGeometry("");
      setIsOpen(false);
    },
    onError: (error: Error) => {
      toast({
        title: t('common.error'),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: ServiceAreaFormData) => {
    if (!geometry) {
      toast({
        title: t('common.error'),
        description: t('serviceAreas.drawPolygonError'),
        variant: "destructive",
      });
      return;
    }
    
    createServiceAreaMutation.mutate({
      ...data,
      geometry: geometry
    });
  };

  // Update form geometry when map geometry changes
  const handleGeometryChange = (newGeometry: string) => {
    setGeometry(newGeometry);
    form.setValue("geometry", newGeometry);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button className="bg-[#5469D4] hover:bg-[#4356C7] text-white">
          <Plus className="h-4 w-4 me-2" />
          {t('serviceAreas.addServiceArea')}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('serviceAreas.addNew')}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('common.name')}</FormLabel>
                      <FormControl>
                        <Input placeholder={t('serviceAreas.enterName')} {...field} />
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
                  {geometry && (
                    <div className="mt-2 p-2 bg-gray-50 rounded text-xs font-mono break-all">
                      {geometry}
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <FormLabel>{t('serviceAreas.map')}</FormLabel>
                <div dir="ltr" className="h-[400px] border rounded-lg overflow-hidden">
                  <ServiceAreaDrawMap
                    onGeometryChange={handleGeometryChange}
                    initialGeometry=""
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsOpen(false)}
              >
                {t('common.cancel')}
              </Button>
              <Button
                type="submit"
                disabled={createServiceAreaMutation.isPending || !geometry}
                className="bg-[#5469D4] hover:bg-[#4356C7]"
              >
                {createServiceAreaMutation.isPending ? t('common.creating') : t('serviceAreas.createServiceArea')}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}