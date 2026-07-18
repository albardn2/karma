import React, { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ArrowLeft, Plus, Edit, Trash2, CalendarIcon, ChevronsUpDown, Check } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { AddItemDialog } from "@/components/customer-orders/AddItemDialog";

const CreateCustomerOrderSchema = z.object({
  customer_uuid: z.string().min(1, "Customer is required"),
  currency: z.string().min(1, "Currency is required"),
  notes: z.string().optional(),
  due_date: z.date().optional(),
});

type CreateCustomerOrderForm = z.infer<typeof CreateCustomerOrderSchema>;

interface CustomerOrderItem {
  temp_id: string;
  material_uuid: string;
  material_name?: string;
  quantity: number;
  price_per_unit: number;
  unit?: string;
}

export default function CustomerOrderCreate() {
  const [, setLocation] = useLocation();
  const [items, setItems] = useState<CustomerOrderItem[]>([]);
  const [addItemDialogOpen, setAddItemDialogOpen] = useState(false);
  const [editItemDialog, setEditItemDialog] = useState<{ open: boolean; item?: CustomerOrderItem; index?: number }>({ open: false });
  
  // Customer selection state
  const [customerOpen, setCustomerOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerValue, setCustomerValue] = useState("");
  const [useManualCustomerUuid, setUseManualCustomerUuid] = useState(false);

  const queryClient = useQueryClient();

  // Fetch customers
  const { data: customersData } = useQuery({
    queryKey: ["/customer/", customerSearch],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: "1",
        per_page: "10",
      });
      
      if (customerSearch) {
        params.append("company_name", customerSearch);
      }

      return await apiRequest(`/customer/?${params.toString()}`);
    },
  });

  // Fetch currencies
  const { data: currenciesData } = useQuery({
    queryKey: ["/payment/currencies"],
    queryFn: async () => {
      return await apiRequest("/payment/currencies");
    },
  });

  const form = useForm<CreateCustomerOrderForm>({
    resolver: zodResolver(CreateCustomerOrderSchema),
    defaultValues: {
      customer_uuid: "",
      currency: "",
      notes: "",
    },
  });

  // Handle URL parameters for pre-filling customer UUID
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const customerUuidParam = urlParams.get('customer_uuid');
    
    if (customerUuidParam) {
      form.setValue('customer_uuid', customerUuidParam);
      setUseManualCustomerUuid(true); // Switch to manual mode to show the pre-filled UUID
    }
  }, [form]);

  const createMutation = useMutation({
    mutationFn: async (data: CreateCustomerOrderForm) => {
      const payload = {
        customer_uuid: data.customer_uuid,
        currency: data.currency,
        due_date: data.due_date ? 
          data.due_date.toISOString().replace('Z', '').replace(/\.\d{3}$/, '') + '.000000' : null,
        notes: data.notes || null,
        items: items.map(item => ({
          material_uuid: item.material_uuid,
          quantity: item.quantity,
          price_per_unit: item.price_per_unit,
        })),
      };
      
      return await apiRequest("/customer-order/with-items-and-invoice", { method: "POST", body: payload });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/customer-order/"] });
      queryClient.refetchQueries({ queryKey: ["/customer-order/"] });
      toast({
        title: "Success",
        description: "Customer order created successfully",
      });
      setLocation("/customer-orders");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create customer order",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: CreateCustomerOrderForm) => {
    if (items.length === 0) {
      toast({
        title: "Error",
        description: "Please add at least one item to the customer order",
        variant: "destructive",
      });
      return;
    }
    
    createMutation.mutate(data);
  };

  const handleAddItem = (item: CustomerOrderItem) => {
    const newItem = { ...item, temp_id: Date.now().toString() };
    setItems(prev => [...prev, newItem]);
    setAddItemDialogOpen(false);
  };

  const handleEditItem = (item: CustomerOrderItem, index: number) => {
    const updatedItems = [...items];
    updatedItems[index] = { ...item, temp_id: items[index].temp_id };
    setItems(updatedItems);
    setEditItemDialog({ open: false });
  };

  const handleDeleteItem = (index: number) => {
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  const openEditDialog = (item: CustomerOrderItem, index: number) => {
    setEditItemDialog({ open: true, item, index });
  };

  const customers = customersData?.customers || [];
  const currencies = Array.isArray(currenciesData) ? currenciesData : [];

  return (
    <AppLayout>
      <div className="p-8 max-w-7xl mx-auto space-y-8">
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
                Create Customer Order
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Add a new customer order with items and invoice
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <Button 
              variant="outline" 
              onClick={() => setLocation("/customer-orders")}
              disabled={createMutation.isPending}
            >
              Cancel
            </Button>
            <Button 
              onClick={form.handleSubmit(onSubmit)}
              disabled={createMutation.isPending || items.length === 0}
              className="bg-[#5469D4] hover:bg-[#4356C7] text-white"
            >
              {createMutation.isPending ? "Creating..." : "Create Customer Order"}
            </Button>
          </div>
        </div>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          {/* Customer Order Details */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Customer Order Details</CardTitle>
            </CardHeader>
            <CardContent className="p-8">
              <div className="space-y-10">
                {/* Customer Selection */}
                <div className="relative">
                  <div className="absolute inset-0 bg-gradient-to-r from-[#5469D4]/5 to-transparent rounded-lg -m-4"></div>
                  <div className="relative space-y-6 p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-8 bg-gradient-to-b from-[#5469D4] to-[#4356C7] rounded-full"></div>
                      <div>
                        <Label className="text-lg font-semibold text-gray-800 dark:text-gray-200">
                          Customer Selection *
                        </Label>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                          Choose your customer or enter UUID manually
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex gap-2 mb-4">
                      <Button
                        type="button"
                        variant={!useManualCustomerUuid ? "default" : "outline"}
                        size="sm"
                        className={cn(
                          "transition-all duration-200",
                          !useManualCustomerUuid ? "bg-[#5469D4] hover:bg-[#4356C7] shadow-md" : ""
                        )}
                        onClick={() => {
                          setUseManualCustomerUuid(false);
                          setCustomerSearch("");
                          setCustomerValue("");
                          form.setValue("customer_uuid", "");
                        }}
                      >
                        Browse
                      </Button>
                      <Button
                        type="button"
                        variant={useManualCustomerUuid ? "default" : "outline"}
                        size="sm"
                        className={cn(
                          "transition-all duration-200",
                          useManualCustomerUuid ? "bg-[#5469D4] hover:bg-[#4356C7] shadow-md" : ""
                        )}
                        onClick={() => {
                          setUseManualCustomerUuid(true);
                          setCustomerSearch("");
                          setCustomerValue("");
                          form.setValue("customer_uuid", "");
                        }}
                      >
                        Manual Entry
                      </Button>
                    </div>
                    
                    <div>
                      {useManualCustomerUuid ? (
                        <Input
                          placeholder="Enter customer UUID..."
                          value={form.watch("customer_uuid")}
                          onChange={(e) => {
                            form.setValue("customer_uuid", e.target.value);
                            setCustomerValue(e.target.value);
                          }}
                          className="h-12 text-lg border-2 border-gray-200 dark:border-gray-600 focus:border-[#5469D4] transition-colors"
                        />
                      ) : (
                        <div className="relative">
                          <Button
                            variant="outline"
                            type="button"
                            className="w-full justify-between h-12 text-lg text-start border-2 border-gray-200 dark:border-gray-600 hover:border-[#5469D4] transition-colors"
                            onClick={() => setCustomerOpen(!customerOpen)}
                          >
                            {customerValue
                              ? customers?.find((customer: any) => customer.uuid === customerValue)?.company_name || 
                                customers?.find((customer: any) => customer.uuid === customerValue)?.first_name + " " + 
                                customers?.find((customer: any) => customer.uuid === customerValue)?.last_name || 
                                "Customer not found"
                              : "Select customer..."}
                            <ChevronsUpDown className="ms-2 h-5 w-5 shrink-0 opacity-50" />
                          </Button>
                          
                          {customerOpen && (
                            <div className="absolute z-50 w-full mt-2 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-lg shadow-xl">
                              <div className="p-4">
                                <Input
                                  placeholder="Search customers..."
                                  value={customerSearch}
                                  onChange={(e) => setCustomerSearch(e.target.value)}
                                  className="mb-2"
                                />
                              </div>
                              <div className="max-h-48 overflow-y-auto">
                                {customers && customers.length > 0 ? (
                                  customers.map((customer: any) => (
                                    <div
                                      key={customer.uuid}
                                      className="px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer flex items-center transition-colors"
                                      onClick={() => {
                                        setCustomerValue(customer.uuid);
                                        form.setValue("customer_uuid", customer.uuid);
                                        setCustomerOpen(false);
                                      }}
                                    >
                                      <Check
                                        className={cn(
                                          "me-3 h-4 w-4 text-[#5469D4]",
                                          customerValue === customer.uuid ? "opacity-100" : "opacity-0"
                                        )}
                                      />
                                      <span className="font-medium">
                                        {customer.company_name || `${customer.first_name} ${customer.last_name}`}
                                      </span>
                                    </div>
                                  ))
                                ) : (
                                  <div className="px-4 py-3 text-gray-500 dark:text-gray-400 text-center">
                                    {customers === undefined ? "Loading..." : "No customers found."}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                      {form.formState.errors.customer_uuid && (
                        <p className="text-sm text-red-600 dark:text-red-400 mt-2 font-medium">{form.formState.errors.customer_uuid.message}</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Secondary Row */}
                <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
                  {/* Currency */}
                  <div className="lg:col-span-2 space-y-4">
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-6 bg-green-500 rounded-full"></div>
                      <div>
                        <Label className="text-base font-semibold text-gray-800 dark:text-gray-200">
                          Currency *
                        </Label>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Transaction currency
                        </p>
                      </div>
                    </div>
                    
                    <Select 
                      value={form.watch("currency")} 
                      onValueChange={(value) => form.setValue("currency", value)}
                    >
                      <SelectTrigger className="h-12 text-lg border-2 border-gray-200 dark:border-gray-600 focus:border-green-500 transition-colors">
                        <SelectValue placeholder="Select currency" />
                      </SelectTrigger>
                      <SelectContent>
                        {currencies.map((currency: string) => (
                          <SelectItem key={currency} value={currency} className="text-lg">
                            {currency}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {form.formState.errors.currency && (
                      <p className="text-sm text-red-600 dark:text-red-400 font-medium">{form.formState.errors.currency.message}</p>
                    )}
                  </div>

                  {/* Due Date */}
                  <div className="lg:col-span-3 space-y-4">
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-6 bg-amber-500 rounded-full"></div>
                      <div>
                        <Label className="text-base font-semibold text-gray-800 dark:text-gray-200">
                          Due Date
                        </Label>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Optional deadline for payment
                        </p>
                      </div>
                    </div>
                    
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full h-12 ps-4 text-lg text-start font-normal justify-start border-2 border-gray-200 dark:border-gray-600 hover:border-amber-500 transition-colors",
                            !form.watch("due_date") && "text-muted-foreground"
                          )}
                        >
                          {form.watch("due_date") ? (
                            format(form.watch("due_date"), "EEEE, MMMM do, yyyy")
                          ) : (
                            <span>Choose a due date</span>
                          )}
                          <CalendarIcon className="ms-auto h-5 w-5 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={form.watch("due_date")}
                          onSelect={(date) => form.setValue("due_date", date)}
                          disabled={(date) =>
                            date < new Date(new Date().setHours(0, 0, 0, 0))
                          }
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>

                {/* Notes Section */}
                <div className="relative">
                  <div className="absolute inset-0 bg-gradient-to-br from-slate-50 to-gray-50 dark:from-gray-800/50 dark:to-gray-900/50 rounded-lg -m-4"></div>
                  <div className="relative space-y-4 p-4">
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-6 bg-slate-500 rounded-full"></div>
                      <div>
                        <Label className="text-base font-semibold text-gray-800 dark:text-gray-200">
                          Additional Notes
                        </Label>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Any special instructions or requirements
                        </p>
                      </div>
                    </div>
                    
                    <Textarea
                      placeholder="Enter any additional notes, special instructions, or requirements for this customer order..."
                      value={form.watch("notes")}
                      onChange={(e) => form.setValue("notes", e.target.value)}
                      rows={4}
                      className="resize-none text-base border-2 border-gray-200 dark:border-gray-600 focus:border-slate-500 transition-colors"
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Order Items */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">Order Items</CardTitle>
              <Button
                type="button"
                onClick={() => setAddItemDialogOpen(true)}
                className="bg-[#5469D4] hover:bg-[#4356C7] text-white"
                disabled={!form.watch("customer_uuid") || !form.watch("currency")}
              >
                <Plus className="h-4 w-4 me-2" />
                Add Item
              </Button>
            </CardHeader>
            <CardContent>
              {items.length === 0 ? (
                <div className="text-center py-12">
                  <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-[#5469D4] to-[#4356C7] rounded-full flex items-center justify-center">
                    <Plus className="h-8 w-8 text-white" />
                  </div>
                  <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                    No items added yet
                  </h3>
                  <p className="text-gray-500 dark:text-gray-400 mb-6">
                    Add items to your customer order to get started.
                  </p>
                  <Button
                    type="button"
                    onClick={() => setAddItemDialogOpen(true)}
                    className="bg-[#5469D4] hover:bg-[#4356C7] text-white"
                    disabled={!form.watch("customer_uuid") || !form.watch("currency")}
                  >
                    <Plus className="h-4 w-4 me-2" />
                    Add First Item
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="border-b border-gray-200 dark:border-gray-700">
                        <tr>
                          <th className="text-start py-3 text-sm font-medium text-gray-500 dark:text-gray-400">Material</th>
                          <th className="text-start py-3 text-sm font-medium text-gray-500 dark:text-gray-400">Quantity</th>
                          <th className="text-start py-3 text-sm font-medium text-gray-500 dark:text-gray-400">Unit Price</th>
                          <th className="text-start py-3 text-sm font-medium text-gray-500 dark:text-gray-400">Total</th>
                          <th className="text-start py-3 text-sm font-medium text-gray-500 dark:text-gray-400">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                        {items.map((item, index) => (
                          <tr key={item.temp_id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                            <td className="py-4">
                              <div>
                                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                  {item.material_name || `Material ${item.material_uuid.substring(0, 8)}...`}
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
                                ${(item.quantity * item.price_per_unit).toFixed(2)}
                              </div>
                            </td>
                            <td className="py-4">
                              <div className="flex items-center gap-2">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => openEditDialog(item, index)}
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDeleteItem(index)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Total Section */}
                  <div className="flex justify-end pt-4 border-t border-gray-200 dark:border-gray-700">
                    <div className="text-end space-y-2">
                      <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                        Total: ${items.reduce((sum, item) => sum + (item.quantity * item.price_per_unit), 0).toFixed(2)}
                      </div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {items.length} item{items.length !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Bottom Action Buttons */}
          <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-end gap-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setLocation("/customer-orders")}
                className="px-6"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending}
                className="bg-[#5469D4] hover:bg-[#4356C7] text-white px-6"
              >
                {createMutation.isPending ? "Creating..." : "Create Customer Order"}
              </Button>
            </div>
          </div>
        </form>

        {/* Dialogs */}
        <AddItemDialog
          open={addItemDialogOpen}
          onOpenChange={setAddItemDialogOpen}
          onAddItem={handleAddItem}
        />
      </div>
    </AppLayout>
  );
}