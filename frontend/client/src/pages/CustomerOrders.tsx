import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { ShoppingBag, Plus, CheckCircle } from "lucide-react";
import { CustomerOrderFilters } from "@/components/customer-orders/CustomerOrderFilters";
import { useLanguage } from "@/contexts/LanguageContext";
import { format } from "date-fns";

interface CustomerOrder {
  uuid: string;
  created_by_uuid?: string;
  customer_uuid: string;
  customer_name?: string;
  customer_company_name?: string;
  customer_full_name?: string;
  created_at: string;
  is_fulfilled: boolean;
  fulfilled_at?: string;
  is_deleted: boolean;
  total_adjusted_amount: number;
  is_overdue: boolean;
  net_amount_due?: number;
  net_amount_paid?: number;
  trip_stop_uuid?: string;
  is_paid?: boolean;
  notes?: string;
  currency?: string;
}

interface CustomerOrderPage {
  customer_orders?: CustomerOrder[];
  orders?: CustomerOrder[];
  items?: CustomerOrder[];
  data?: CustomerOrder[];
  total_count?: number;
  count?: number;
  page?: number;
  per_page?: number;
  pages?: number;
}

interface CustomerOrderFilters {
  uuid?: string;
  customer_uuid?: string;
  is_paid?: boolean;
  is_overdue?: boolean;
  is_fulfilled?: boolean;
  start_date?: string;
  end_date?: string;
}

export default function CustomerOrders() {
  const { t } = useLanguage();
  const [, setLocation] = useLocation();
  const [filters, setFilters] = useState<CustomerOrderFilters>({});
  const [currentPage, setCurrentPage] = useState(1);
  const [perPage, setPerPage] = useState(20);
  const [activeTab, setActiveTab] = useState('all');

  // Currency formatting function
  const formatCurrency = (amount: number | undefined, currency: string = 'USD') => {
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
      'SYP': 'SYP ',
    };
    
    const symbol = currencySymbols[currency] || `${currency} `;
    return `${symbol}${amount.toFixed(2)}`;
  };

  const {
    data: customerOrderData,
    isLoading,
    error,
    refetch,
  } = useQuery<CustomerOrderPage>({
    queryKey: ["/customer-order/", { ...filters, page: currentPage, per_page: perPage }],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append("page", currentPage.toString());
      params.append("per_page", perPage.toString());
      
      Object.entries(filters as Record<string, any>).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== "") {
          params.append(key, value.toString());
        }
      });
      
      const fullUrl = `/customer-order/?${params.toString()}`;
      
      try {
        console.log('Fetching customer orders from:', fullUrl);
        console.log('Auth token available:', !!localStorage.getItem('auth_token'));
        const result = await apiRequest(fullUrl);
        console.log('Raw API result:', result);
        console.log('Result type:', typeof result);
        console.log('Result keys:', result ? Object.keys(result) : 'no keys');
        
        // Check if result has the expected structure
        if (result && typeof result === 'object') {
          console.log('Available fields in result:', Object.keys(result));
          console.log('Customer orders in result:', result.customer_orders);
          console.log('Orders in result:', result.orders);
          console.log('Items in result:', result.items);
          console.log('Data in result:', result.data);
          console.log('Total count:', result.total_count);
          console.log('Count:', result.count);
        }
        
        return result;
      } catch (err) {
        console.error('Customer orders API call failed:', err);
        console.error('Error details:', err);
        throw err;
      }
    },
    enabled: true,
    retry: 1,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  });

  React.useEffect(() => {
    console.log('CustomerOrders component mounted, starting fetch...');
    refetch();
  }, [refetch]);

  const handleFilterChange = (newFilters: Omit<CustomerOrderFilters, 'page' | 'per_page'>) => {
    setFilters(newFilters);
    setCurrentPage(1);
  };

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    let newFilters: CustomerOrderFilters = {};
    
    switch (tab) {
      case 'unpaid':
        newFilters = { is_paid: false };
        break;
      case 'unfulfilled':
        newFilters = { is_fulfilled: false };
        break;
      case 'pastdue':
        newFilters = { is_overdue: true };
        break;
      case 'paid':
        newFilters = { is_paid: true };
        break;
      default:
        newFilters = {};
    }
    
    setFilters(newFilters);
    setCurrentPage(1);
  };

  const handlePerPageChange = (newPerPage: number) => {
    setPerPage(newPerPage);
    setCurrentPage(1);
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  console.log('CustomerOrders render - data:', customerOrderData, 'loading:', isLoading, 'error:', error);
  console.log('customerOrderData keys:', customerOrderData ? Object.keys(customerOrderData) : 'no data');
  console.log('customerOrderData structure:', JSON.stringify(customerOrderData, null, 2));
  
  // Handle different possible API response structures
  let customerOrders = [];
  let totalCount = 0;
  
  if (customerOrderData) {
    // If the API returns an array directly
    if (Array.isArray(customerOrderData)) {
      customerOrders = customerOrderData;
      totalCount = customerOrderData.length;
    } 
    // If the API returns an object with various possible field names
    else if (typeof customerOrderData === 'object') {
      customerOrders = customerOrderData.customer_orders || 
                      customerOrderData.orders || 
                      customerOrderData.items || 
                      customerOrderData.data || 
                      [];
      totalCount = customerOrderData.total_count || 
                   customerOrderData.count || 
                   customerOrders.length || 
                   0;
    }
  }
  
  const totalPages = Math.ceil(totalCount / perPage);
  
  console.log('Final extracted customerOrders:', customerOrders);
  console.log('Final customerOrders length:', customerOrders.length);
  console.log('Final customerOrders first item:', customerOrders[0]);
  console.log('Final totalCount:', totalCount);

  return (
    <AppLayout>
      <div className="p-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-medium text-gray-900 dark:text-gray-100 mb-2">{t('nav.customerOrders')}</h1>
        </div>

        {/* Tab Navigation and Actions */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-1 border-b border-gray-200 dark:border-gray-700">
            <button 
              onClick={() => handleTabChange('all')}
              className={`px-4 py-2 text-sm font-medium ${
                activeTab === 'all' 
                  ? 'text-[#5469D4] border-b-2 border-[#5469D4]' 
                  : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
            >
              {t('customerOrders.tabAll')}
            </button>
            <button 
              onClick={() => handleTabChange('unpaid')}
              className={`px-4 py-2 text-sm font-medium ${
                activeTab === 'unpaid' 
                  ? 'text-[#5469D4] border-b-2 border-[#5469D4]' 
                  : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
            >
              {t('customerOrders.unpaid')}
            </button>
            <button 
              onClick={() => handleTabChange('unfulfilled')}
              className={`px-4 py-2 text-sm font-medium ${
                activeTab === 'unfulfilled' 
                  ? 'text-[#5469D4] border-b-2 border-[#5469D4]' 
                  : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
            >
              {t('customerOrders.unfulfilled')}
            </button>
            <button 
              onClick={() => handleTabChange('pastdue')}
              className={`px-4 py-2 text-sm font-medium ${
                activeTab === 'pastdue' 
                  ? 'text-[#5469D4] border-b-2 border-[#5469D4]' 
                  : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
            >
              {t('customerOrders.tabPastDue')}
            </button>
            <button 
              onClick={() => handleTabChange('paid')}
              className={`px-4 py-2 text-sm font-medium ${
                activeTab === 'paid' 
                  ? 'text-[#5469D4] border-b-2 border-[#5469D4]' 
                  : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
            >
              {t('customerOrders.paid')}
            </button>
          </div>
          
          <div className="flex items-center gap-3">
            <CustomerOrderFilters
              filters={filters}
              onFiltersChange={handleFilterChange}
              totalCount={totalCount}
              perPage={perPage}
              onPerPageChange={handlePerPageChange}
            />
            <Button 
              onClick={() => setLocation("/customer-orders/create")}
              className="bg-[#5469D4] hover:bg-[#4356C7] text-white"
            >
              {t('customerOrders.createOrder')}
            </Button>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-6 py-3 text-start text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    {t('common.amount')}
                  </th>
                  <th className="px-6 py-3 text-start text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    {t('customerOrders.netAmountPaid')}
                  </th>
                  <th className="px-6 py-3 text-start text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    {t('customerOrders.company')}
                  </th>
                  <th className="px-6 py-3 text-start text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    {t('customerOrders.customer')}
                  </th>
                  <th className="px-6 py-3 text-start text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    {t('customerOrders.fulfillment')}
                  </th>
                  <th className="px-6 py-3 text-start text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    {t('common.status')}
                  </th>
                  <th className="px-6 py-3 text-start text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    {t('customerOrders.created')}
                  </th>
                  <th className="px-6 py-3 text-end text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    {t('common.actions')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {isLoading ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-16 text-center">
                      <div className="animate-pulse space-y-4">
                        <div className="h-4 bg-gray-200 dark:bg-gray-600 rounded w-32 mx-auto"></div>
                        <div className="h-4 bg-gray-200 dark:bg-gray-600 rounded w-48 mx-auto"></div>
                        <div className="h-4 bg-gray-200 dark:bg-gray-600 rounded w-24 mx-auto"></div>
                      </div>
                      <p className="mt-4 text-gray-500 dark:text-gray-400">{t('customerOrders.loadingOrders')}</p>
                    </td>
                  </tr>
                ) : customerOrders.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-16 text-center">
                      <ShoppingBag className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                      <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                        {error ? t('customerOrders.authRequired') : t('customerOrders.noOrders')}
                      </h3>
                      <p className="text-gray-500 dark:text-gray-400 mb-6">
                        {error?.message?.includes('JWT') || error?.message?.includes('Authorization')
                          ? t('customerOrders.loginPrompt')
                          : error ? t('customerOrders.errorWithMessage', { message: error.message }) : t('customerOrders.getStarted')}
                      </p>
                      {!error && (
                        <Button 
                          onClick={() => setLocation("/customer-orders/create")}
                          className="bg-[#5469D4] hover:bg-[#4356C7] text-white"
                        >
                          {t('customerOrders.createOrder')}
                        </Button>
                      )}
                    </td>
                  </tr>
                ) : (
                  customerOrders.map((order) => (
                    <tr 
                      key={order.uuid}
                      className="hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
                      onClick={() => setLocation(`/customer-orders/${order.uuid}`)}
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            {formatCurrency(order.total_adjusted_amount, order.currency)}
                          </span>
                          {order.is_paid && (
                            <CheckCircle className="h-4 w-4 text-green-500" />
                          )}
                          <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                            order.is_paid 
                              ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300'
                              : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300'
                          }`}>
                            {order.is_paid ? t('customerOrders.paid') : t('customerOrders.unpaid')}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          {formatCurrency(order.net_amount_paid, order.currency)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-gray-900 dark:text-gray-100" data-testid={`text-order-company-${order.uuid}`}>
                          {order.customer_company_name || "—"}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-gray-900 dark:text-gray-100" data-testid={`text-order-customer-${order.uuid}`}>
                          {order.customer_full_name || order.customer_name || order.customer_uuid.slice(0, 8)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                          order.is_fulfilled 
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300'
                            : 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-300'
                        }`}>
                          {order.is_fulfilled ? t('customerOrders.fulfilled') : t('customerOrders.pending')}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          {order.is_overdue && (
                            <span className="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300">
                              {t('customerOrders.overdue')}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                          {format(new Date(order.created_at), 'MMM d, h:mm a')}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-end">
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setLocation(`/customer-orders/${order.uuid}`);
                          }}
                        >
                          {t('common.view')}
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    {t('common.showing', { from: ((currentPage - 1) * perPage) + 1, to: Math.min(currentPage * perPage, totalCount), total: totalCount })} {t('common.results')}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                  >
                    {t('common.previous')}
                  </Button>
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    {t('common.page')} {currentPage} {t('common.of')} {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                  >
                    {t('common.next')}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}