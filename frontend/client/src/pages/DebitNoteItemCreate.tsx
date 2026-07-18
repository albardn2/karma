import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useForm, SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, FileText, User, Package, ShoppingCart, Receipt } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { AppLayout } from "@/components/layout/AppLayout";
import { apiRequest, queryClient } from "@/lib/queryClient";

const createSchema = z.object({
  amount: z.number().min(0.01, "Amount must be greater than 0"),
  currency: z.string().min(1, "Currency is required"),
  notes: z.string().optional(),
  invoice_item_uuid: z.string().optional(),
  customer_uuid: z.string().optional(),
  vendor_uuid: z.string().optional(),
  purchase_order_item_uuid: z.string().optional(),
  inventory_change: z.number().optional(),
  create_payment: z.boolean().optional(),
});

type CreateFormData = z.infer<typeof createSchema>;

export default function DebitNoteItemCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("invoice_item");
  
  // Get URL parameters for pre-filling
  const urlParams = new URLSearchParams(window.location.search);
  const prefilledInvoiceItemUuid = urlParams.get('invoice_item_uuid');
  const prefilledCustomerUuid = urlParams.get('customer_uuid');
  const prefilledVendorUuid = urlParams.get('vendor_uuid');
  const prefilledPurchaseOrderItemUuid = urlParams.get('purchase_order_item_uuid');
  const prefilledAmount = urlParams.get('amount');
  const prefilledCurrency = urlParams.get('currency');

  // Set active tab based on prefilled data
  useEffect(() => {
    if (prefilledInvoiceItemUuid) setActiveTab("invoice_item");
    else if (prefilledCustomerUuid) setActiveTab("customer");
    else if (prefilledVendorUuid) setActiveTab("vendor");
    else if (prefilledPurchaseOrderItemUuid) setActiveTab("purchase_order_item");
  }, [prefilledInvoiceItemUuid, prefilledCustomerUuid, prefilledVendorUuid, prefilledPurchaseOrderItemUuid]);

  const form = useForm<CreateFormData>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      amount: prefilledAmount ? parseFloat(prefilledAmount) : 0,
      currency: prefilledCurrency || "",
      notes: "",
      invoice_item_uuid: prefilledInvoiceItemUuid || "",
      customer_uuid: prefilledCustomerUuid || "",
      vendor_uuid: prefilledVendorUuid || "",
      purchase_order_item_uuid: prefilledPurchaseOrderItemUuid || "",
      inventory_change: 0,
      create_payment: false,
    }
  });

  // Get currencies from API
  const { data: currencies } = useQuery<string[]>({
    queryKey: ["/payment/currencies"],
    staleTime: 300000
  });

  const createMutation = useMutation({
    mutationFn: async (data: CreateFormData) => {
      // Build payload based on active tab
      const payload: any = {
        amount: data.amount,
        currency: data.currency,
        notes: data.notes || null,
        inventory_change: data.inventory_change || null,
        create_payment: data.create_payment || false,
      };

      // Add the appropriate UUID field based on active tab
      if (activeTab === "invoice_item" && data.invoice_item_uuid) {
        payload.invoice_item_uuid = data.invoice_item_uuid;
      } else if (activeTab === "customer" && data.customer_uuid) {
        payload.customer_uuid = data.customer_uuid;
      } else if (activeTab === "vendor" && data.vendor_uuid) {
        payload.vendor_uuid = data.vendor_uuid;
      } else if (activeTab === "purchase_order_item" && data.purchase_order_item_uuid) {
        payload.purchase_order_item_uuid = data.purchase_order_item_uuid;
      }

      const response = await apiRequest("/debit-note-item/", {
        method: "POST",
        body: payload
      });
      return response;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/debit-note-item/"] });
      toast({
        title: "Success",
        description: "Debit note item created successfully",
      });
      setLocation("/debit-note-items");
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to create debit note item",
      });
    }
  });

  const onSubmit: SubmitHandler<CreateFormData> = (data) => {
    createMutation.mutate(data);
  };

  const getTabIcon = (tab: string) => {
    switch (tab) {
      case "invoice_item": return <Receipt className="h-4 w-4" />;
      case "customer": return <User className="h-4 w-4" />;
      case "vendor": return <Package className="h-4 w-4" />;
      case "purchase_order_item": return <ShoppingCart className="h-4 w-4" />;
      default: return <FileText className="h-4 w-4" />;
    }
  };

  const getTabColor = (tab: string) => {
    switch (tab) {
      case "invoice_item": return "text-purple-600";
      case "customer": return "text-blue-600";
      case "vendor": return "text-green-600";
      case "purchase_order_item": return "text-orange-600";
      default: return "text-gray-600";
    }
  };

  return (
    <AppLayout>
      <div className="p-6 space-y-6 max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation("/debit-note-items")}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Create Debit Note Item</h1>
            <p className="text-gray-600">Add a new debit note item for charges and adjustments</p>
          </div>
        </div>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-purple-600" />
                Debit Note Information
              </CardTitle>
              <CardDescription>
                Enter the basic information for the debit note item
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="amount">Amount *</Label>
                  <Input
                    id="amount"
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    {...form.register("amount", { valueAsNumber: true })}
                    className={prefilledAmount ? "bg-blue-50 border-blue-200" : ""}
                  />
                  {prefilledAmount && (
                    <p className="text-xs text-blue-600">Pre-filled from previous page</p>
                  )}
                  {form.formState.errors.amount && (
                    <p className="text-sm text-red-600">{form.formState.errors.amount.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="currency">Currency *</Label>
                  <Select 
                    value={form.watch("currency")} 
                    onValueChange={(value) => form.setValue("currency", value)}
                  >
                    <SelectTrigger className={prefilledCurrency ? "bg-blue-50 border-blue-200" : ""}>
                      <SelectValue placeholder="Select currency" />
                    </SelectTrigger>
                    <SelectContent>
                      {currencies?.map((currency) => (
                        <SelectItem key={currency} value={currency}>
                          {currency}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {prefilledCurrency && (
                    <p className="text-xs text-blue-600">Pre-filled from previous page</p>
                  )}
                  {form.formState.errors.currency && (
                    <p className="text-sm text-red-600">{form.formState.errors.currency.message}</p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  placeholder="Enter any additional notes..."
                  {...form.register("notes")}
                  rows={3}
                  className="resize-none"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="inventory_change">Inventory Change</Label>
                <Input
                  id="inventory_change"
                  type="number"
                  step="0.01"
                  placeholder="0"
                  {...form.register("inventory_change", { valueAsNumber: true })}
                />
              </div>

              <div className="flex items-center space-x-2 rtl:space-x-reverse">
                <Checkbox
                  id="create_payment"
                  checked={form.watch("create_payment")}
                  onCheckedChange={(checked) => form.setValue("create_payment", !!checked)}
                />
                <Label htmlFor="create_payment" className="text-sm font-medium">
                  Auto Pay (automatically create payment record)
                </Label>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Reference Selection</CardTitle>
              <CardDescription>
                Select the type of reference and provide the UUID
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="invoice_item" className="flex items-center gap-1">
                    <span className={getTabIcon("invoice_item").props.className + " " + getTabColor("invoice_item")}>{getTabIcon("invoice_item")}</span>
                    Invoice Item
                  </TabsTrigger>
                  <TabsTrigger value="customer" className="flex items-center gap-1">
                    <span className={getTabIcon("customer").props.className + " " + getTabColor("customer")}>{getTabIcon("customer")}</span>
                    Customer
                  </TabsTrigger>
                  <TabsTrigger value="vendor" className="flex items-center gap-1">
                    <span className={getTabIcon("vendor").props.className + " " + getTabColor("vendor")}>{getTabIcon("vendor")}</span>
                    Vendor
                  </TabsTrigger>
                  <TabsTrigger value="purchase_order_item" className="flex items-center gap-1">
                    <span className={getTabIcon("purchase_order_item").props.className + " " + getTabColor("purchase_order_item")}>{getTabIcon("purchase_order_item")}</span>
                    Purchase Order Item
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="invoice_item" className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="invoice_item_uuid">Invoice Item UUID</Label>
                    <Input
                      id="invoice_item_uuid"
                      placeholder="Enter invoice item UUID..."
                      {...form.register("invoice_item_uuid")}
                      className={prefilledInvoiceItemUuid ? "bg-purple-50 border-purple-200" : ""}
                    />
                    {prefilledInvoiceItemUuid && (
                      <p className="text-xs text-purple-600">Pre-filled from previous page</p>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="customer" className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="customer_uuid">Customer UUID</Label>
                    <Input
                      id="customer_uuid"
                      placeholder="Enter customer UUID..."
                      {...form.register("customer_uuid")}
                      className={prefilledCustomerUuid ? "bg-blue-50 border-blue-200" : ""}
                    />
                    {prefilledCustomerUuid && (
                      <p className="text-xs text-blue-600">Pre-filled from previous page</p>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="vendor" className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="vendor_uuid">Vendor UUID</Label>
                    <Input
                      id="vendor_uuid"
                      placeholder="Enter vendor UUID..."
                      {...form.register("vendor_uuid")}
                      className={prefilledVendorUuid ? "bg-green-50 border-green-200" : ""}
                    />
                    {prefilledVendorUuid && (
                      <p className="text-xs text-green-600">Pre-filled from previous page</p>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="purchase_order_item" className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="purchase_order_item_uuid">Purchase Order Item UUID</Label>
                    <Input
                      id="purchase_order_item_uuid"
                      placeholder="Enter purchase order item UUID..."
                      {...form.register("purchase_order_item_uuid")}
                      className={prefilledPurchaseOrderItemUuid ? "bg-orange-50 border-orange-200" : ""}
                    />
                    {prefilledPurchaseOrderItemUuid && (
                      <p className="text-xs text-orange-600">Pre-filled from previous page</p>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          <div className="flex justify-end gap-2">
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => setLocation("/debit-note-items")}
              disabled={createMutation.isPending}
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              className="bg-purple-600 hover:bg-purple-700"
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? "Creating..." : "Create Debit Note Item"}
            </Button>
          </div>
        </form>
      </div>
    </AppLayout>
  );
}