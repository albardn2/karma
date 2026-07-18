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
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Edit3, Save, X, Trash2, Copy, Check, Package, Receipt, ExternalLink, Warehouse } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { format } from "date-fns";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface CustomerOrderItem {
  uuid: string;
  created_by_uuid?: string;
  customer_order_uuid: string;
  material_uuid: string;
  material_name: string;
  quantity: number;
  price_per_unit: number;
  currency: string;
  unit: string;
  is_fulfilled: boolean;
  fulfilled_at?: string;
  created_at: string;
  is_deleted: boolean;
  total_price: number;
}

interface Invoice {
  uuid: string;
  customer_uuid: string;
  customer_order_uuid: string;
  currency: string;
  status: string;
  created_at: string;
  total_amount: number;
  total_adjusted_amount: number;
  net_amount_paid: number;
  net_amount_due: number;
  is_paid: boolean;
  is_overdue: boolean;
  due_date?: string;
  notes?: string;
  invoice_items?: InvoiceItem[];
}

interface InvoiceItem {
  uuid: string;
  invoice_uuid: string;
  customer_order_item_uuid: string;
  material_uuid: string;
  material_name: string;
  quantity: number;
  price_per_unit: number;
  total_price: number;
  currency: string;
  unit: string;
  created_at: string;
}

interface CustomerOrder {
  uuid: string;
  created_by_uuid?: string;
  customer_uuid: string;
  created_at: string;
  is_fulfilled: boolean;
  fulfilled_at?: string;
  is_deleted: boolean;
  total_adjusted_amount: number;
  is_overdue: boolean;
  customer_order_items?: CustomerOrderItem[];
  net_amount_due?: number;
  net_amount_paid?: number;
  trip_stop_uuid?: string;
  is_paid?: boolean;
  notes?: string;
}

export default function CustomerOrderDetail() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const [isEditing, setIsEditing] = useState(false);
  const [editedNotes, setEditedNotes] = useState("");
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<CustomerOrderItem | null>(null);
  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [fulfillModalOpen, setFulfillModalOpen] = useState(false);
  const [fulfillItem, setFulfillItem] = useState<CustomerOrderItem | null>(null);
  const [inventoryUuid, setInventoryUuid] = useState("");

  // Currency formatting function
  const formatCurrency = (amount: number | undefined, currency: string) => {
    if (!amount && amount !== 0) return '0.00';
    
    const currencySymbols: { [key: string]: string } = {
      'USD': '$',
      'EUR': '€',
      'GBP': '£',
      'JPY': '¥',
      'CAD': 'C$',
      'AUD': 'A$',
      'CHF': 'CHF ',
      'CNY': '¥',
      'INR': '₹',
    };
    
    const symbol = currencySymbols[currency] || `${currency} `;
    return `${symbol}${amount.toFixed(2)}`;
  };

  const { data: orderData, isLoading, error } = useQuery({
    queryKey: ["/customer-order/with-items-and-invoice", params?.id],
    queryFn: () => apiRequest(`/customer-order/with-items-and-invoice/${params?.id}`),
    enabled: !!params?.id,
  });

  // Extract data from the combined response
  const customerOrder = orderData?.customer_order;
  const customerOrderItems = customerOrder?.customer_order_items || [];
  const invoices = orderData?.invoices || [];

  const updateMutation = useMutation({
    mutationFn: (data: { notes?: string }) =>
      apiRequest(`/customer-order/${params?.id}`, {
        method: "PUT",
        body: data,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/customer-order/with-items-and-invoice", params?.id] });
      setIsEditing(false);
      toast({
        title: "Success",
        description: "Customer order updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update customer order",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/customer-order/${params?.id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/customer-order"] });
      queryClient.invalidateQueries({ queryKey: ["/customer-order/with-items-and-invoice"] });
      toast({
        title: "Success",
        description: "Customer order deleted successfully",
      });
      setLocation("/customer-orders");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete customer order",
        variant: "destructive",
      });
    },
  });

  const fulfillItemMutation = useMutation({
    mutationFn: (data: { items: Array<{ customer_order_item_uuid: string; inventory_uuid?: string }> }) =>
      apiRequest(`/customer-order-item/fulfill-items`, {
        method: "POST",
        body: data,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/customer-order/with-items-and-invoice", params?.id] });
      setFulfillModalOpen(false);
      setInventoryUuid("");
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
    mutationFn: (data: { items: Array<{ customer_order_item_uuid: string }> }) =>
      apiRequest(`/customer-order-item/unfulfill-items`, {
        method: "POST",
        body: data,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/customer-order/with-items-and-invoice", params?.id] });
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

  useEffect(() => {
    if (customerOrder) {
      setEditedNotes(customerOrder.notes || "");
    }
  }, [customerOrder]);

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleSave = () => {
    const updateData: { notes?: string } = {};
    
    if (editedNotes !== customerOrder?.notes) {
      updateData.notes = editedNotes || null;
    }

    if (Object.keys(updateData).length > 0) {
      updateMutation.mutate(updateData);
    } else {
      setIsEditing(false);
    }
  };

  const handleCancel = () => {
    setEditedNotes(customerOrder?.notes || "");
    setIsEditing(false);
  };

  const handleDelete = () => {
    if (window.confirm("Are you sure you want to delete this customer order?")) {
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

  const handleFulfillToggle = (item: CustomerOrderItem, e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (item.is_fulfilled) {
      unfulfillItemMutation.mutate({
        items: [{ customer_order_item_uuid: item.uuid }]
      });
    } else {
      setFulfillItem(item);
      setFulfillModalOpen(true);
    }
  };

  const handleFulfillSubmit = () => {
    if (!fulfillItem) return;
    
    const fulfillData = {
      items: [{
        customer_order_item_uuid: fulfillItem.uuid,
        ...(inventoryUuid.trim() && { inventory_uuid: inventoryUuid.trim() })
      }]
    };
    
    fulfillItemMutation.mutate(fulfillData);
  };

  const handleItemRowClick = (item: CustomerOrderItem) => {
    setSelectedItem(item);
    setItemModalOpen(true);
  };

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
            Error Loading Customer Order
          </h1>
          <p className="text-red-600 dark:text-red-400">
            Failed to load customer order: {error?.message}
          </p>
          <Button onClick={() => setLocation("/customer-orders")} variant="outline">
            <ArrowLeft className="h-4 w-4 me-2" />
            Back to Customer Orders
          </Button>
        </div>
      </AppLayout>
    );
  }

  if (!customerOrder) {
    return (
      <AppLayout>
        <div className="p-8 text-center">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Customer Order Not Found
          </h1>
          <Button onClick={() => setLocation("/customer-orders")} variant="outline">
            <ArrowLeft className="h-4 w-4 me-2" />
            Back to Customer Orders
          </Button>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-8 max-w-7xl mx-auto space-y-8">
        {/* Overdue Banner */}
        {customerOrder.is_overdue && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ms-3">
                <h3 className="text-sm font-medium text-red-800 dark:text-red-200">
                  Order Overdue
                </h3>
                <p className="mt-1 text-sm text-red-700 dark:text-red-300">
                  This customer order is past due. Please review and process payment immediately.
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
              onClick={() => setLocation("/customer-orders")}
            >
              <ArrowLeft className="h-4 w-4 me-2" />
              Back
            </Button>
            <div>
              <h1 className="text-3xl font-semibold text-gray-900 dark:text-gray-100">
                Customer Order
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {customerOrder.uuid}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
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

        {/* Order Information - Single Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Order Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Status Badges */}
            <div className="flex flex-wrap gap-3">
              <Badge 
                className={`text-xs ${
                  customerOrder.is_fulfilled
                    ? 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300'
                    : 'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/20 dark:text-orange-300'
                }`}
              >
                {customerOrder.is_fulfilled ? "Fulfilled" : "Unfulfilled"}
              </Badge>

              {customerOrder.is_overdue && (
                <Badge className="text-xs bg-red-100 text-red-800 border-red-200 dark:bg-red-900/20 dark:text-red-300">
                  Overdue
                </Badge>
              )}

              <Badge 
                className={`text-xs ${
                  customerOrder.is_paid
                    ? 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/20 dark:text-green-300'
                    : 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-300'
                }`}
              >
                {customerOrder.is_paid ? "Paid" : "Unpaid"}
              </Badge>
            </div>

            {/* Order Details Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div className="group cursor-pointer" onClick={() => copyToClipboard(customerOrder.uuid, "Order UUID")}>
                <Label className="text-sm font-medium text-gray-500 dark:text-gray-400">Order UUID</Label>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-900 dark:text-gray-100 font-mono break-all">
                    {customerOrder.uuid}
                  </p>
                  <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity ms-2">
                    {copiedField === "Order UUID" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <div className="group cursor-pointer" onClick={() => copyToClipboard(customerOrder.customer_uuid, "Customer UUID")}>
                <Label className="text-sm font-medium text-gray-500 dark:text-gray-400">Customer UUID</Label>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-900 dark:text-gray-100 font-mono break-all">
                    {customerOrder.customer_uuid}
                  </p>
                  <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity ms-2">
                    {copiedField === "Customer UUID" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <div className="group cursor-pointer" onClick={() => copyToClipboard(customerOrder.created_at, "Created Date")}>
                <Label className="text-sm font-medium text-gray-500 dark:text-gray-400">Created At</Label>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-900 dark:text-gray-100">
                    {format(new Date(customerOrder.created_at), 'MMM d, yyyy h:mm a')}
                  </p>
                  <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity ms-2">
                    {copiedField === "Created Date" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <div className="group cursor-pointer" onClick={() => copyToClipboard(customerOrder.trip_stop_uuid || "Not set", "Trip Stop UUID")}>
                <Label className="text-sm font-medium text-gray-500 dark:text-gray-400">Trip Stop UUID</Label>
                <div className="flex items-center justify-between">
                  <p className={`text-sm font-mono break-all ${customerOrder.trip_stop_uuid ? 'text-gray-900 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400 italic'}`}>
                    {customerOrder.trip_stop_uuid || "Not set"}
                  </p>
                  <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity ms-2">
                    {copiedField === "Trip Stop UUID" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <div className="group cursor-pointer" onClick={() => copyToClipboard(customerOrder.fulfilled_at ? format(new Date(customerOrder.fulfilled_at), 'MMM d, yyyy h:mm a') : "Not fulfilled", "Fulfilled At")}>
                <Label className="text-sm font-medium text-gray-500 dark:text-gray-400">Fulfilled At</Label>
                <div className="flex items-center justify-between">
                  <p className={`text-sm ${customerOrder.fulfilled_at ? 'text-gray-900 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400 italic'}`}>
                    {customerOrder.fulfilled_at ? format(new Date(customerOrder.fulfilled_at), 'MMM d, yyyy h:mm a') : "Not fulfilled"}
                  </p>
                  <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity ms-2">
                    {copiedField === "Fulfilled At" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </div>

            {/* Notes Section */}
            <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
              <Label className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3 block">Notes</Label>
              {isEditing ? (
                <Textarea
                  value={editedNotes}
                  onChange={(e) => setEditedNotes(e.target.value)}
                  placeholder="Add notes..."
                  rows={4}
                />
              ) : (
                <div className="group cursor-pointer" onClick={() => copyToClipboard(customerOrder.notes || "No notes", "Notes")}>
                  <div className="flex items-start justify-between">
                    <p className="text-gray-900 dark:text-gray-100">
                      {customerOrder.notes || "No notes added"}
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

        {/* Order Items - Full Width */}
        <Card className="mt-8">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Package className="h-5 w-5" />
              Order Items ({customerOrderItems.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {customerOrderItems.length === 0 ? (
              <div className="text-center py-8">
                <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500 dark:text-gray-400">No items in this order</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b border-gray-200 dark:border-gray-700">
                    <tr>
                      <th className="text-start py-3 text-sm font-medium text-gray-500 dark:text-gray-400">Material</th>
                      <th className="text-start py-3 text-sm font-medium text-gray-500 dark:text-gray-400">Quantity</th>
                      <th className="text-start py-3 text-sm font-medium text-gray-500 dark:text-gray-400">Status</th>
                      <th className="text-start py-3 text-sm font-medium text-gray-500 dark:text-gray-400">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {customerOrderItems.map((item) => (
                      <tr 
                        key={item.uuid} 
                        className="hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer"
                        onClick={() => handleItemRowClick(item)}
                      >
                        <td className="py-4">
                          <div className="group cursor-pointer" onClick={() => copyToClipboard(item.material_uuid || '', "Material UUID")}>
                            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                              {item.material_name || 'Unknown Material'}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {item.material_uuid?.substring(0, 8) || 'N/A'}... • Click to copy full UUID
                            </p>
                          </div>
                        </td>
                        <td className="py-4">
                          <div className="text-sm text-gray-900 dark:text-gray-100">
                            {item.quantity || 0} {item.unit || ''}
                          </div>
                        </td>
                        <td className="py-4">
                          <Badge 
                            className={cn(
                              "text-xs",
                              item.is_fulfilled
                                ? 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300'
                                : 'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/20 dark:text-orange-300'
                            )}
                          >
                            {item.is_fulfilled ? "Fulfilled" : "Pending"}
                          </Badge>
                        </td>
                        <td className="py-4">
                          <Button
                            size="sm"
                            variant={item.is_fulfilled ? "outline" : "default"}
                            onClick={(e) => handleFulfillToggle(item, e)}
                            disabled={fulfillItemMutation.isPending || unfulfillItemMutation.isPending}
                            className={cn(
                              "text-xs",
                              !item.is_fulfilled && "bg-[#5469D4] hover:bg-[#4356C7] text-white"
                            )}
                          >
                            {item.is_fulfilled ? "Unfulfill" : "Fulfill"}
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

        {/* Invoices Section - Full Width with Financial Summary */}
        <Card className="mt-8">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              Invoices & Financial Summary ({invoices.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* Financial Summary */}
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-6 mb-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Financial Summary</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="group cursor-pointer" onClick={() => copyToClipboard(customerOrder.total_adjusted_amount?.toFixed(2) || '0.00', "Total Amount")}>
                  <Label className="text-sm font-medium text-gray-500 dark:text-gray-400">Total Amount</Label>
                  <div className="flex items-center justify-between">
                    <p className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
                      {formatCurrency(customerOrder.total_adjusted_amount, invoices[0]?.currency || 'USD')}
                    </p>
                    <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity">
                      {copiedField === "Total Amount" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
                
                <div className="group cursor-pointer" onClick={() => copyToClipboard(customerOrder.net_amount_paid?.toFixed(2) || '0.00', "Amount Paid")}>
                  <Label className="text-sm font-medium text-gray-500 dark:text-gray-400">Amount Paid</Label>
                  <div className="flex items-center justify-between">
                    <p className="text-2xl font-semibold text-emerald-600 dark:text-emerald-400">
                      {formatCurrency(customerOrder.net_amount_paid, invoices[0]?.currency || 'USD')}
                    </p>
                    <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity">
                      {copiedField === "Amount Paid" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>

                <div className="group cursor-pointer" onClick={() => copyToClipboard(customerOrder.net_amount_due?.toFixed(2) || '0.00', "Amount Due")}>
                  <Label className="text-sm font-medium text-gray-500 dark:text-gray-400">Amount Due</Label>
                  <div className="flex items-center justify-between">
                    <p className="text-2xl font-semibold text-red-600 dark:text-red-400">
                      {formatCurrency(customerOrder.net_amount_due, invoices[0]?.currency || 'USD')}
                    </p>
                    <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity">
                      {copiedField === "Amount Due" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            {/* Invoice List */}
            {invoices.length === 0 ? (
              <div className="text-center py-8">
                <Receipt className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500 dark:text-gray-400">No invoices for this order</p>
              </div>
            ) : (
              <div className="space-y-4">
                {invoices.map((invoice: Invoice) => (
                  <div key={invoice.uuid} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <div className="flex items-center gap-3 mb-2">
                          <h4 className="font-medium text-gray-900 dark:text-gray-100">
                            Invoice
                          </h4>
                          <Button
                            size="sm"
                            onClick={() => setLocation(`/payments/create?referrer=/customer-orders/${params?.id}&invoice_uuid=${invoice.uuid}&amount=${invoice.net_amount_due}&currency=${invoice.currency}`)}
                            className="bg-[#5469D4] hover:bg-[#4356C7] text-white text-xs"
                          >
                            Pay Invoice
                          </Button>
                        </div>
                        
                        {/* Invoice UUID with copy functionality */}
                        <div className="group cursor-pointer mb-2" onClick={() => copyToClipboard(invoice.uuid, "Invoice UUID")}>
                          <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 rounded p-2">
                            <p className="text-xs font-mono text-gray-900 dark:text-gray-100">
                              {invoice.uuid}
                            </p>
                            <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity">
                              {copiedField === "Invoice UUID" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                            </Button>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-3">
                          <Badge 
                            className={cn(
                              "text-xs",
                              invoice.status === 'paid'
                                ? 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/20 dark:text-green-300'
                                : invoice.status === 'pending'
                                ? 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-300'
                                : 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/20 dark:text-red-300'
                            )}
                          >
                            {invoice.status}
                          </Badge>
                          {invoice.is_overdue && (
                            <Badge className="text-xs bg-red-100 text-red-800 border-red-200 dark:bg-red-900/20 dark:text-red-300">
                              Overdue
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                          Created {format(new Date(invoice.created_at), 'MMM d, yyyy')}
                          {invoice.due_date && ` • Due ${format(new Date(invoice.due_date), 'MMM d, yyyy')}`}
                        </p>
                      </div>
                      <div className="text-end">
                        <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                          {formatCurrency(invoice.total_adjusted_amount, invoice.currency)}
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          Paid: {formatCurrency(invoice.net_amount_paid, invoice.currency)}
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          Due: {formatCurrency(invoice.net_amount_due, invoice.currency)}
                        </p>
                      </div>
                    </div>

                    {/* Invoice Items */}
                    {invoice.invoice_items && invoice.invoice_items.length > 0 && (
                      <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                        <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Invoice Items</h5>
                        <div className="space-y-2">
                          {invoice.invoice_items.map((item: InvoiceItem) => (
                            <div key={item.uuid} className="flex items-center justify-between text-sm">
                              <span className="text-gray-600 dark:text-gray-400">
                                {item.material_name} ({item.quantity} {item.unit})
                              </span>
                              <span className="font-medium text-gray-900 dark:text-gray-100">
                                {formatCurrency(item.total_price, item.currency)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {invoice.notes && (
                      <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          <strong>Notes:</strong> {invoice.notes}
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Order Item Detail Modal */}
        <Dialog open={itemModalOpen} onOpenChange={setItemModalOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                Order Item Details
              </DialogTitle>
            </DialogHeader>
            {selectedItem && (
              <div className="space-y-6">
                {/* Item Status */}
                <div className="flex items-center gap-3">
                  <Badge 
                    className={cn(
                      "text-xs",
                      selectedItem.is_fulfilled
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300'
                        : 'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/20 dark:text-orange-300'
                    )}
                  >
                    {selectedItem.is_fulfilled ? "Fulfilled" : "Pending"}
                  </Badge>
                  {selectedItem.fulfilled_at && (
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      Fulfilled {format(new Date(selectedItem.fulfilled_at), 'MMM d, yyyy h:mm a')}
                    </span>
                  )}
                </div>

                {/* Item Details Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="group cursor-pointer" onClick={() => copyToClipboard(selectedItem.uuid, "Item UUID")}>
                    <Label className="text-sm font-medium text-gray-500 dark:text-gray-400">Item UUID</Label>
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-gray-900 dark:text-gray-100 font-mono break-all">
                        {selectedItem.uuid}
                      </p>
                      <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity ms-2">
                        {copiedField === "Item UUID" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>

                  <div className="group cursor-pointer" onClick={() => copyToClipboard(selectedItem.material_uuid, "Material UUID")}>
                    <Label className="text-sm font-medium text-gray-500 dark:text-gray-400">Material UUID</Label>
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-gray-900 dark:text-gray-100 font-mono break-all">
                        {selectedItem.material_uuid}
                      </p>
                      <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity ms-2">
                        {copiedField === "Material UUID" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>

                  <div className="group cursor-pointer" onClick={() => copyToClipboard(selectedItem.material_name || 'Unknown Material', "Material Name")}>
                    <Label className="text-sm font-medium text-gray-500 dark:text-gray-400">Material Name</Label>
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-gray-900 dark:text-gray-100">
                        {selectedItem.material_name || 'Unknown Material'}
                      </p>
                      <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity ms-2">
                        {copiedField === "Material Name" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>

                  <div className="group cursor-pointer" onClick={() => copyToClipboard(selectedItem.customer_order_uuid, "Customer Order UUID")}>
                    <Label className="text-sm font-medium text-gray-500 dark:text-gray-400">Customer Order UUID</Label>
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-gray-900 dark:text-gray-100 font-mono break-all">
                        {selectedItem.customer_order_uuid}
                      </p>
                      <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity ms-2">
                        {copiedField === "Customer Order UUID" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>

                  <div className="group cursor-pointer" onClick={() => copyToClipboard(selectedItem.quantity?.toString() || '0', "Quantity")}>
                    <Label className="text-sm font-medium text-gray-500 dark:text-gray-400">Quantity</Label>
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-gray-900 dark:text-gray-100">
                        {selectedItem.quantity || 0} {selectedItem.unit || 'N/A'}
                      </p>
                      <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity ms-2">
                        {copiedField === "Quantity" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>

                  <div className="group cursor-pointer" onClick={() => copyToClipboard(format(new Date(selectedItem.created_at), 'MMM d, yyyy h:mm a'), "Created At")}>
                    <Label className="text-sm font-medium text-gray-500 dark:text-gray-400">Created At</Label>
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-gray-900 dark:text-gray-100">
                        {format(new Date(selectedItem.created_at), 'MMM d, yyyy h:mm a')}
                      </p>
                      <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity ms-2">
                        {copiedField === "Created At" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>

                  {selectedItem.created_by_uuid && (
                    <div className="group cursor-pointer" onClick={() => copyToClipboard(selectedItem.created_by_uuid, "Created By UUID")}>
                      <Label className="text-sm font-medium text-gray-500 dark:text-gray-400">Created By UUID</Label>
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-gray-900 dark:text-gray-100 font-mono break-all">
                          {selectedItem.created_by_uuid}
                        </p>
                        <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity ms-2">
                          {copiedField === "Created By UUID" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex justify-between items-center pt-6 border-t border-gray-200 dark:border-gray-700">
                  <Button
                    variant={selectedItem.is_fulfilled ? "outline" : "default"}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (selectedItem.is_fulfilled) {
                        unfulfillItemMutation.mutate({
                          items: [{ customer_order_item_uuid: selectedItem.uuid }]
                        });
                        setItemModalOpen(false);
                      } else {
                        setItemModalOpen(false);
                        setFulfillItem(selectedItem);
                        setFulfillModalOpen(true);
                      }
                    }}
                    disabled={fulfillItemMutation.isPending || unfulfillItemMutation.isPending}
                    className={cn(
                      !selectedItem.is_fulfilled && "bg-[#5469D4] hover:bg-[#4356C7] text-white"
                    )}
                  >
                    {selectedItem.is_fulfilled ? "Unfulfill Item" : "Fulfill Item"}
                  </Button>
                  
                  <Button 
                    variant="outline"
                    onClick={() => setItemModalOpen(false)}
                  >
                    Close
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Fulfill Item Modal */}
        <Dialog open={fulfillModalOpen} onOpenChange={setFulfillModalOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Warehouse className="h-5 w-5" />
                Fulfill Order Item
              </DialogTitle>
            </DialogHeader>
            {fulfillItem && (
              <div className="space-y-4">
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                  <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-2">
                    {fulfillItem.material_name || 'Unknown Material'}
                  </h4>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Quantity: {fulfillItem.quantity || 0} {fulfillItem.unit || ''}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Item UUID: {fulfillItem.uuid}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="inventory-uuid" className="text-sm font-medium">
                    Inventory UUID (Optional)
                  </Label>
                  <Input
                    id="inventory-uuid"
                    value={inventoryUuid}
                    onChange={(e) => setInventoryUuid(e.target.value)}
                    placeholder="Enter inventory UUID to link to specific inventory"
                    className="w-full"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Link this fulfillment to a specific inventory item (optional)
                  </p>
                </div>

                <div className="flex justify-end gap-3 pt-4">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setFulfillModalOpen(false);
                      setInventoryUuid("");
                    }}
                    disabled={fulfillItemMutation.isPending}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleFulfillSubmit}
                    disabled={fulfillItemMutation.isPending}
                    className="bg-[#5469D4] hover:bg-[#4356C7] text-white"
                  >
                    {fulfillItemMutation.isPending ? "Fulfilling..." : "Fulfill Item"}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}