import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useLanguage } from "@/contexts/LanguageContext";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { 
  ArrowLeft, 
  Edit, 
  Trash2, 
  Save, 
  X, 
  Copy,
  Package2,
  Calendar,
  DollarSign,
  TrendingDown
} from "lucide-react";
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

interface FixedAsset {
  uuid: string;
  name: string;
  description?: string;
  purchase_date?: string;
  annual_depreciation_rate: number;
  purchase_order_item_uuid?: string;
  material_uuid?: string;
  quantity: number;
  price_per_unit: number;
  total_price: number;
  current_value: number;
  unit: string;
  created_by_uuid?: string;
  created_at: string;
  is_deleted: boolean;
}

export default function FixedAssetDetail() {
  const { t } = useLanguage();
  const { uuid } = useParams<{ uuid: string }>();
  const [, navigate] = useLocation();
  const [isEditing, setIsEditing] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [editData, setEditData] = useState({
    name: "",
    description: "",
    purchase_date: "",
    annual_depreciation_rate: "",
    quantity: "",
    price_per_unit: "",
  });

  // Fetch fixed asset data
  const { data: fixedAsset, isLoading, error } = useQuery<FixedAsset>({
    queryKey: ["/fixed-asset/", uuid],
    queryFn: async () => {
      const data = await apiRequest(`/fixed-asset/${uuid}`);
      
      // Initialize edit data when asset loads
      setEditData({
        name: data.name,
        description: data.description || "",
        purchase_date: data.purchase_date ? data.purchase_date.split('T')[0] : "",
        annual_depreciation_rate: data.annual_depreciation_rate.toString(),
        quantity: data.quantity.toString(),
        price_per_unit: data.price_per_unit.toString(),
      });
      
      return data;
    },
    enabled: !!uuid,
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async (data: typeof editData) => {
      const payload = {
        name: data.name,
        description: data.description || null,
        purchase_date: data.purchase_date || null,
        annual_depreciation_rate: parseFloat(data.annual_depreciation_rate),
        quantity: parseFloat(data.quantity),
        price_per_unit: parseFloat(data.price_per_unit),
      };

      return await apiRequest(`/fixed-asset/${uuid}`, { method: "PUT", body: payload });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/fixed-asset/", uuid] });
      queryClient.invalidateQueries({ queryKey: ["/fixed-asset/"] });
      setIsEditing(false);
      toast({
        title: t('common.success'),
        description: t('fixedAssets.updateSuccess'),
      });
    },
    onError: (error: Error) => {
      toast({
        title: t('common.error'),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest(`/fixed-asset/${uuid}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/fixed-asset/"] });
      toast({
        title: t('common.success'),
        description: t('fixedAssets.deleteSuccess'),
      });
      navigate("/fixed-assets");
    },
    onError: (error: Error) => {
      toast({
        title: t('common.error'),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: t('fixedAssets.copied'),
      description: t('fixedAssets.copiedToClipboard', { label }),
    });
  };

  const handleSave = () => {
    updateMutation.mutate(editData);
  };

  const handleCancel = () => {
    if (fixedAsset) {
      setEditData({
        name: fixedAsset.name,
        description: fixedAsset.description || "",
        purchase_date: fixedAsset.purchase_date ? fixedAsset.purchase_date.split('T')[0] : "",
        annual_depreciation_rate: fixedAsset.annual_depreciation_rate.toString(),
        quantity: fixedAsset.quantity.toString(),
        price_per_unit: fixedAsset.price_per_unit.toString(),
      });
    }
    setIsEditing(false);
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="container mx-auto px-4 py-6">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-gray-200 rounded w-1/4"></div>
            <div className="h-64 bg-gray-200 rounded"></div>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (error || !fixedAsset) {
    return (
      <AppLayout>
        <div className="container mx-auto px-4 py-6">
          <div className="text-center py-16">
            <Package2 className="h-16 w-16 mx-auto mb-4 text-gray-400" />
            <h2 className="text-2xl font-bold mb-2">{t('fixedAssets.notFound')}</h2>
            <p className="text-gray-600 mb-4">{t('fixedAssets.notFoundDescription')}</p>
            <Button onClick={() => navigate("/fixed-assets")}>
              <ArrowLeft className="h-4 w-4 me-2" />
              {t('fixedAssets.backToAssets')}
            </Button>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Button variant="outline" onClick={() => navigate("/fixed-assets")}>
              <ArrowLeft className="h-4 w-4 me-2" />
              {t('common.back')}
            </Button>
            <div>
              <h1 className="text-2xl font-bold">{fixedAsset.name}</h1>
              <p className="text-sm text-muted-foreground">
                {t('fixedAssets.detailsTitle')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isEditing ? (
              <>
                <Button
                  variant="outline"
                  onClick={handleCancel}
                  disabled={updateMutation.isPending}
                >
                  <X className="h-4 w-4 me-2" />
                  {t('common.cancel')}
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={updateMutation.isPending}
                  className="bg-[#5469D4] hover:bg-[#4356C7] text-white"
                >
                  <Save className="h-4 w-4 me-2" />
                  {updateMutation.isPending ? t('common.saving') : t('fixedAssets.saveChanges')}
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => setIsEditing(true)}>
                  <Edit className="h-4 w-4 me-2" />
                  {t('common.edit')}
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" className="text-red-600 hover:text-red-700">
                      <Trash2 className="h-4 w-4 me-2" />
                      {t('common.delete')}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t('fixedAssets.deleteTitle')}</AlertDialogTitle>
                      <AlertDialogDescription>
                        {t('fixedAssets.deleteConfirmDescription', { name: fixedAsset.name })}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => deleteMutation.mutate()}
                        className="bg-red-600 hover:bg-red-700"
                      >
                        {deleteMutation.isPending ? t('common.deleting') : t('common.delete')}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            )}
          </div>
        </div>

        {/* Main Content */}
        <div className="grid gap-6">
          {/* Asset Overview */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package2 className="h-5 w-5" />
                {t('fixedAssets.assetOverview')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Asset Name */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                <label className="font-medium">{t('fixedAssets.assetName')}</label>
                <div className="md:col-span-2 flex items-center gap-2">
                  {isEditing ? (
                    <Input
                      value={editData.name}
                      onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                      placeholder={t('fixedAssets.enterAssetName')}
                    />
                  ) : (
                    <>
                      <span className="flex-1">{fixedAsset.name}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(fixedAsset.name, t('fixedAssets.copyLabelAssetName'))}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {/* Description */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
                <label className="font-medium">{t('common.description')}</label>
                <div className="md:col-span-2 flex items-start gap-2">
                  {isEditing ? (
                    <Textarea
                      value={editData.description}
                      onChange={(e) => setEditData({ ...editData, description: e.target.value })}
                      placeholder={t('fixedAssets.enterDescription')}
                      rows={3}
                    />
                  ) : (
                    <>
                      <span className="flex-1">{fixedAsset.description || t('fixedAssets.noDescription')}</span>
                      {fixedAsset.description && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(fixedAsset.description!, t('fixedAssets.copyLabelDescription'))}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* UUID */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                <label className="font-medium">{t('fixedAssets.uuid')}</label>
                <div className="md:col-span-2 flex items-center gap-2">
                  <span className="flex-1 font-mono text-sm">{fixedAsset.uuid}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(fixedAsset.uuid, t('fixedAssets.copyLabelUuid'))}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Financial Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                {t('fixedAssets.financialInformation')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Current Value */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                <label className="font-medium">{t('fixedAssets.currentValue')}</label>
                <div className="md:col-span-2 flex items-center gap-2">
                  <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                    ${fixedAsset.current_value.toLocaleString()}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(fixedAsset.current_value.toString(), t('fixedAssets.copyLabelCurrentValue'))}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Total Price */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                <label className="font-medium">{t('fixedAssets.totalPurchasePrice')}</label>
                <div className="md:col-span-2 flex items-center gap-2">
                  <span className="flex-1">${fixedAsset.total_price.toLocaleString()}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(fixedAsset.total_price.toString(), t('fixedAssets.copyLabelTotalPrice'))}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Price per Unit */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                <label className="font-medium">{t('fixedAssets.pricePerUnit')}</label>
                <div className="md:col-span-2 flex items-center gap-2">
                  {isEditing ? (
                    <Input
                      type="number"
                      step="0.01"
                      value={editData.price_per_unit}
                      onChange={(e) => setEditData({ ...editData, price_per_unit: e.target.value })}
                      placeholder={t('fixedAssets.enterPricePerUnit')}
                    />
                  ) : (
                    <>
                      <span className="flex-1">${fixedAsset.price_per_unit.toLocaleString()}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(fixedAsset.price_per_unit.toString(), t('fixedAssets.copyLabelPricePerUnit'))}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {/* Quantity */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                <label className="font-medium">{t('common.quantity')}</label>
                <div className="md:col-span-2 flex items-center gap-2">
                  {isEditing ? (
                    <Input
                      type="number"
                      step="0.01"
                      value={editData.quantity}
                      onChange={(e) => setEditData({ ...editData, quantity: e.target.value })}
                      placeholder={t('fixedAssets.enterQuantity')}
                    />
                  ) : (
                    <>
                      <span className="flex-1">{fixedAsset.quantity} {fixedAsset.unit}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(`${fixedAsset.quantity} ${fixedAsset.unit}`, t('fixedAssets.copyLabelQuantity'))}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {/* Depreciation Rate */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                <label className="font-medium">{t('fixedAssets.annualDepreciationRate')}</label>
                <div className="md:col-span-2 flex items-center gap-2">
                  {isEditing ? (
                    <Input
                      type="number"
                      step="0.01"
                      value={editData.annual_depreciation_rate}
                      onChange={(e) => setEditData({ ...editData, annual_depreciation_rate: e.target.value })}
                      placeholder={t('fixedAssets.enterDepreciationRate')}
                    />
                  ) : (
                    <>
                      <Badge variant="secondary" className="flex items-center gap-1">
                        <TrendingDown className="h-3 w-3" />
                        {fixedAsset.annual_depreciation_rate}%
                      </Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(fixedAsset.annual_depreciation_rate.toString(), t('fixedAssets.copyLabelDepreciationRate'))}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {/* Purchase Date */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                <label className="font-medium">{t('fixedAssets.purchaseDate')}</label>
                <div className="md:col-span-2 flex items-center gap-2">
                  {isEditing ? (
                    <Input
                      type="date"
                      value={editData.purchase_date}
                      onChange={(e) => setEditData({ ...editData, purchase_date: e.target.value })}
                    />
                  ) : (
                    <>
                      <span className="flex-1 flex items-center gap-2">
                        {fixedAsset.purchase_date ? (
                          <>
                            <Calendar className="h-4 w-4" />
                            {new Date(fixedAsset.purchase_date).toLocaleDateString()}
                          </>
                        ) : (
                          t('fixedAssets.noPurchaseDate')
                        )}
                      </span>
                      {fixedAsset.purchase_date && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(new Date(fixedAsset.purchase_date!).toLocaleDateString(), t('fixedAssets.copyLabelPurchaseDate'))}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Related UUIDs */}
          <Card>
            <CardHeader>
              <CardTitle>{t('fixedAssets.relatedInformation')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Purchase Order Item UUID */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                <label className="font-medium">{t('fixedAssets.purchaseOrderItemUuid')}</label>
                <div className="md:col-span-2 flex items-center gap-2">
                  <span className="flex-1 font-mono text-sm">
                    {fixedAsset.purchase_order_item_uuid || t('fixedAssets.notLinked')}
                  </span>
                  {fixedAsset.purchase_order_item_uuid && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(fixedAsset.purchase_order_item_uuid!, t('fixedAssets.copyLabelPurchaseOrderItemUuid'))}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>

              {/* Material UUID */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                <label className="font-medium">{t('fixedAssets.materialUuid')}</label>
                <div className="md:col-span-2 flex items-center gap-2">
                  <span className="flex-1 font-mono text-sm">
                    {fixedAsset.material_uuid || t('fixedAssets.notLinked')}
                  </span>
                  {fixedAsset.material_uuid && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(fixedAsset.material_uuid!, t('fixedAssets.copyLabelMaterialUuid'))}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>

              {/* Created By */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                <label className="font-medium">{t('fixedAssets.createdBy')}</label>
                <div className="md:col-span-2 flex items-center gap-2">
                  <span className="flex-1 font-mono text-sm">
                    {fixedAsset.created_by_uuid || t('fixedAssets.system')}
                  </span>
                  {fixedAsset.created_by_uuid && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(fixedAsset.created_by_uuid!, t('fixedAssets.copyLabelCreatedBy'))}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>

              {/* Created At */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                <label className="font-medium">{t('common.createdAt')}</label>
                <div className="md:col-span-2 flex items-center gap-2">
                  <span className="flex-1">{new Date(fixedAsset.created_at).toLocaleString()}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(new Date(fixedAsset.created_at).toLocaleString(), t('fixedAssets.copyLabelCreatedAt'))}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}