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
import { useLanguage } from "@/contexts/LanguageContext";
import { CustomerActivity } from "@/components/customers/CustomerActivity";
import type { Customer } from "@/lib/types";
import { EditCustomerDialog } from "@/components/customers/EditCustomerDialog";
import { CustomerDetailMap } from "@/components/map/CustomerDetailMap";

export default function CustomerDetail() {
  const { t, te } = useLanguage();
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
        title: t('common.success'),
        description: t('customers.deleteSuccess'),
      });
      setLocation("/customers");
    },
    onError: (error: any) => {
      toast({
        title: t('common.error'),
        description: error.message || t('customers.deleteFailed'),
        variant: "destructive",
      });
    },
  });

  const handleDeleteCustomer = () => {
    if (confirm(t('customers.deleteConfirm', { name: customer?.company_name || '' }))) {
      deleteCustomerMutation.mutate();
    }
  };

  const handleCopyToClipboard = async (text: string, fieldName: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: t('customers.copiedTitle'),
        description: t('customers.copiedDesc', { field: fieldName }),
      });
    } catch (error) {
      console.error("Failed to copy:", error);
      toast({
        title: t('customers.copyFailedTitle'),
        description: t('customers.copyFailedDesc'),
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
            <h2 className="text-2xl font-bold text-gray-900 mb-4">{t('customers.notFoundTitle')}</h2>
            <p className="text-gray-600 mb-6">{t('customers.notFoundDesc')}</p>
            <Button onClick={() => setLocation("/customers")}>
              <ArrowLeft className="w-4 h-4 me-2" />
              {t('customers.backToCustomers')}
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
          <div className="flex items-center space-x-4 rtl:space-x-reverse">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLocation("/customers")}
            >
              <ArrowLeft className="w-4 h-4 me-2" />
              {t('common.back')}
            </Button>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">{customer.company_name}</h1>
              <p className="text-gray-600">{customer.full_name}</p>
            </div>
            <Badge variant="secondary" className="capitalize">
              {te(customer.category)}
            </Badge>
          </div>
          
          <div className="flex space-x-2 rtl:space-x-reverse">
            <Button
              onClick={() => setLocation(`/customer-orders/create?customer_uuid=${customer.uuid}`)}
              className="bg-purple-600 hover:bg-purple-700 text-white"
            >
              <ClipboardList className="w-4 h-4 me-2" />
              {t('customers.createOrder')}
            </Button>
            <Button
              variant="outline"
              onClick={() => setEditDialogOpen(true)}
            >
              <Edit className="w-4 h-4 me-2" />
              {t('common.edit')}
            </Button>
            <Button
              variant="outline"
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
              onClick={handleDeleteCustomer}
              disabled={deleteCustomerMutation.isPending}
            >
              <Trash2 className="w-4 h-4 me-2" />
              {t('common.delete')}
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
                  <User className="w-5 h-5 me-2" />
                  {t('customers.contactInformation')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex items-center space-x-3 rtl:space-x-reverse">
                    <Building className="w-4 h-4 text-gray-500" />
                    <div>
                      <p className="text-sm text-gray-500">{t('customers.company')}</p>
                      <div className="flex items-center gap-1">
                        <p className="font-medium">{customer.company_name}</p>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCopyToClipboard(customer.company_name, t('common.companyName'))}
                          className="h-5 w-5 p-0 hover:bg-gray-100"
                        >
                          <Copy className="w-3 h-3 text-gray-400" />
                        </Button>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3 rtl:space-x-reverse">
                    <User className="w-4 h-4 text-gray-500" />
                    <div>
                      <p className="text-sm text-gray-500">{t('customers.contactPerson')}</p>
                      <div className="flex items-center gap-1">
                        <p className="font-medium">{customer.full_name}</p>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCopyToClipboard(customer.full_name, t('customers.contactPerson'))}
                          className="h-5 w-5 p-0 hover:bg-gray-100"
                        >
                          <Copy className="w-3 h-3 text-gray-400" />
                        </Button>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3 rtl:space-x-reverse">
                    <Phone className="w-4 h-4 text-gray-500" />
                    <div>
                      <p className="text-sm text-gray-500">{t('common.phone')}</p>
                      <div className="flex items-center gap-1">
                        <p className="font-medium">{customer.phone_number}</p>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCopyToClipboard(customer.phone_number, t('customers.phoneNumber'))}
                          className="h-5 w-5 p-0 hover:bg-gray-100"
                        >
                          <Copy className="w-3 h-3 text-gray-400" />
                        </Button>
                      </div>
                    </div>
                  </div>
                  {customer.email_address && (
                    <div className="flex items-center space-x-3 rtl:space-x-reverse">
                      <Mail className="w-4 h-4 text-gray-500" />
                      <div>
                        <p className="text-sm text-gray-500">{t('common.email')}</p>
                        <div className="flex items-center gap-1">
                          <p className="font-medium">{customer.email_address}</p>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleCopyToClipboard(customer.email_address, t('customers.emailAddress'))}
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
                
                <div className="flex items-start space-x-3 rtl:space-x-reverse">
                  <MapPin className="w-4 h-4 text-gray-500 mt-1" />
                  <div>
                    <p className="text-sm text-gray-500">{t('common.address')}</p>
                    <div className="flex items-start gap-1">
                      <p className="font-medium">{customer.full_address}</p>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCopyToClipboard(customer.full_address, t('common.address'))}
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
                    {t('common.notes')}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCopyToClipboard(customer.notes!, t('common.notes'))}
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
                  <CardTitle>{t('customers.businessCards')}</CardTitle>
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
                <CardTitle>{t('common.details')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center space-x-3 rtl:space-x-reverse">
                  <Calendar className="w-4 h-4 text-gray-500" />
                  <div>
                    <p className="text-sm text-gray-500">{t('customers.added')}</p>
                    <p className="font-medium">
                      {new Date(customer.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center space-x-3 rtl:space-x-reverse">
                  <Building className="w-4 h-4 text-gray-500" />
                  <div>
                    <p className="text-sm text-gray-500">{t('common.category')}</p>
                    <div className="flex items-center gap-1">
                      <Badge variant="secondary" className="capitalize">
                        {te(customer.category)}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCopyToClipboard(customer.category, t('common.category'))}
                        className="h-5 w-5 p-0 hover:bg-gray-100"
                      >
                        <Copy className="w-3 h-3 text-gray-400" />
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-3 rtl:space-x-reverse">
                  <CreditCard className="w-4 h-4 text-gray-500" />
                  <div>
                    <p className="text-sm text-gray-500">{t('customers.customerId')}</p>
                    <div className="flex items-center gap-1">
                      <p className="font-mono text-xs text-gray-600">{customer.uuid}</p>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCopyToClipboard(customer.uuid, t('customers.customerId'))}
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
                    <DollarSign className="w-5 h-5 me-2" />
                    {t('customers.accountBalance')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {Object.entries(customer.balance_per_currency).map(([currency, balance]) => (
                      <div key={currency} className="flex justify-between items-center">
                        <span className="text-sm text-gray-600 uppercase">{te(currency)}</span>
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

        {/* Orders + trip stops */}
        <CustomerActivity customerUuid={customer.uuid} />

        {/* Customer Location Map */}
        <div className="mt-8">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <MapPin className="w-5 h-5 me-2" />
            {t('customers.customerLocation')}
          </h3>
          <div dir="ltr">
            <CustomerDetailMap customer={customer} />
          </div>
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