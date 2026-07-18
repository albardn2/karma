import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { ShoppingCart, Plus, CheckCircle } from "lucide-react";
import { PurchaseOrderFilters } from "@/components/purchase-orders/PurchaseOrderFilters";
import { format } from "date-fns";

interface PurchaseOrder {
  uuid: string;
  created_by_uuid?: string;
  vendor_uuid: string;
  vendor_name?: string;
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
}

interface PurchaseOrderPage {
  purchase_orders: PurchaseOrder[];
  total_count: number;
  page: number;
  per_page: number;
  pages: number;
}

interface PurchaseOrderFilters {
  uuid?: string;
  vendor_uuid?: string;
  is_paid?: boolean;
  is_overdue?: boolean;
  is_fulfilled?: boolean;
  start_date?: string;
  end_date?: string;
}

export default function PurchaseOrders() {
  const [, setLocation] = useLocation();
  const [filters, setFilters] = useState<PurchaseOrderFilters>({});
  const [currentPage, setCurrentPage] = useState(1);
  const [perPage, setPerPage] = useState(20);
  const [activeTab, setActiveTab] = useState('all');

  const {
    data: purchaseOrderData,
    isLoading,
    error,
    refetch,
  } = useQuery<PurchaseOrderPage>({
    queryKey: ["/purchase-order/", { ...filters, page: currentPage, per_page: perPage }],
    queryFn: async () => {
      const url = "/purchase-order/";
      const params = { ...filters, page: currentPage, per_page: perPage };
      const searchParams = new URLSearchParams();
      
      Object.entries(params as Record<string, any>).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== "") {
          searchParams.append(key, value.toString());
        }
      });
      const fullUrl = `${url}?${searchParams.toString()}`;
      
      try {
        const result = await apiRequest(fullUrl);
        return result;
      } catch (err) {
        console.error('API call failed:', err);
        throw err;
      }
    },
    enabled: true,
    retry: 1,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  });

  React.useEffect(() => {
    refetch();
  }, []);

  const handleFilterChange = (newFilters: Omit<PurchaseOrderFilters, 'page' | 'per_page'>) => {
    setFilters(newFilters);
    setCurrentPage(1);
  };

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    let newFilters: PurchaseOrderFilters = {};
    
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

  const purchaseOrders = purchaseOrderData?.purchase_orders || [];
  const totalCount = purchaseOrderData?.total_count || 0;
  const totalPages = Math.ceil(totalCount / perPage);

  return (
    <AppLayout>
      <div className="p-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-medium text-gray-900 dark:text-gray-100 mb-2">Purchase Orders</h1>
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
              All orders
            </button>
            <button 
              onClick={() => handleTabChange('unpaid')}
              className={`px-4 py-2 text-sm font-medium ${
                activeTab === 'unpaid' 
                  ? 'text-[#5469D4] border-b-2 border-[#5469D4]' 
                  : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
            >
              Unpaid
            </button>
            <button 
              onClick={() => handleTabChange('unfulfilled')}
              className={`px-4 py-2 text-sm font-medium ${
                activeTab === 'unfulfilled' 
                  ? 'text-[#5469D4] border-b-2 border-[#5469D4]' 
                  : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
            >
              Unfulfilled
            </button>
            <button 
              onClick={() => handleTabChange('pastdue')}
              className={`px-4 py-2 text-sm font-medium ${
                activeTab === 'pastdue' 
                  ? 'text-[#5469D4] border-b-2 border-[#5469D4]' 
                  : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
            >
              Past due
            </button>
            <button 
              onClick={() => handleTabChange('paid')}
              className={`px-4 py-2 text-sm font-medium ${
                activeTab === 'paid' 
                  ? 'text-[#5469D4] border-b-2 border-[#5469D4]' 
                  : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
            >
              Paid
            </button>
          </div>
          
          <div className="flex items-center gap-3">
            <PurchaseOrderFilters
              filters={filters}
              onFiltersChange={handleFilterChange}
              totalCount={totalCount}
              perPage={perPage}
              onPerPageChange={handlePerPageChange}
            />
            <Button 
              onClick={() => setLocation("/purchase-orders/create")}
              className="bg-[#5469D4] hover:bg-[#4356C7] text-white"
            >
              Create order
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
                    Amount
                  </th>
                  <th className="px-6 py-3 text-start text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Net Amount Paid
                  </th>
                  <th className="px-6 py-3 text-start text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Vendor
                  </th>
                  <th className="px-6 py-3 text-start text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Fulfillment
                  </th>
                  <th className="px-6 py-3 text-start text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Due
                  </th>
                  <th className="px-6 py-3 text-start text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Created
                  </th>
                  <th className="px-6 py-3 text-end text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="animate-pulse">
                          <div className="h-4 bg-gray-200 dark:bg-gray-600 rounded w-20"></div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="animate-pulse">
                          <div className="h-4 bg-gray-200 dark:bg-gray-600 rounded w-24"></div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="animate-pulse">
                          <div className="h-4 bg-gray-200 dark:bg-gray-600 rounded w-40"></div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="animate-pulse">
                          <div className="h-4 bg-gray-200 dark:bg-gray-600 rounded w-20"></div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="animate-pulse">
                          <div className="h-4 bg-gray-200 dark:bg-gray-600 rounded w-24"></div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="animate-pulse">
                          <div className="h-4 bg-gray-200 dark:bg-gray-600 rounded w-28"></div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-end">
                        <div className="animate-pulse">
                          <div className="h-4 bg-gray-200 dark:bg-gray-600 rounded w-16 ms-auto"></div>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : purchaseOrders.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-16 text-center">
                      <ShoppingCart className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                      <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                        No purchase orders
                      </h3>
                      <p className="text-gray-500 dark:text-gray-400 mb-6">
                        Get started by creating your first purchase order.
                      </p>
                      <Button 
                        onClick={() => setLocation("/purchase-orders/create")}
                        className="bg-[#5469D4] hover:bg-[#4356C7] text-white"
                      >
                        Create order
                      </Button>
                    </td>
                  </tr>
                ) : (
                  purchaseOrders.map((order) => (
                    <tr 
                      key={order.uuid}
                      className="hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
                      onClick={() => setLocation(`/purchase-orders/${order.uuid}`)}
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            ${order.total_adjusted_amount?.toFixed(2) || '0.00'}
                          </span>
                          <span className="text-sm text-gray-500 dark:text-gray-400">
                            {order.currency}
                          </span>
                          {order.is_paid && (
                            <CheckCircle className="h-4 w-4 text-green-500" />
                          )}
                          <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                            order.is_paid 
                              ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300'
                              : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300'
                          }`}>
                            {order.is_paid ? 'Paid' : order.status}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          ${order.net_amount_paid?.toFixed(2) || '0.00'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-gray-900 dark:text-gray-100">
                          {order.vendor_name || order.vendor_uuid}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                          order.is_fulfilled 
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300'
                            : 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-300'
                        }`}>
                          {order.is_fulfilled ? 'Fulfilled' : 'Pending'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-500 dark:text-gray-400">
                            {order.payout_due_date 
                              ? format(new Date(order.payout_due_date), 'MMM d, h:mm a')
                              : '—'
                            }
                          </span>
                          {order.is_overdue && (
                            <span className="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300">
                              Overdue
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
                        <button 
                          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-6 px-6 py-4 bg-gray-50 dark:bg-gray-700 border-t border-gray-200 dark:border-gray-600">
            <div>
              <span className="text-sm text-gray-700 dark:text-gray-300">
                Showing {(currentPage - 1) * perPage + 1} to {Math.min(currentPage * perPage, totalCount)} of {totalCount} results
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="text-gray-600 border-gray-300"
              >
                Previous
              </Button>
              <span className="text-sm text-gray-500 dark:text-gray-400 px-3">
                Page {currentPage} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="text-gray-600 border-gray-300"
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}