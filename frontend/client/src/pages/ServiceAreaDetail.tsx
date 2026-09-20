import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
import { ArrowLeft, Edit2, Trash2, Copy, Check, Map } from "lucide-react";
import { Link, useLocation } from "wouter";
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

export default function ServiceAreaDetail() {
  const { t } = useLanguage();
  const [, params] = useRoute("/service-areas/:uuid");
  const [, setLocation] = useLocation();
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch service area data
  const { data: serviceArea, isLoading } = useQuery<ServiceArea>({
    queryKey: ["/service-area/", params?.uuid],
    queryFn: async () => {
      return await apiRequest(`/service-area/${params?.uuid}`);
    },
    enabled: !!params?.uuid,
  });

  // Delete service area mutation
  const deleteServiceAreaMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest(`/service-area/${params?.uuid}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/service-area/"] });
      // scoped to `active`: the invalidate above already marks every cached
      // viewport stale, and since the re-key the unfiltered form would also
      // force-refetch every panned map viewport that is not even mounted
      queryClient.refetchQueries({ queryKey: ["/service-area/"], type: "active" });
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
            <Button
              variant="outline"
              onClick={() => setLocation(`/service-areas/${params?.uuid}/edit`)}
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
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('serviceAreas.map')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div dir="ltr" className="h-[500px] border rounded-lg overflow-hidden">
                <ServiceAreaDetailMap geometry={serviceArea.geometry} name={serviceArea.name} />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}