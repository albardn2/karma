import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { AppLayout } from "@/components/layout/AppLayout";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Edit2, Trash2, Copy, Check, Save, X, Map } from "lucide-react";
import { Link, useLocation } from "wouter";
import { ServiceAreaDrawMap } from "@/components/service-areas/ServiceAreaDrawMap";
import { ServiceAreaDetailMap } from "@/components/service-areas/ServiceAreaDetailMap";
import { useLanguage } from "@/contexts/LanguageContext";

interface ServiceArea {
  uuid: string;
  created_by_uuid?: string;
  name: string;
  description?: string;
  geometry: string;
  created_at: string;
  is_deleted: boolean;
}

type ServiceAreaUpdateData = {
  name: string;
  description?: string;
  geometry: string;
};

export default function ServiceAreaDetail() {
  const { t } = useLanguage();
  const [, params] = useRoute("/service-areas/:uuid");
  const [, setLocation] = useLocation();
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editGeometry, setEditGeometry] = useState<string>("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const serviceAreaUpdateSchema = z.object({
    name: z.string().min(1, t("serviceAreas.nameRequired")),
    description: z.string().optional(),
    geometry: z.string().min(1, t("serviceAreas.geometryRequired")),
  });

  const form = useForm<ServiceAreaUpdateData>({
    resolver: zodResolver(serviceAreaUpdateSchema),
  });

  // Fetch service area data
  const { data: serviceArea, isLoading } = useQuery<ServiceArea>({
    queryKey: ["/service-area/", params?.uuid],
    queryFn: async () => {
      return await apiRequest(`/service-area/${params?.uuid}`);
    },
    enabled: !!params?.uuid,
  });

  // Set form values when data loads or editing mode changes
  React.useEffect(() => {
    if (serviceArea && isEditing) {
      console.log('Setting up edit mode with geometry:', serviceArea.geometry);
      form.reset({
        name: serviceArea.name,
        description: serviceArea.description || "",
        geometry: serviceArea.geometry,
      });
      setEditGeometry(serviceArea.geometry);
    }
  }, [serviceArea, isEditing, form]);

  // Update form geometry when editGeometry changes
  React.useEffect(() => {
    if (isEditing && editGeometry) {
      form.setValue("geometry", editGeometry);
    }
  }, [editGeometry, isEditing, form]);

  // Update form geometry when editGeometry changes
  React.useEffect(() => {
    if (isEditing && editGeometry) {
      form.setValue("geometry", editGeometry);
    }
  }, [editGeometry, isEditing, form]);

  // Update service area mutation
  const updateServiceAreaMutation = useMutation({
    mutationFn: async (data: ServiceAreaUpdateData) => {
      console.log('Updating service area with data:', data);
      console.log('Edit geometry:', editGeometry);
      
      const payload = {
        name: data.name,
        description: data.description || null,
        geometry: data.geometry, // This should contain the updated geometry from the form
      };

      return await apiRequest(`/service-area/${params?.uuid}`, { method: "PUT", body: payload });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/service-area/", params?.uuid] });
      queryClient.invalidateQueries({ queryKey: ["/service-area/"] });
      queryClient.refetchQueries({ queryKey: ["/service-area/"] });
      
      toast({
        title: t('common.success'),
        description: t('serviceAreas.updateSuccess'),
      });
      setIsEditing(false);
    },
    onError: (error: Error) => {
      toast({
        title: t('common.error'),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Delete service area mutation
  const deleteServiceAreaMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest(`/service-area/${params?.uuid}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/service-area/"] });
      queryClient.refetchQueries({ queryKey: ["/service-area/"] });
      queryClient.removeQueries({ queryKey: ["/service-area/", params?.uuid] });
      
      toast({
        title: t('common.success'),
        description: t('serviceAreas.deleteSuccess'),
      });
      setLocation("/service-areas");
    },
    onError: (error: Error) => {
      toast({
        title: t('common.error'),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSave = (data: ServiceAreaUpdateData) => {
    console.log('handleSave called with data:', data);
    console.log('Current editGeometry:', editGeometry);
    console.log('Form geometry value:', form.getValues('geometry'));
    
    // Get the latest geometry from form
    const currentFormGeometry = form.getValues('geometry');
    const geometryToUse = currentFormGeometry || editGeometry || data.geometry;
    
    if (isEditing && !geometryToUse) {
      toast({
        title: t('common.error'),
        description: t('serviceAreas.drawPolygonError'),
        variant: "destructive",
      });
      return;
    }
    
    const finalData = {
      ...data,
      geometry: geometryToUse
    };
    
    console.log('Final data to submit:', finalData);
    updateServiceAreaMutation.mutate(finalData);
  };

  const copyToClipboard = async (text: string, field: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
      toast({
        title: t('serviceAreas.copied'),
        description: t('serviceAreas.copiedToClipboard', { label }),
      });
    } catch (err) {
      toast({
        title: t('common.error'),
        description: t('serviceAreas.copyFailed'),
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="space-y-6 p-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-96 w-full" />
        </div>
      </AppLayout>
    );
  }

  if (!serviceArea) {
    return (
      <AppLayout>
        <div className="space-y-6 p-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold">{t('serviceAreas.notFound')}</h1>
            <Link href="/service-areas">
              <Button className="mt-4">
                <ArrowLeft className="h-4 w-4 me-2" />
                {t('serviceAreas.backToServiceAreas')}
              </Button>
            </Link>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/service-areas">
              <Button variant="outline" size="icon">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold">{t('serviceAreas.detailsTitle')}</h1>
              <p className="text-muted-foreground">{serviceArea.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!isEditing ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => setIsEditing(true)}
                >
                  <Edit2 className="h-4 w-4 me-2" />
                  {t('common.edit')}
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive">
                      <Trash2 className="h-4 w-4 me-2" />
                      {t('common.delete')}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t('common.areYouSure')}</AlertDialogTitle>
                      <AlertDialogDescription>
                        {t('serviceAreas.deleteConfirmDescription')}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => deleteServiceAreaMutation.mutate()}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        {t('common.delete')}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsEditing(false);
                    if (serviceArea) {
                      form.reset({
                        name: serviceArea.name,
                        description: serviceArea.description || "",
                        geometry: serviceArea.geometry,
                      });
                      setEditGeometry(serviceArea.geometry);
                    }
                  }}
                >
                  <X className="h-4 w-4 me-2" />
                  {t('common.cancel')}
                </Button>
                <Button
                  onClick={form.handleSubmit(handleSave)}
                  disabled={updateServiceAreaMutation.isPending}
                  className="bg-[#5469D4] hover:bg-[#4356C7]"
                >
                  <Save className="h-4 w-4 me-2" />
                  {updateServiceAreaMutation.isPending ? t('common.saving') : t('common.save')}
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-[#5469D4] via-[#6B73E0] to-[#8B5CF6]">
                  <Map className="h-4 w-4 text-white" />
                </div>
                {t('serviceAreas.information')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!isEditing ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between group">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">{t('serviceAreas.uuid')}</p>
                      <p className="text-sm">{serviceArea.uuid}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => copyToClipboard(serviceArea.uuid, "UUID", t('serviceAreas.uuid'))}
                    >
                      {copiedField === "UUID" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>

                  <div className="flex items-center justify-between group">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">{t('common.name')}</p>
                      <p className="text-sm">{serviceArea.name}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => copyToClipboard(serviceArea.name, "Name", t('common.name'))}
                    >
                      {copiedField === "Name" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>

                  {serviceArea.description && (
                    <div className="flex items-start justify-between group">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-muted-foreground">{t('common.description')}</p>
                        <p className="text-sm mt-1">{serviceArea.description}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => copyToClipboard(serviceArea.description!, "Description", t('common.description'))}
                      >
                        {copiedField === "Description" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </div>
                  )}

                  <div className="flex items-center justify-between group">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">{t('serviceAreas.createdBy')}</p>
                      <p className="text-sm">{serviceArea.created_by_uuid || t('serviceAreas.na')}</p>
                    </div>
                    {serviceArea.created_by_uuid && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => copyToClipboard(serviceArea.created_by_uuid!, "Created By", t('serviceAreas.createdBy'))}
                      >
                        {copiedField === "Created By" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    )}
                  </div>

                  <div className="flex items-center justify-between group">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">{t('common.createdAt')}</p>
                      <p className="text-sm">{new Date(serviceArea.created_at).toLocaleString()}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => copyToClipboard(new Date(serviceArea.created_at).toLocaleString(), "Created At", t('common.createdAt'))}
                    >
                      {copiedField === "Created At" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>

                  <div>
                    <p className="text-sm font-medium text-muted-foreground">{t('common.status')}</p>
                    <Badge variant={serviceArea.is_deleted ? "destructive" : "default"} className="mt-1">
                      {serviceArea.is_deleted ? t('serviceAreas.deleted') : t('serviceAreas.active')}
                    </Badge>
                  </div>

                  <div className="flex items-start justify-between group">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-muted-foreground">{t('serviceAreas.geometryWkt')}</p>
                      <p className="text-xs font-mono mt-1 break-all">{serviceArea.geometry}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => copyToClipboard(serviceArea.geometry, "Geometry", t('serviceAreas.geometry'))}
                    >
                      {copiedField === "Geometry" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              ) : (
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(handleSave)} className="space-y-4">
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('common.name')}</FormLabel>
                          <FormControl>
                            <Input {...field} />
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
                          <FormLabel>{t('common.description')}</FormLabel>
                          <FormControl>
                            <Textarea
                              className="resize-none"
                              rows={3}
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="geometry"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('serviceAreas.geometry')}</FormLabel>
                          <p className="text-sm text-muted-foreground mt-1">
                            {t('serviceAreas.editPolygonHint')}
                          </p>
                          <FormControl>
                            <Input {...field} type="hidden" />
                          </FormControl>
                          {editGeometry && (
                            <div className="mt-2 p-2 bg-gray-50 rounded text-xs font-mono break-all">
                              {editGeometry}
                            </div>
                          )}
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </form>
                </Form>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('serviceAreas.map')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div dir="ltr" className="h-[500px] border rounded-lg overflow-hidden">
                {!isEditing ? (
                  <ServiceAreaDetailMap geometry={serviceArea.geometry} name={serviceArea.name} />
                ) : (
                  <ServiceAreaDrawMap
                    onGeometryChange={(geometry) => {
                      console.log('Geometry changed from map:', geometry);
                      setEditGeometry(geometry);
                      form.setValue('geometry', geometry, { shouldValidate: true });
                    }}
                    initialGeometry={serviceArea.geometry}
                  />
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}