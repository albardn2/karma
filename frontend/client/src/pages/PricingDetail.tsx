import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { 
  ArrowLeft, 
  DollarSign, 
  Edit, 
  Trash2, 
  Copy, 
  Save, 
  X,
  Package,
  Calendar
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
import type { Pricing, PricingUpdateData } from "@/lib/types";
import { useLanguage } from "@/contexts/LanguageContext";

export default function PricingDetail() {
  const { uuid } = useParams<{ uuid: string }>();
  const { t } = useLanguage();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<PricingUpdateData>({
    price_per_unit: 0,
    currency: "",
  });

  // Fetch pricing details
  const { data: pricing, isLoading, error } = useQuery<Pricing>({
    queryKey: ["/pricing/", uuid],
    queryFn: async () => {
      return await apiRequest(`/pricing/${uuid}`);
    },
    enabled: !!uuid,
  });

  // Fetch material details
  const { data: material } = useQuery({
    queryKey: ["/material/", pricing?.material_uuid],
    queryFn: async () => {
      return await apiRequest(`/material/${pricing?.material_uuid}`);
    },
    enabled: !!pricing?.material_uuid,
  });

  // Fetch currencies for editing
  const { data: currencies } = useQuery<string[]>({
    queryKey: ["/payment/currencies"],
    queryFn: async () => {
      return await apiRequest("/payment/currencies");
    },
    enabled: isEditing,
  });

  // Update pricing mutation
  const updatePricingMutation = useMutation({
    mutationFn: async (data: PricingUpdateData) => {
      return await apiRequest(`/pricing/${uuid}`, { method: "PUT", body: data });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          return query.queryKey[0] === "/pricing/" || query.queryKey[0] === "/pricing/list";
        }
      });
      
      toast({
        title: t('common.success'),
        description: t('pricing.updatedSuccess'),
      });

      setIsEditing(false);
    },
    onError: () => {
      toast({
        title: t('common.error'),
        description: t('pricing.updateFailed'),
        variant: "destructive",
      });
    },
  });

  // Delete pricing mutation
  const deletePricingMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest(`/pricing/${uuid}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/pricing/"] });
      queryClient.refetchQueries({ queryKey: ["/pricing/"] });
      
      toast({
        title: t('common.success'),
        description: t('pricing.deletedSuccess'),
      });

      setLocation("/pricing");
    },
    onError: (error: any) => {
      toast({
        title: t('common.error'),
        description: error.message || t('pricing.deleteFailed'),
        variant: "destructive",
      });
    },
  });

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: t('pricing.copied'),
        description: t('pricing.copiedToClipboard', { label }),
      });
    } catch (err) {
      toast({
        title: t('common.error'),
        description: t('pricing.copyFailed'),
        variant: "destructive",
      });
    }
  };

  const handleEdit = () => {
    if (pricing) {
      setFormData({
        price_per_unit: pricing.price_per_unit,
        currency: pricing.currency,
      });
    }
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setFormData({
      price_per_unit: 0,
      currency: "",
    });
  };

  const handleSave = () => {
    updatePricingMutation.mutate(formData);
  };

  const handleInputChange = (field: keyof PricingUpdateData, value: string | number) => {
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

  if (error || !pricing) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">{t('pricing.notFound')}</h1>
          <Link href="/pricing">
            <Button>{t('pricing.backToPricing')}</Button>
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
          <Link href="/pricing">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 me-2" />
              {t('pricing.backToPricing')}
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <DollarSign className="h-6 w-6 text-[#5469D4]" />
            <h1 className="text-2xl font-bold">${pricing.price_per_unit.toLocaleString()}</h1>
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
                    <AlertDialogTitle>{t('pricing.deleteTitle')}</AlertDialogTitle>
                    <AlertDialogDescription>
                      {t('pricing.deleteConfirm')}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => deletePricingMutation.mutate()}
                      disabled={deletePricingMutation.isPending}
                      className="bg-red-600 hover:bg-red-700"
                    >
                      {deletePricingMutation.isPending ? t('common.deleting') : t('common.delete')}
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
                disabled={updatePricingMutation.isPending}
                className="bg-gradient-to-r from-[#5469D4] to-[#8B5CF6] hover:from-[#4F63D2] hover:to-[#8A5AF5]"
              >
                <Save className="h-4 w-4 me-2" />
                {updatePricingMutation.isPending ? t('common.saving') : t('common.save')}
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
            <CardTitle>{t('pricing.pricingInfo')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Price per Unit */}
            <div className="space-y-2">
              <div className="flex items-center justify-between group">
                <div className="flex-1">
                  <p className="text-sm font-medium text-muted-foreground">{t('pricing.pricePerUnit')}</p>
                  {isEditing ? (
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.price_per_unit}
                      onChange={(e) => handleInputChange("price_per_unit", parseFloat(e.target.value) || 0)}
                      placeholder={t('pricing.pricePerUnitPlaceholder')}
                      className="mt-1"
                    />
                  ) : (
                    <h3 className="font-semibold text-xl">${pricing.price_per_unit.toLocaleString()}</h3>
                  )}
                </div>
                {!isEditing && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => copyToClipboard(pricing.price_per_unit.toString(), t('pricing.pricePerUnit'))}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>
            
            <Separator />
            
            {/* Currency */}
            <div className="space-y-2">
              <div className="flex items-center justify-between group">
                <div className="flex-1">
                  <p className="text-sm font-medium text-muted-foreground">{t('common.currency')}</p>
                  {isEditing ? (
                    <Select
                      value={formData.currency}
                      onValueChange={(value) => handleInputChange("currency", value)}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder={t('pricing.selectCurrency')} />
                      </SelectTrigger>
                      <SelectContent>
                        {currencies?.map((currency) => (
                          <SelectItem key={currency} value={currency}>
                            {currency}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                      {pricing.currency}
                    </Badge>
                  )}
                </div>
                {!isEditing && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => copyToClipboard(pricing.currency, t('common.currency'))}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>
            
            <Separator />
            
            {/* Unit */}
            {pricing.unit && (
              <>
                <div className="space-y-2">
                  <div className="flex items-center justify-between group">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">{t('pricing.unitOfMeasure')}</p>
                      <p className="text-sm">{pricing.unit}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => copyToClipboard(pricing.unit!, t('pricing.unitOfMeasure'))}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                <Separator />
              </>
            )}
          </CardContent>
        </Card>

        {/* Additional Information */}
        <Card>
          <CardHeader>
            <CardTitle>{t('pricing.additionalInfo')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Material Information */}
            <div className="space-y-2">
              <div className="flex items-center justify-between group">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">{t('pricing.material')}</p>
                  <div className="flex items-center gap-2">
                    <Package className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">
                      {material ? `${material.name} (${material.sku})` : pricing.material_uuid}
                    </span>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => copyToClipboard(pricing.material_uuid, t('pricing.materialId'))}
                >
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
            </div>
            
            <Separator />
            
            {/* Created Date */}
            <div className="space-y-2">
              <div className="flex items-center justify-between group">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">{t('pricing.createdDate')}</p>
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">
                      {new Date(pricing.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => copyToClipboard(pricing.created_at, t('pricing.createdDate'))}
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
                  <p className="text-sm font-medium text-muted-foreground">{t('pricing.pricingId')}</p>
                  <p className="text-xs font-mono text-muted-foreground">
                    {pricing.uuid}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => copyToClipboard(pricing.uuid, t('pricing.pricingId'))}
                >
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}