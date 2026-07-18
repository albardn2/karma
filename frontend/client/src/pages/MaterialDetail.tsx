import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MaterialInventorySection } from "@/components/materials/MaterialInventorySection";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { 
  ArrowLeft, 
  Package, 
  Edit, 
  Trash2, 
  Copy, 
  Save, 
  X,
  Tag,
  Ruler
} from "lucide-react";
import { Link } from "wouter";
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
import type { Material } from "@/lib/types";
import { useLanguage } from "@/contexts/LanguageContext";

interface MaterialFormData {
  name: string;
  sku: string;
  type: string;
  description?: string | null;
  measure_unit?: string | null;
}

export default function MaterialDetail() {
  const { t, te } = useLanguage();
  const { uuid } = useParams<{ uuid: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<MaterialFormData>({
    name: "",
    sku: "",
    type: "",
    description: null,
    measure_unit: null,
  });

  // Fetch material details
  const { data: material, isLoading, error } = useQuery<Material>({
    queryKey: ["/material/", uuid],
    queryFn: async () => {
      return await apiRequest(`/material/${uuid}`);
    },
    enabled: !!uuid,
  });

  // Fetch material types and units for editing
  const { data: materialTypes } = useQuery<string[]>({
    queryKey: ["/material/material-type"],
    queryFn: async () => {
      return await apiRequest("/material/material-type");
    },
    enabled: isEditing,
  });

  const { data: unitOfMeasures } = useQuery<string[]>({
    queryKey: ["/material/unit-of-measure"],
    queryFn: async () => {
      return await apiRequest("/material/unit-of-measure");
    },
    enabled: isEditing,
  });

  // Update material mutation
  const updateMaterialMutation = useMutation({
    mutationFn: async (data: MaterialFormData) => {
      return await apiRequest(`/material/${uuid}`, { method: "PUT", body: data });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          return query.queryKey[0] === "/material/" || query.queryKey[0] === "/material/list";
        }
      });
      
      toast({
        title: t('common.success'),
        description: t('materials.updateSuccess'),
      });

      setIsEditing(false);
    },
    onError: () => {
      toast({
        title: t('common.error'),
        description: t('materials.updateFailed'),
        variant: "destructive",
      });
    },
  });

  // Delete material mutation
  const deleteMaterialMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest(`/material/${uuid}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/material/"] });
      queryClient.invalidateQueries({ queryKey: ["/material/list"] });
      queryClient.refetchQueries({ queryKey: ["/material/"] });
      queryClient.refetchQueries({ queryKey: ["/material/list"] });
      
      toast({
        title: t('common.success'),
        description: t('materials.deleteSuccess'),
      });

      setLocation("/materials");
    },
    onError: (error: any) => {
      toast({
        title: t('common.error'),
        description: error.message || t('materials.deleteFailed'),
        variant: "destructive",
      });
    },
  });

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: t('materials.copied'),
        description: t('materials.copiedToClipboard', { label }),
      });
    } catch (err) {
      toast({
        title: t('common.error'),
        description: t('materials.copyFailed'),
        variant: "destructive",
      });
    }
  };

  const handleEdit = () => {
    if (material) {
      setFormData({
        name: material.name || "",
        sku: material.sku || "",
        type: material.type || "",
        description: material.description || null,
        measure_unit: material.measure_unit || null
      });
    }
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setFormData({
      name: "",
      sku: "",
      type: "",
      description: null,
      measure_unit: null,
    });
  };

  const handleSave = () => {
    const submissionData = {
      name: formData.name.trim(),
      sku: formData.sku.trim(),
      type: formData.type.trim(),
      description: formData.description?.trim() || null,
      measure_unit: formData.measure_unit === "none" ? null : formData.measure_unit
    };
    
    updateMaterialMutation.mutate(submissionData);
  };

  const handleInputChange = (field: keyof MaterialFormData, value: string | null) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/3 mb-6"></div>
          <div className="h-96 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (error || !material) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">{t('materials.notFound')}</h1>
          <Link href="/materials">
            <Button>{t('materials.backToMaterials')}</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link href="/materials">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 me-2" />
              {t('materials.backToMaterials')}
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <Package className="h-6 w-6 text-[#5469D4]" />
            <h1 className="text-2xl font-bold">{material.name}</h1>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {!isEditing ? (
            <>
              <Button variant="outline" size="sm" onClick={handleEdit}>
                <Edit className="h-4 w-4 me-2" />
                {t('common.edit')}
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm">
                    <Trash2 className="h-4 w-4 me-2" />
                    {t('common.delete')}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t('materials.deleteMaterial')}</AlertDialogTitle>
                    <AlertDialogDescription>
                      {t('materials.deleteConfirmDescription', { name: material.name })}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => deleteMaterialMutation.mutate()}
                      disabled={deleteMaterialMutation.isPending}
                      className="bg-red-600 hover:bg-red-700"
                    >
                      {deleteMaterialMutation.isPending ? t('common.deleting') : t('common.delete')}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          ) : (
            <>
              <Button 
                size="sm" 
                onClick={handleSave}
                disabled={updateMaterialMutation.isPending}
                className="bg-gradient-to-r from-[#5469D4] to-[#8B5CF6] hover:from-[#4F63D2] hover:to-[#8A5AF5]"
              >
                <Save className="h-4 w-4 me-2" />
                {updateMaterialMutation.isPending ? t('common.saving') : t('common.save')}
              </Button>
              <Button variant="outline" size="sm" onClick={handleCancelEdit}>
                <X className="h-4 w-4 me-2" />
                {t('common.cancel')}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Basic Information */}
        <Card>
          <CardHeader>
            <CardTitle>{t('materials.basicInformation')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Material Name */}
            <div className="space-y-2">
              <div className="flex items-center justify-between group">
                <div className="flex-1">
                  <p className="text-sm font-medium text-muted-foreground">{t('materials.materialName')}</p>
                  {isEditing ? (
                    <Input
                      value={formData.name}
                      onChange={(e) => handleInputChange("name", e.target.value)}
                      placeholder={t('materials.enterName')}
                      className="mt-1"
                    />
                  ) : (
                    <h3 className="font-semibold">{material.name}</h3>
                  )}
                </div>
                {!isEditing && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => copyToClipboard(material.name, t('materials.materialName'))}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>
            
            <Separator />
            
            {/* SKU */}
            <div className="space-y-2">
              <div className="flex items-center justify-between group">
                <div className="flex-1">
                  <p className="text-sm font-medium text-muted-foreground">{t('materials.sku')}</p>
                  {isEditing ? (
                    <Input
                      value={formData.sku}
                      onChange={(e) => handleInputChange("sku", e.target.value)}
                      placeholder={t('materials.enterSku')}
                      className="mt-1"
                    />
                  ) : (
                    <div className="flex items-center gap-2">
                      <Tag className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-mono">{material.sku}</span>
                    </div>
                  )}
                </div>
                {!isEditing && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => copyToClipboard(material.sku, t('materials.sku'))}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>
            
            <Separator />
            
            {/* Type */}
            <div className="space-y-2">
              <div className="flex items-center justify-between group">
                <div className="flex-1">
                  <p className="text-sm font-medium text-muted-foreground">{t('common.type')}</p>
                  {isEditing ? (
                    <Select
                      value={formData.type || ""}
                      onValueChange={(value) => handleInputChange("type", value)}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder={t('materials.selectType')} />
                      </SelectTrigger>
                      <SelectContent>
                        {materialTypes?.map((type) => (
                          <SelectItem key={type} value={type}>
                            {te(type)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                      {te(material.type)}
                    </Badge>
                  )}
                </div>
                {!isEditing && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => copyToClipboard(material.type, t('common.type'))}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>
            
            <Separator />
            
            {/* Measure Unit */}
            <div className="space-y-2">
              <div className="flex items-center justify-between group">
                <div className="flex-1">
                  <p className="text-sm font-medium text-muted-foreground">{t('materials.unitOfMeasure')}</p>
                  {isEditing ? (
                    <Select
                      value={formData.measure_unit || "none"}
                      onValueChange={(value) => handleInputChange("measure_unit", value === "none" ? null : value)}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder={t('materials.selectUnit')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{t('common.none')}</SelectItem>
                        {unitOfMeasures?.map((unit) => (
                          <SelectItem key={unit} value={unit}>
                            {te(unit)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Ruler className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">
                        {material.measure_unit ? te(material.measure_unit) : t('materials.notSpecified')}
                      </span>
                    </div>
                  )}
                </div>
                {!isEditing && material.measure_unit && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => copyToClipboard(material.measure_unit!, t('materials.unitOfMeasure'))}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Additional Information */}
        <Card>
          <CardHeader>
            <CardTitle>{t('materials.additionalInformation')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Description */}
            <div className="space-y-2">
              <div className="flex items-start justify-between group">
                <div className="flex-1">
                  <p className="text-sm font-medium text-muted-foreground">{t('common.description')}</p>
                  {isEditing ? (
                    <Textarea
                      value={formData.description || ""}
                      onChange={(e) => handleInputChange("description", e.target.value || null)}
                      placeholder={t('materials.enterDescription')}
                      rows={4}
                      className="mt-1"
                    />
                  ) : (
                    <p className="text-sm mt-1">
                      {material.description || t('materials.noDescription')}
                    </p>
                  )}
                </div>
                {!isEditing && material.description && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="opacity-0 group-hover:opacity-100 transition-opacity mt-6"
                    onClick={() => copyToClipboard(material.description!, t('common.description'))}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>
            
            <Separator />
            
            {/* Created Date */}
            <div className="space-y-2">
              <div className="flex items-center justify-between group">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">{t('materials.createdDate')}</p>
                  <p className="text-sm">
                    {new Date(material.created_at).toLocaleDateString()}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => copyToClipboard(material.created_at, t('materials.createdDate'))}
                >
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
            </div>
            
            <Separator />
            
            {/* UUID */}
            <div className="space-y-2">
              <div className="flex items-center justify-between group">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">{t('materials.materialId')}</p>
                  <p className="text-xs font-mono text-muted-foreground">
                    {material.uuid}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => copyToClipboard(material.uuid, t('materials.materialId'))}
                >
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <MaterialInventorySection materialUuid={material.uuid} />
    </div>
  );
}