import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  ArrowLeft, 
  Edit, 
  Trash2, 
  Phone, 
  Mail, 
  MapPin, 
  Building,
  User,
  Calendar,
  DollarSign,
  Copy,
  FileText,
  CreditCard,
  ClipboardList
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { Customer } from "@/lib/types";
import { EditCustomerDialog } from "@/components/customers/EditCustomerDialog";
import { CustomerDetailMap } from "@/components/map/CustomerDetailMap";

export default function CustomerDetail() {
  const { uuid } = useParams();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  // Fetch customer details
  const { data: customer, isLoading } = useQuery<Customer>({
    queryKey: ["/customer", uuid],
    queryFn: async () => {
      return await apiRequest(`/customer/${uuid}`);
    },
    enabled: !!uuid,
  });

  // Fetch customer categories for edit dialog
  const { data: categories } = useQuery<string[]>({
    queryKey: ["/customer/categories"],
  });

  // Delete customer mutation
  const deleteCustomerMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest(`/customer/${uuid}`, { method: "DELETE" });
    },
    onSuccess: () => {
      // Invalidate all customer queries to refresh the list
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const queryKey = query.queryKey[0] as string;
          return queryKey.includes("/customer");
        }
      });
      
      // Also refetch any active queries immediately
      queryClient.refetchQueries({
        predicate: (query) => {
          const queryKey = query.queryKey[0] as string;
          return queryKey.includes("/customer");
        }
      });
      
      toast({
        title: "Success",
        description: "Customer deleted successfully",
      });
      setLocation("/customers");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete customer",
        variant: "destructive",
      });
    },
  });

  const handleDeleteCustomer = () => {
    if (confirm(`Are you sure you want to delete ${customer?.company_name}? This action cannot be undone.`)) {
      deleteCustomerMutation.mutate();
    }
  };

  const handleCopyToClipboard = async (text: string, fieldName: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: "Copied to clipboard",
        description: `${fieldName} copied successfully.`,
      });
    } catch (error) {
      console.error("Failed to copy:", error);
      toast({
        title: "Copy failed",
        description: "Failed to copy to clipboard. Please try again.",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="container mx-auto px-4 py-8">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded mb-4 w-1/3"></div>
            <div className="space-y-4">
              <div className="h-32 bg-gray-200 rounded"></div>
              <div className="h-24 bg-gray-200 rounded"></div>
              <div className="h-24 bg-gray-200 rounded"></div>
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (!customer) {
    return (
      <AppLayout>
        <div className="container mx-auto px-4 py-8">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Customer Not Found</h2>
            <p className="text-gray-600 mb-6">The customer you're looking for doesn't exist.</p>
            <Button onClick={() => setLocation("/customers")}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Customers
            </Button>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center space-x-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLocation("/customers")}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">{customer.company_name}</h1>
              <p className="text-gray-600">{customer.full_name}</p>
            </div>
            <Badge variant="secondary" className="capitalize">
              {customer.category}
            </Badge>
          </div>
          
          <div className="flex space-x-2">
            <Button
              onClick={() => setLocation(`/customer-orders/create?customer_uuid=${customer.uuid}`)}
              className="bg-purple-600 hover:bg-purple-700 text-white"
            >
              <ClipboardList className="w-4 h-4 mr-2" />
              Create Customer Order
            </Button>
            <Button
              variant="outline"
              onClick={() => setEditDialogOpen(true)}
            >
              <Edit className="w-4 h-4 mr-2" />
              Edit
            </Button>
            <Button
              variant="outline"
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
              onClick={handleDeleteCustomer}
              disabled={deleteCustomerMutation.isPending}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Information */}
          <div className="lg:col-span-2 space-y-6">
            {/* Contact Information */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <User className="w-5 h-5 mr-2" />
                  Contact Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex items-center space-x-3">
                    <Building className="w-4 h-4 text-gray-500" />
                    <div>
                      <p className="text-sm text-gray-500">Company</p>
                      <div className="flex items-center gap-1">
                        <p className="font-medium">{customer.company_name}</p>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCopyToClipboard(customer.company_name, "Company name")}
                          className="h-5 w-5 p-0 hover:bg-gray-100"
                        >
                          <Copy className="w-3 h-3 text-gray-400" />
                        </Button>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3">
                    <User className="w-4 h-4 text-gray-500" />
                    <div>
                      <p className="text-sm text-gray-500">Contact Person</p>
                      <div className="flex items-center gap-1">
                        <p className="font-medium">{customer.full_name}</p>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCopyToClipboard(customer.full_name, "Contact person")}
                          className="h-5 w-5 p-0 hover:bg-gray-100"
                        >
                          <Copy className="w-3 h-3 text-gray-400" />
                        </Button>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3">
                    <Phone className="w-4 h-4 text-gray-500" />
                    <div>
                      <p className="text-sm text-gray-500">Phone</p>
                      <div className="flex items-center gap-1">
                        <p className="font-medium">{customer.phone_number}</p>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCopyToClipboard(customer.phone_number, "Phone number")}
                          className="h-5 w-5 p-0 hover:bg-gray-100"
                        >
                          <Copy className="w-3 h-3 text-gray-400" />
                        </Button>
                      </div>
                    </div>
                  </div>
                  {customer.email_address && (
                    <div className="flex items-center space-x-3">
                      <Mail className="w-4 h-4 text-gray-500" />
                      <div>
                        <p className="text-sm text-gray-500">Email</p>
                        <div className="flex items-center gap-1">
                          <p className="font-medium">{customer.email_address}</p>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleCopyToClipboard(customer.email_address, "Email address")}
                            className="h-5 w-5 p-0 hover:bg-gray-100"
                          >
                            <Copy className="w-3 h-3 text-gray-400" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                
                <Separator />
                
                <div className="flex items-start space-x-3">
                  <MapPin className="w-4 h-4 text-gray-500 mt-1" />
                  <div>
                    <p className="text-sm text-gray-500">Address</p>
                    <div className="flex items-start gap-1">
                      <p className="font-medium">{customer.full_address}</p>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCopyToClipboard(customer.full_address, "Address")}
                        className="h-5 w-5 p-0 hover:bg-gray-100 flex-shrink-0 mt-0.5"
                      >
                        <Copy className="w-3 h-3 text-gray-400" />
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Notes */}
            {customer.notes && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    Notes
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCopyToClipboard(customer.notes!, "Notes")}
                      className="h-5 w-5 p-0 hover:bg-gray-100"
                    >
                      <Copy className="w-3 h-3 text-gray-400" />
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-700 whitespace-pre-wrap">{customer.notes}</p>
                </CardContent>
              </Card>
            )}

            {/* Business Cards */}
            {customer.business_cards && (
              <Card>
                <CardHeader>
                  <CardTitle>Business Cards</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-700">{customer.business_cards}</p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Customer Details */}
            <Card>
              <CardHeader>
                <CardTitle>Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center space-x-3">
                  <Calendar className="w-4 h-4 text-gray-500" />
                  <div>
                    <p className="text-sm text-gray-500">Added</p>
                    <p className="font-medium">
                      {new Date(customer.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center space-x-3">
                  <Building className="w-4 h-4 text-gray-500" />
                  <div>
                    <p className="text-sm text-gray-500">Category</p>
                    <div className="flex items-center gap-1">
                      <Badge variant="secondary" className="capitalize">
                        {customer.category}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCopyToClipboard(customer.category, "Category")}
                        className="h-5 w-5 p-0 hover:bg-gray-100"
                      >
                        <Copy className="w-3 h-3 text-gray-400" />
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <CreditCard className="w-4 h-4 text-gray-500" />
                  <div>
                    <p className="text-sm text-gray-500">Customer ID</p>
                    <div className="flex items-center gap-1">
                      <p className="font-mono text-xs text-gray-600">{customer.uuid}</p>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCopyToClipboard(customer.uuid, "Customer ID")}
                        className="h-5 w-5 p-0 hover:bg-gray-100"
                      >
                        <Copy className="w-3 h-3 text-gray-400" />
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Balance per Currency */}
            {customer.balance_per_currency && Object.keys(customer.balance_per_currency).length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <DollarSign className="w-5 h-5 mr-2" />
                    Account Balance
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {Object.entries(customer.balance_per_currency).map(([currency, balance]) => (
                      <div key={currency} className="flex justify-between items-center">
                        <span className="text-sm text-gray-600 uppercase">{currency}</span>
                        <span className={`font-medium ${balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {balance >= 0 ? '+' : ''}{balance.toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* Customer Location Map */}
        <div className="mt-8">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <MapPin className="w-5 h-5 mr-2" />
            Customer Location
          </h3>
          <CustomerDetailMap customer={customer} />
        </div>

        {/* Edit Dialog */}
        {editDialogOpen && (
          <EditCustomerDialog
            customer={customer}
            categories={categories || []}
            open={editDialogOpen}
            onOpenChange={setEditDialogOpen}
          />
        )}
      </div>
    </AppLayout>
  );
}