import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
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
        title: "Success",
        description: "Fixed asset updated successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
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
        title: "Success",
        description: "Fixed asset deleted successfully",
      });
      navigate("/fixed-assets");
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied",
      description: `${label} copied to clipboard`,
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
            <h2 className="text-2xl font-bold mb-2">Fixed Asset Not Found</h2>
            <p className="text-gray-600 mb-4">The fixed asset you're looking for doesn't exist.</p>
            <Button onClick={() => navigate("/fixed-assets")}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Fixed Assets
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
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <div>
              <h1 className="text-2xl font-bold">{fixedAsset.name}</h1>
              <p className="text-sm text-muted-foreground">
                Fixed Asset Details
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
                  <X className="h-4 w-4 mr-2" />
                  Cancel
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={updateMutation.isPending}
                  className="bg-[#5469D4] hover:bg-[#4356C7] text-white"
                >
                  <Save className="h-4 w-4 mr-2" />
                  {updateMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => setIsEditing(true)}>
                  <Edit className="h-4 w-4 mr-2" />
                  Edit
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" className="text-red-600 hover:text-red-700">
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete Fixed Asset</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to delete "{fixedAsset.name}"? This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => deleteMutation.mutate()}
                        className="bg-red-600 hover:bg-red-700"
                      >
                        {deleteMutation.isPending ? "Deleting..." : "Delete"}
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
                Asset Overview
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Asset Name */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                <label className="font-medium">Asset Name</label>
                <div className="md:col-span-2 flex items-center gap-2">
                  {isEditing ? (
                    <Input
                      value={editData.name}
                      onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                      placeholder="Enter asset name"
                    />
                  ) : (
                    <>
                      <span className="flex-1">{fixedAsset.name}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(fixedAsset.name, "Asset name")}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {/* Description */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
                <label className="font-medium">Description</label>
                <div className="md:col-span-2 flex items-start gap-2">
                  {isEditing ? (
                    <Textarea
                      value={editData.description}
                      onChange={(e) => setEditData({ ...editData, description: e.target.value })}
                      placeholder="Enter asset description"
                      rows={3}
                    />
                  ) : (
                    <>
                      <span className="flex-1">{fixedAsset.description || "No description"}</span>
                      {fixedAsset.description && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(fixedAsset.description!, "Description")}
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
                <label className="font-medium">UUID</label>
                <div className="md:col-span-2 flex items-center gap-2">
                  <span className="flex-1 font-mono text-sm">{fixedAsset.uuid}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(fixedAsset.uuid, "UUID")}
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
                Financial Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Current Value */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                <label className="font-medium">Current Value</label>
                <div className="md:col-span-2 flex items-center gap-2">
                  <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                    ${fixedAsset.current_value.toLocaleString()}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(fixedAsset.current_value.toString(), "Current value")}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Total Price */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                <label className="font-medium">Total Purchase Price</label>
                <div className="md:col-span-2 flex items-center gap-2">
                  <span className="flex-1">${fixedAsset.total_price.toLocaleString()}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(fixedAsset.total_price.toString(), "Total price")}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Price per Unit */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                <label className="font-medium">Price per Unit</label>
                <div className="md:col-span-2 flex items-center gap-2">
                  {isEditing ? (
                    <Input
                      type="number"
                      step="0.01"
                      value={editData.price_per_unit}
                      onChange={(e) => setEditData({ ...editData, price_per_unit: e.target.value })}
                      placeholder="Enter price per unit"
                    />
                  ) : (
                    <>
                      <span className="flex-1">${fixedAsset.price_per_unit.toLocaleString()}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(fixedAsset.price_per_unit.toString(), "Price per unit")}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {/* Quantity */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                <label className="font-medium">Quantity</label>
                <div className="md:col-span-2 flex items-center gap-2">
                  {isEditing ? (
                    <Input
                      type="number"
                      step="0.01"
                      value={editData.quantity}
                      onChange={(e) => setEditData({ ...editData, quantity: e.target.value })}
                      placeholder="Enter quantity"
                    />
                  ) : (
                    <>
                      <span className="flex-1">{fixedAsset.quantity} {fixedAsset.unit}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(`${fixedAsset.quantity} ${fixedAsset.unit}`, "Quantity")}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {/* Depreciation Rate */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                <label className="font-medium">Annual Depreciation Rate</label>
                <div className="md:col-span-2 flex items-center gap-2">
                  {isEditing ? (
                    <Input
                      type="number"
                      step="0.01"
                      value={editData.annual_depreciation_rate}
                      onChange={(e) => setEditData({ ...editData, annual_depreciation_rate: e.target.value })}
                      placeholder="Enter depreciation rate"
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
                        onClick={() => copyToClipboard(fixedAsset.annual_depreciation_rate.toString(), "Depreciation rate")}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {/* Purchase Date */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                <label className="font-medium">Purchase Date</label>
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
                          "No purchase date"
                        )}
                      </span>
                      {fixedAsset.purchase_date && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(new Date(fixedAsset.purchase_date!).toLocaleDateString(), "Purchase date")}
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
              <CardTitle>Related Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Purchase Order Item UUID */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                <label className="font-medium">Purchase Order Item UUID</label>
                <div className="md:col-span-2 flex items-center gap-2">
                  <span className="flex-1 font-mono text-sm">
                    {fixedAsset.purchase_order_item_uuid || "Not linked"}
                  </span>
                  {fixedAsset.purchase_order_item_uuid && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(fixedAsset.purchase_order_item_uuid!, "Purchase order item UUID")}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>

              {/* Material UUID */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                <label className="font-medium">Material UUID</label>
                <div className="md:col-span-2 flex items-center gap-2">
                  <span className="flex-1 font-mono text-sm">
                    {fixedAsset.material_uuid || "Not linked"}
                  </span>
                  {fixedAsset.material_uuid && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(fixedAsset.material_uuid!, "Material UUID")}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>

              {/* Created By */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                <label className="font-medium">Created By</label>
                <div className="md:col-span-2 flex items-center gap-2">
                  <span className="flex-1 font-mono text-sm">
                    {fixedAsset.created_by_uuid || "System"}
                  </span>
                  {fixedAsset.created_by_uuid && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(fixedAsset.created_by_uuid!, "Created by UUID")}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>

              {/* Created At */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                <label className="font-medium">Created At</label>
                <div className="md:col-span-2 flex items-center gap-2">
                  <span className="flex-1">{new Date(fixedAsset.created_at).toLocaleString()}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(new Date(fixedAsset.created_at).toLocaleString(), "Created at")}
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