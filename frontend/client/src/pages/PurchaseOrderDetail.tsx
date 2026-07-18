import { useState, useEffect } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Edit3, Save, X, Trash2, Copy, Check } from "lucide-react";
import { format } from "date-fns";
import { toast } from "@/hooks/use-toast";

interface PurchaseOrderItem {
  uuid: string;
  created_by_uuid?: string;
  purchase_order_uuid: string;
  material_uuid: string;
  material_name: string;
  quantity: number;
  price_per_unit: number;
  currency: string;
  unit: string;
  quantity_received: number;
  is_fulfilled: boolean;
  fulfilled_at?: string;
  created_at: string;
  is_deleted: boolean;
  total_price: number;
}

interface PurchaseOrder {
  uuid: string;
  created_by_uuid?: string;
  vendor_uuid: string;
  currency: string;
  status: string;
  created_at: string;
  is_deleted: boolean;
  notes?: string;
  payout_due_date?: string;
  total_amount: number;
  total_adjusted_amount: number;
  net_amount_paid: number;
  net_amount_due: number;
  is_paid: boolean;
  is_overdue?: boolean;
  is_fulfilled: boolean;
  fulfilled_at?: string;
  purchase_order_items: PurchaseOrderItem[];
}

interface FulfillItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: PurchaseOrderItem | null;
  onFulfill: (data: { items: Array<{ purchase_order_item_uuid: string; warehouse_uuid?: string; inventory_uuid?: string }> }) => void;
  isLoading: boolean;
}

function FulfillItemModal({ isOpen, onClose, item, onFulfill, isLoading }: FulfillItemModalProps) {
  const [warehouseUuid, setWarehouseUuid] = useState("");
  const [inventoryUuid, setInventoryUuid] = useState("");
  const [useWarehouse, setUseWarehouse] = useState(true);

  // Fetch warehouses
  const { data: warehousesData } = useQuery({
    queryKey: ["/warehouse/"],
    queryFn: () => apiRequest("/warehouse/?per_page=100"),
    enabled: isOpen && useWarehouse,
  });

  // Fetch inventory
  const { data: inventoryData } = useQuery({
    queryKey: ["/inventory/"],
    queryFn: () => apiRequest("/inventory/?per_page=100"),
    enabled: isOpen && !useWarehouse,
  });

  const warehouses = warehousesData?.warehouses || [];
  const inventories = inventoryData?.inventories || [];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!item) return;

    const fulfillData = {
      items: [{
        purchase_order_item_uuid: item.uuid,
        ...(useWarehouse && warehouseUuid ? { warehouse_uuid: warehouseUuid } : {}),
        ...(!useWarehouse && inventoryUuid ? { inventory_uuid: inventoryUuid } : {}),
      }]
    };

    // Validate that either warehouse or inventory is provided
    if ((!useWarehouse && !inventoryUuid) || (useWarehouse && !warehouseUuid)) {
      toast({
        title: "Error",
        description: "Please select either a warehouse or inventory",
        variant: "destructive",
      });
      return;
    }

    onFulfill(fulfillData);
  };

  const resetForm = () => {
    setWarehouseUuid("");
    setInventoryUuid("");
    setUseWarehouse(true);
  };

  useEffect(() => {
    if (!isOpen) {
      resetForm();
    }
  }, [isOpen]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Fulfill Item</DialogTitle>
          <p className="text-sm text-gray-500">{item?.material_name}</p>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Toggle between Warehouse and Inventory */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Select By</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={useWarehouse ? "default" : "outline"}
                size="sm"
                onClick={() => setUseWarehouse(true)}
                className="flex-1"
              >
                Warehouse
              </Button>
              <Button
                type="button"
                variant={!useWarehouse ? "default" : "outline"}
                size="sm"
                onClick={() => setUseWarehouse(false)}
                className="flex-1"
              >
                Inventory
              </Button>
            </div>
          </div>

          {/* Warehouse Selection */}
          {useWarehouse && (
            <div className="space-y-2">
              <Label htmlFor="warehouse" className="text-sm font-medium">
                Warehouse
              </Label>
              <Select value={warehouseUuid} onValueChange={setWarehouseUuid}>
                <SelectTrigger>
                  <SelectValue placeholder="Select warehouse" />
                </SelectTrigger>
                <SelectContent>
                  {warehouses.map((warehouse: any) => (
                    <SelectItem key={warehouse.uuid} value={warehouse.uuid}>
                      {warehouse.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Inventory Selection */}
          {!useWarehouse && (
            <div className="space-y-2">
              <Label htmlFor="inventory" className="text-sm font-medium">
                Inventory
              </Label>
              <Select value={inventoryUuid} onValueChange={setInventoryUuid}>
                <SelectTrigger>
                  <SelectValue placeholder="Select inventory" />
                </SelectTrigger>
                <SelectContent>
                  {inventories.map((inventory: any) => (
                    <SelectItem key={inventory.uuid} value={inventory.uuid}>
                      {inventory.material_name} - {inventory.warehouse_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Submit Buttons */}
          <div className="flex gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isLoading}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isLoading}
              className="flex-1 bg-[#5469D4] hover:bg-[#4356C7] text-white"
            >
              {isLoading ? "Fulfilling..." : "Fulfill Item"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function PurchaseOrderDetail() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const [isEditing, setIsEditing] = useState(false);
  const [editedNotes, setEditedNotes] = useState("");
  const [editedPayoutDueDate, setEditedPayoutDueDate] = useState("");
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<PurchaseOrderItem | null>(null);
  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [fulfillModalOpen, setFulfillModalOpen] = useState(false);
  const [itemToFulfill, setItemToFulfill] = useState<PurchaseOrderItem | null>(null);

  const { data: purchaseOrder, isLoading, error } = useQuery<PurchaseOrder>({
    queryKey: ["/purchase-order", params?.id],
    queryFn: () => apiRequest(`/purchase-order/${params?.id}`),
    enabled: !!params?.id,
  });

  const purchaseOrderItems = purchaseOrder?.purchase_order_items || [];

  const updateMutation = useMutation({
    mutationFn: (data: { notes?: string; payout_due_date?: string }) =>
      apiRequest(`/purchase-order/${params?.id}`, {
        method: "PUT",
        body: data,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/purchase-order", params?.id] });
      setIsEditing(false);
      toast({
        title: "Success",
        description: "Purchase order updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update purchase order",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/purchase-order/${params?.id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/purchase-order"] });
      toast({
        title: "Success",
        description: "Purchase order deleted successfully",
      });
      setLocation("/purchase-orders");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete purchase order",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (purchaseOrder) {
      setEditedNotes(purchaseOrder.notes || "");
      setEditedPayoutDueDate(
        purchaseOrder.payout_due_date
          ? format(new Date(purchaseOrder.payout_due_date), "yyyy-MM-dd'T'HH:mm")
          : ""
      );
    }
  }, [purchaseOrder]);

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleSave = () => {
    const updateData: { notes?: string; payout_due_date?: string } = {};
    
    if (editedNotes !== purchaseOrder?.notes) {
      updateData.notes = editedNotes || null;
    }
    
    if (editedPayoutDueDate) {
      const isoDate = new Date(editedPayoutDueDate).toISOString();
      if (isoDate !== purchaseOrder?.payout_due_date) {
        updateData.payout_due_date = isoDate;
      }
    }

    if (Object.keys(updateData).length > 0) {
      updateMutation.mutate(updateData);
    } else {
      setIsEditing(false);
    }
  };

  const handleCancel = () => {
    setEditedNotes(purchaseOrder?.notes || "");
    setEditedPayoutDueDate(
      purchaseOrder?.payout_due_date
        ? format(new Date(purchaseOrder.payout_due_date), "yyyy-MM-dd'T'HH:mm")
        : ""
    );
    setIsEditing(false);
  };

  const handleDelete = () => {
    if (window.confirm("Are you sure you want to delete this purchase order?")) {
      deleteMutation.mutate();
    }
  };

  const copyToClipboard = (text: string, fieldName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);
    toast({
      title: "Copied",
      description: `${fieldName} copied to clipboard`,
    });
  };

  const handleItemRowClick = (item: PurchaseOrderItem) => {
    setSelectedItem(item);
    setItemModalOpen(true);
  };

  const fulfillItemMutation = useMutation({
    mutationFn: (data: { items: Array<{ purchase_order_item_uuid: string; warehouse_uuid?: string; inventory_uuid?: string }> }) =>
      apiRequest(`/purchase-order-item/fulfill-items`, {
        method: "POST",
        body: data,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/purchase-order", params?.id] });
      setFulfillModalOpen(false);
      setItemToFulfill(null);
      toast({
        title: "Success",
        description: "Item fulfilled successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to fulfill item",
        variant: "destructive",
      });
    },
  });

  const unfulfillItemMutation = useMutation({
    mutationFn: (data: { items: Array<{ purchase_order_item_uuid: string }> }) =>
      apiRequest(`/purchase-order-item/unfulfill-items`, {
        method: "POST",
        body: data,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/purchase-order", params?.id] });
      toast({
        title: "Success",
        description: "Item unfulfilled successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to unfulfill item",
        variant: "destructive",
      });
    },
  });

  const handleFulfillToggle = (item: PurchaseOrderItem, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent row click
    
    if (item.is_fulfilled) {
      // Unfulfill directly
      unfulfillItemMutation.mutate({
        items: [{ purchase_order_item_uuid: item.uuid }]
      });
    } else {
      // Open modal for fulfill with warehouse/inventory selection
      setItemToFulfill(item);
      setFulfillModalOpen(true);
    }
  };

  // Update selectedItem when items data changes to reflect current state
  useEffect(() => {
    if (selectedItem && purchaseOrderItems.length > 0) {
      const updatedItem = purchaseOrderItems.find(item => item.uuid === selectedItem.uuid);
      if (updatedItem) {
        setSelectedItem(updatedItem);
      }
    }
  }, [purchaseOrderItems, selectedItem]);

  if (isLoading) {
    return (
      <AppLayout>
        <div className="p-8 max-w-7xl mx-auto space-y-8">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/3"></div>
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (error) {
    return (
      <AppLayout>
        <div className="p-8 text-center">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Error Loading Purchase Order
          </h1>
          <p className="text-red-600 dark:text-red-400">
            Failed to load purchase order: {error?.message}
          </p>
          <Button onClick={() => setLocation("/purchase-orders")} variant="outline">
            <ArrowLeft className="h-4 w-4 me-2" />
            Back to Purchase Orders
          </Button>
        </div>
      </AppLayout>
    );
  }

  if (!purchaseOrder) {
    return (
      <AppLayout>
        <div className="p-8 text-center">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Purchase Order Not Found
          </h1>
          <Button onClick={() => setLocation("/purchase-orders")} variant="outline">
            <ArrowLeft className="h-4 w-4 me-2" />
            Back to Purchase Orders
          </Button>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-8 max-w-7xl mx-auto space-y-8">
        {/* Overdue Banner */}
        {purchaseOrder.is_overdue && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ms-3">
                <h3 className="text-sm font-medium text-red-800 dark:text-red-200">
                  Payment Overdue
                </h3>
                <p className="mt-1 text-sm text-red-700 dark:text-red-300">
                  This purchase order payment is past due. Please review and process payment immediately.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLocation("/purchase-orders")}
            >
              <ArrowLeft className="h-4 w-4 me-2" />
              Back
            </Button>
            <div>
              <h1 className="text-3xl font-semibold text-gray-900 dark:text-gray-100">
                Purchase Order
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {purchaseOrder.uuid}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {/* Create Payout Button */}
            {!purchaseOrder.is_paid && !isEditing && (
              <Button
                onClick={() => setLocation(`/payouts/create?referrer=/purchase-orders/${params?.id}&purchase_order_uuid=${purchaseOrder.uuid}&amount=${purchaseOrder.net_amount_due}&currency=${purchaseOrder.currency}`)}
                className="bg-[#5469D4] hover:bg-[#4356C7] text-white"
                size="sm"
              >
                Create Payout
              </Button>
            )}
            
            {!isEditing ? (
              <>
                <Button onClick={handleEdit} variant="outline" size="sm">
                  <Edit3 className="h-4 w-4 me-2" />
                  Edit
                </Button>
                <Button 
                  onClick={handleDelete}
                  variant="outline" 
                  size="sm"
                  className="text-red-600 border-red-600 hover:bg-red-50 dark:text-red-400 dark:border-red-400 dark:hover:bg-red-900/20"
                  disabled={deleteMutation.isPending}
                >
                  <Trash2 className="h-4 w-4 me-2" />
                  Delete
                </Button>
              </>
            ) : (
              <>
                <Button onClick={handleCancel} variant="outline" size="sm">
                  <X className="h-4 w-4 me-2" />
                  Cancel
                </Button>
                <Button 
                  onClick={handleSave} 
                  disabled={updateMutation.isPending}
                  size="sm"
                  className="bg-[#5469D4] hover:bg-[#4356C7]"
                >
                  <Save className="h-4 w-4 me-2" />
                  Save
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Main Information */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Order Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Status Badges */}
                <div className="flex flex-wrap gap-3">
                  <Badge 
                    className={`text-xs ${
                      purchaseOrder.status === "completed"
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300'
                        : purchaseOrder.status === "pending"
                        ? 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-300'
                        : 'bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-900/20 dark:text-gray-300'
                    }`}
                  >
                    Status: {purchaseOrder.status}
                  </Badge>
                  
                  <Badge 
                    className={`text-xs ${
                      purchaseOrder.is_fulfilled
                        ? 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300'
                        : 'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/20 dark:text-orange-300'
                    }`}
                  >
                    {purchaseOrder.is_fulfilled ? "Fulfilled" : "Unfulfilled"}
                  </Badge>

                  {purchaseOrder.is_overdue && (
                    <Badge className="text-xs bg-red-100 text-red-800 border-red-200 dark:bg-red-900/20 dark:text-red-300">
                      Payment Overdue
                    </Badge>
                  )}

                  <Badge 
                    className={`text-xs ${
                      purchaseOrder.is_paid
                        ? 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/20 dark:text-green-300'
                        : 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-300'
                    }`}
                  >
                    {purchaseOrder.is_paid ? "Paid" : "Unpaid"}
                  </Badge>
                </div>

                {/* Financial Information Grid */}
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <Label className="text-sm font-medium text-gray-500 dark:text-gray-400">Total Amount</Label>
                    <p className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
                      ${purchaseOrder.total_amount?.toFixed(2) || '0.00'}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{purchaseOrder.currency}</p>
                  </div>
                  
                  <div>
                    <Label className="text-sm font-medium text-gray-500 dark:text-gray-400">Adjusted Amount</Label>
                    <p className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
                      ${purchaseOrder.total_adjusted_amount?.toFixed(2) || '0.00'}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{purchaseOrder.currency}</p>
                  </div>
                  
                  <div>
                    <Label className="text-sm font-medium text-gray-500 dark:text-gray-400">Amount Paid</Label>
                    <p className="text-xl font-medium text-green-600 dark:text-green-400">
                      ${purchaseOrder.net_amount_paid?.toFixed(2) || '0.00'}
                    </p>
                  </div>
                  
                  <div>
                    <Label className="text-sm font-medium text-gray-500 dark:text-gray-400">Amount Due</Label>
                    <p className={`text-xl font-medium ${
                      (purchaseOrder.net_amount_due || 0) > 0 
                        ? 'text-red-600 dark:text-red-400' 
                        : 'text-gray-900 dark:text-gray-100'
                    }`}>
                      ${purchaseOrder.net_amount_due?.toFixed(2) || '0.00'}
                    </p>
                  </div>
                </div>

                {/* Due Date Section */}
                <div>
                  <Label className="text-sm font-medium text-gray-500 dark:text-gray-400">Payout Due Date</Label>
                  {isEditing ? (
                    <div className="mt-2">
                      <Input
                        id="payout_due_date"
                        type="datetime-local"
                        value={editedPayoutDueDate}
                        onChange={(e) => setEditedPayoutDueDate(e.target.value)}
                      />
                    </div>
                  ) : (
                    <div className="mt-2 group cursor-pointer" onClick={() => copyToClipboard(purchaseOrder.payout_due_date ? format(new Date(purchaseOrder.payout_due_date), 'PPpp') : "No due date set", "Payout Due Date")}>
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-gray-900 dark:text-gray-100">
                          {purchaseOrder.payout_due_date 
                            ? format(new Date(purchaseOrder.payout_due_date), 'PPpp')
                            : "No due date set"
                          }
                        </p>
                        <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity">
                          {copiedField === "Payout Due Date" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Notes Section */}
                <div>
                  <Label className="text-sm font-medium text-gray-500 dark:text-gray-400">Notes</Label>
                  {isEditing ? (
                    <div className="mt-2">
                      <Input
                        value={editedNotes}
                        onChange={(e) => setEditedNotes(e.target.value)}
                        placeholder="Add notes..."
                        className="w-full"
                      />
                    </div>
                  ) : (
                    <div className="mt-2 group cursor-pointer" onClick={() => copyToClipboard(purchaseOrder.notes || "No notes", "Notes")}>
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-gray-900 dark:text-gray-100">
                          {purchaseOrder.notes || "No notes"}
                        </p>
                        <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity">
                          {copiedField === "Notes" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="group cursor-pointer" onClick={() => copyToClipboard(purchaseOrder.uuid, "Purchase Order UUID")}>
                  <Label className="text-sm font-medium text-gray-500 dark:text-gray-400">Purchase Order UUID</Label>
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-900 dark:text-gray-100 break-all">
                      {purchaseOrder.uuid}
                    </p>
                    <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity">
                      {copiedField === "Purchase Order UUID" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>

                <div className="group cursor-pointer" onClick={() => copyToClipboard(purchaseOrder.vendor_uuid, "Vendor UUID")}>
                  <Label className="text-sm font-medium text-gray-500 dark:text-gray-400">Vendor UUID</Label>
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-900 dark:text-gray-100 break-all">
                      {purchaseOrder.vendor_uuid}
                    </p>
                    <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity">
                      {copiedField === "Vendor UUID" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>

                {purchaseOrder.created_by_uuid && (
                  <div className="group cursor-pointer" onClick={() => copyToClipboard(purchaseOrder.created_by_uuid, "Created By UUID")}>
                    <Label className="text-sm font-medium text-gray-500 dark:text-gray-400">Created By UUID</Label>
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-gray-900 dark:text-gray-100 break-all">
                        {purchaseOrder.created_by_uuid}
                      </p>
                      <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity">
                        {copiedField === "Created By UUID" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                )}

                <div className="group cursor-pointer" onClick={() => copyToClipboard(purchaseOrder.currency, "Currency")}>
                  <Label className="text-sm font-medium text-gray-500 dark:text-gray-400">Currency</Label>
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-900 dark:text-gray-100">
                      {purchaseOrder.currency}
                    </p>
                    <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity">
                      {copiedField === "Currency" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>

                <div className="group cursor-pointer" onClick={() => copyToClipboard(format(new Date(purchaseOrder.created_at), 'PPpp'), "Created At")}>
                  <Label className="text-sm font-medium text-gray-500 dark:text-gray-400">Created At</Label>
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-900 dark:text-gray-100">
                      {format(new Date(purchaseOrder.created_at), 'PPpp')}
                    </p>
                    <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity">
                      {copiedField === "Created At" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>

                {purchaseOrder.fulfilled_at && (
                  <div className="group cursor-pointer" onClick={() => copyToClipboard(format(new Date(purchaseOrder.fulfilled_at), 'PPpp'), "Fulfilled At")}>
                    <Label className="text-sm font-medium text-gray-500 dark:text-gray-400">Fulfilled At</Label>
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-gray-900 dark:text-gray-100">
                        {format(new Date(purchaseOrder.fulfilled_at), 'PPpp')}
                      </p>
                      <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity">
                        {copiedField === "Fulfilled At" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>


          </div>
        </div>

        {/* Purchase Order Items - Full Width */}
        <Card className="mt-8">
          <CardHeader>
            <CardTitle className="text-lg">Order Items</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="animate-pulse">
                    <div className="h-16 bg-gray-200 dark:bg-gray-700 rounded"></div>
                  </div>
                ))}
              </div>
            ) : !Array.isArray(purchaseOrderItems) || purchaseOrderItems.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-500 dark:text-gray-400">No items found for this purchase order</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b border-gray-200 dark:border-gray-700">
                    <tr>
                      <th className="text-start py-3 text-sm font-medium text-gray-500 dark:text-gray-400">Material</th>
                      <th className="text-start py-3 text-sm font-medium text-gray-500 dark:text-gray-400">Quantity</th>
                      <th className="text-start py-3 text-sm font-medium text-gray-500 dark:text-gray-400">Unit Price</th>
                      <th className="text-start py-3 text-sm font-medium text-gray-500 dark:text-gray-400">Total</th>
                      <th className="text-start py-3 text-sm font-medium text-gray-500 dark:text-gray-400">Received</th>
                      <th className="text-start py-3 text-sm font-medium text-gray-500 dark:text-gray-400">Status</th>
                      <th className="text-start py-3 text-sm font-medium text-gray-500 dark:text-gray-400">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {purchaseOrderItems.map((item) => (
                      <tr 
                        key={item.uuid} 
                        className="hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer"
                        onClick={() => handleItemRowClick(item)}
                      >
                        <td className="py-4">
                          <div>
                            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                              {item.material_name}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {item.material_uuid.substring(0, 8)}...
                            </p>
                          </div>
                        </td>
                        <td className="py-4">
                          <div className="text-sm text-gray-900 dark:text-gray-100">
                            {item.quantity} {item.unit}
                          </div>
                        </td>
                        <td className="py-4">
                          <div className="text-sm text-gray-900 dark:text-gray-100">
                            ${item.price_per_unit.toFixed(2)}
                          </div>
                        </td>
                        <td className="py-4">
                          <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            ${item.total_price.toFixed(2)}
                          </div>
                        </td>
                        <td className="py-4">
                          <div className="text-sm text-gray-900 dark:text-gray-100">
                            {item.quantity_received} {item.unit}
                          </div>
                          {item.quantity_received > 0 && (
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              {Math.round((item.quantity_received / item.quantity) * 100)}% received
                            </div>
                          )}
                        </td>
                        <td className="py-4">
                          <Badge 
                            className={`text-xs ${
                              item.is_fulfilled
                                ? 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300'
                                : 'bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-900/20 dark:text-gray-300'
                            }`}
                          >
                            {item.is_fulfilled ? "Fulfilled" : "Pending"}
                          </Badge>
                          {item.fulfilled_at && (
                            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                              {format(new Date(item.fulfilled_at), 'MMM d, yyyy')}
                            </div>
                          )}
                        </td>
                        <td className="py-4">
                          <Button
                            size="sm"
                            variant={item.is_fulfilled ? "outline" : "default"}
                            onClick={(e) => handleFulfillToggle(item, e)}
                            disabled={fulfillItemMutation.isPending || unfulfillItemMutation.isPending}
                            className={`text-xs ${
                              item.is_fulfilled 
                                ? 'hover:bg-orange-50 hover:text-orange-600 hover:border-orange-300 dark:hover:bg-orange-900/20 dark:hover:text-orange-400' 
                                : 'bg-[#5469D4] hover:bg-[#4356C7] text-white'
                            }`}
                          >
                            {(fulfillItemMutation.isPending || unfulfillItemMutation.isPending) ? "..." : (item.is_fulfilled ? "Unfulfill" : "Fulfill")}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Item Detail Modal */}
        <Dialog open={itemModalOpen} onOpenChange={setItemModalOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader className="pb-4 border-b">
              <DialogTitle className="text-xl font-semibold">Purchase Order Item Details</DialogTitle>
              <p className="text-sm text-gray-500">{selectedItem?.material_name}</p>
            </DialogHeader>
            {selectedItem && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4">
                {/* Left Column */}
                <div className="space-y-4">
                  {/* Material & IDs */}
                  <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4 space-y-3">
                    <h3 className="font-medium text-gray-900 dark:text-gray-100 text-sm uppercase tracking-wide">Material & IDs</h3>
                    
                    <div className="group cursor-pointer" onClick={() => copyToClipboard(selectedItem.material_name, "Material Name")}>
                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-xs text-gray-500 dark:text-gray-400">Material Name</Label>
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{selectedItem.material_name}</p>
                        </div>
                        <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity">
                          {copiedField === "Material Name" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                        </Button>
                      </div>
                    </div>

                    <div className="group cursor-pointer" onClick={() => copyToClipboard(selectedItem.uuid, "Item UUID")}>
                      <div className="flex items-center justify-between">
                        <div className="min-w-0 flex-1">
                          <Label className="text-xs text-gray-500 dark:text-gray-400">Item UUID</Label>
                          <p className="text-xs font-mono text-gray-700 dark:text-gray-300 truncate">{selectedItem.uuid}</p>
                        </div>
                        <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity">
                          {copiedField === "Item UUID" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                        </Button>
                      </div>
                    </div>

                    <div className="group cursor-pointer" onClick={() => copyToClipboard(selectedItem.material_uuid, "Material UUID")}>
                      <div className="flex items-center justify-between">
                        <div className="min-w-0 flex-1">
                          <Label className="text-xs text-gray-500 dark:text-gray-400">Material UUID</Label>
                          <p className="text-xs font-mono text-gray-700 dark:text-gray-300 truncate">{selectedItem.material_uuid}</p>
                        </div>
                        <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity">
                          {copiedField === "Material UUID" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                        </Button>
                      </div>
                    </div>

                    <div className="group cursor-pointer" onClick={() => copyToClipboard(selectedItem.purchase_order_uuid, "Purchase Order UUID")}>
                      <div className="flex items-center justify-between">
                        <div className="min-w-0 flex-1">
                          <Label className="text-xs text-gray-500 dark:text-gray-400">Purchase Order UUID</Label>
                          <p className="text-xs font-mono text-gray-700 dark:text-gray-300 truncate">{selectedItem.purchase_order_uuid}</p>
                        </div>
                        <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity">
                          {copiedField === "Purchase Order UUID" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                        </Button>
                      </div>
                    </div>

                    {selectedItem.created_by_uuid && (
                      <div className="group cursor-pointer" onClick={() => copyToClipboard(selectedItem.created_by_uuid, "Created By UUID")}>
                        <div className="flex items-center justify-between">
                          <div className="min-w-0 flex-1">
                            <Label className="text-xs text-gray-500 dark:text-gray-400">Created By UUID</Label>
                            <p className="text-xs font-mono text-gray-700 dark:text-gray-300 truncate">{selectedItem.created_by_uuid}</p>
                          </div>
                          <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity">
                            {copiedField === "Created By UUID" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Quantities */}
                  <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 space-y-3">
                    <h3 className="font-medium text-gray-900 dark:text-gray-100 text-sm uppercase tracking-wide">Quantities</h3>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-xs text-gray-500 dark:text-gray-400">Ordered</Label>
                        <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                          {selectedItem.quantity} <span className="text-sm font-normal text-gray-500">{selectedItem.unit}</span>
                        </p>
                      </div>
                      
                      <div>
                        <Label className="text-xs text-gray-500 dark:text-gray-400">Received</Label>
                        <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                          {selectedItem.quantity_received} <span className="text-sm font-normal text-gray-500">{selectedItem.unit}</span>
                        </p>
                        {selectedItem.quantity_received > 0 && (
                          <p className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                            {Math.round((selectedItem.quantity_received / selectedItem.quantity) * 100)}% complete
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right Column */}
                <div className="space-y-4">
                  {/* Pricing */}
                  <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 space-y-3">
                    <h3 className="font-medium text-gray-900 dark:text-gray-100 text-sm uppercase tracking-wide">Pricing</h3>
                    
                    <div className="grid grid-cols-1 gap-3">
                      <div>
                        <Label className="text-xs text-gray-500 dark:text-gray-400">Price Per Unit</Label>
                        <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                          ${selectedItem.price_per_unit.toFixed(2)} <span className="text-sm font-normal text-gray-500">{selectedItem.currency}</span>
                        </p>
                      </div>
                      
                      <div className="pt-2 border-t border-green-200 dark:border-green-700">
                        <Label className="text-xs text-gray-500 dark:text-gray-400">Total Price</Label>
                        <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                          ${selectedItem.total_price.toFixed(2)} <span className="text-lg font-normal text-gray-500">{selectedItem.currency}</span>
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Status & Timestamps */}
                  <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4 space-y-3">
                    <h3 className="font-medium text-gray-900 dark:text-gray-100 text-sm uppercase tracking-wide">Status & Timeline</h3>
                    
                    <div>
                      <Label className="text-xs text-gray-500 dark:text-gray-400">Fulfillment Status</Label>
                      <div className="mt-1">
                        <Badge 
                          className={`text-xs ${
                            selectedItem.is_fulfilled
                              ? 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300'
                              : 'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/20 dark:text-orange-300'
                          }`}
                        >
                          {selectedItem.is_fulfilled ? "Fulfilled" : "Pending"}
                        </Badge>
                      </div>
                    </div>

                    <div className="group cursor-pointer" onClick={() => copyToClipboard(format(new Date(selectedItem.created_at), 'PPp'), "Created At")}>
                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-xs text-gray-500 dark:text-gray-400">Created At</Label>
                          <p className="text-sm text-gray-900 dark:text-gray-100">
                            {format(new Date(selectedItem.created_at), 'PPp')}
                          </p>
                        </div>
                        <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity">
                          {copiedField === "Created At" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                        </Button>
                      </div>
                    </div>

                    {selectedItem.fulfilled_at && (
                      <div className="group cursor-pointer" onClick={() => copyToClipboard(format(new Date(selectedItem.fulfilled_at), 'PPp'), "Fulfilled At")}>
                        <div className="flex items-center justify-between">
                          <div>
                            <Label className="text-xs text-gray-500 dark:text-gray-400">Fulfilled At</Label>
                            <p className="text-sm text-gray-900 dark:text-gray-100">
                              {format(new Date(selectedItem.fulfilled_at), 'PPp')}
                            </p>
                          </div>
                          <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity">
                            {copiedField === "Fulfilled At" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                          </Button>
                        </div>
                      </div>
                    )}

                    <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                      <Label className="text-xs text-gray-500 dark:text-gray-400">System Flags</Label>
                      <div className="flex gap-2 mt-1">
                        <Badge variant="outline" className="text-xs">
                          {selectedItem.is_deleted ? "Deleted" : "Active"}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            {/* Action Button at Bottom */}
            {selectedItem && (
              <div className="flex justify-end pt-4 border-t border-gray-200 dark:border-gray-700">
                <Button
                  variant={selectedItem.is_fulfilled ? "outline" : "default"}
                  onClick={() => selectedItem && handleFulfillToggle(selectedItem, { stopPropagation: () => {} } as React.MouseEvent)}
                  disabled={fulfillItemMutation.isPending || unfulfillItemMutation.isPending}
                  className={`${
                    selectedItem.is_fulfilled 
                      ? 'hover:bg-orange-50 hover:text-orange-600 hover:border-orange-300 dark:hover:bg-orange-900/20 dark:hover:text-orange-400' 
                      : 'bg-[#5469D4] hover:bg-[#4356C7] text-white'
                  }`}
                >
                  {(fulfillItemMutation.isPending || unfulfillItemMutation.isPending) ? "Updating..." : (selectedItem.is_fulfilled ? "Unfulfill Item" : "Fulfill Item")}
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Fulfill Item Modal */}
        <FulfillItemModal
          isOpen={fulfillModalOpen}
          onClose={() => {
            setFulfillModalOpen(false);
            setItemToFulfill(null);
          }}
          item={itemToFulfill}
          onFulfill={(data) => fulfillItemMutation.mutate(data)}
          isLoading={fulfillItemMutation.isPending}
        />
      </div>
    </AppLayout>
  );
}