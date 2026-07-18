import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Plus, FileText, CheckCircle, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { AppLayout } from "@/components/layout/AppLayout";
import { CreditNoteItemFilters } from "@/components/credit-note-items/CreditNoteItemFilters";

interface CreditNoteItem {
  uuid: string;
  amount: number;
  currency: string;
  notes?: string;
  invoice_item_uuid?: string;
  customer_uuid?: string;
  vendor_uuid?: string;
  purchase_order_item_uuid?: string;
  inventory_change?: number;
  status: string;
  created_at: string;
  is_deleted: boolean;
  amount_paid: number;
  amount_due: number;
  paid_at?: string;
  is_paid: boolean;
  created_by_uuid?: string;
}

interface CreditNoteItemPage {
  items: CreditNoteItem[];
  total_count: number;
  page: number;
  per_page: number;
  pages: number;
}

interface FilterParams {
  uuid?: string;
  invoice_item_uuid?: string;
  customer_order_item_uuid?: string;
  purchase_order_item_uuid?: string;
  customer_uuid?: string;
  vendor_uuid?: string;
  status?: string;
  is_paid?: boolean;
  page: number;
  per_page: number;
}

const getStatusColor = (status: string) => {
  switch (status?.toLowerCase()) {
    case 'draft': return 'bg-gray-100 text-gray-800';
    case 'sent': return 'bg-blue-100 text-blue-800';
    case 'paid': return 'bg-green-100 text-green-800';
    case 'overdue': return 'bg-red-100 text-red-800';
    case 'cancelled': return 'bg-gray-100 text-gray-800';
    default: return 'bg-gray-100 text-gray-800';
  }
};

const formatCurrency = (amount: number, currency: string) => {
  if (currency === 'SYP') return `${amount.toLocaleString()} SYP`;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency
  }).format(amount);
};



export default function CreditNoteItems() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState("all");

  const [filters, setFilters] = useState<FilterParams>({
    page: 1,
    per_page: 20
  });
  const [perPage, setPerPage] = useState(20);

  const { data, isLoading, error } = useQuery({
    queryKey: ["/credit-note-item/", filters],
    enabled: true
  });

  const creditNoteItemsData = data as CreditNoteItemPage | undefined;
  const creditNoteItems: CreditNoteItem[] = creditNoteItemsData?.items || [];
  const totalCount = creditNoteItemsData?.total_count || 0;
  const totalPages = creditNoteItemsData?.pages || 1;

  const handleFilterChange = (newFilters: Partial<FilterParams>) => {
    console.log("Filter change received:", newFilters);
    setFilters(prev => ({ ...prev, ...newFilters, page: 1 }));
  };

  const handlePerPageChange = (newPerPage: number) => {
    setPerPage(newPerPage);
    setFilters(prev => ({ ...prev, per_page: newPerPage, page: 1 }));
  };

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    const tabFilters: Partial<FilterParams> = {};
    
    switch (value) {
      case 'unpaid':
        tabFilters.is_paid = false;
        break;
      case 'paid':
        tabFilters.is_paid = true;
        break;
      case 'overdue':
        tabFilters.status = 'overdue';
        break;
      default:
        break;
    }
    
    setFilters(prev => ({ ...prev, ...tabFilters, page: 1 }));
  };

  const getTabCount = (tab: string) => {
    switch (tab) {
      case 'unpaid':
        return creditNoteItems.filter(item => !item.is_paid).length;
      case 'paid':
        return creditNoteItems.filter(item => item.is_paid).length;
      case 'overdue':
        return creditNoteItems.filter(item => item.status?.toLowerCase() === 'overdue').length;
      default:
        return totalCount;
    }
  };

  if (error) {
    return (
      <AppLayout>
        <div className="p-8">
          <div className="text-center">
            <p className="text-red-600">Error loading credit note items: {(error as Error).message}</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Credit Note Items</h1>
            <p className="text-muted-foreground">
              Manage credit note items and refunds ({totalCount} total)
            </p>
          </div>
          <div className="flex gap-2">
            <CreditNoteItemFilters 
              filters={filters}
              onFiltersChange={handleFilterChange}
              totalCount={totalCount}
              perPage={perPage}
              onPerPageChange={handlePerPageChange}
            />
            <Button onClick={() => setLocation("/credit-note-items/create")} className="bg-purple-600 hover:bg-purple-700">
              <Plus className="h-4 w-4 me-2" />
              Add Credit Note Item
            </Button>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="all">All ({getTabCount('all')})</TabsTrigger>
            <TabsTrigger value="unpaid">Unpaid ({getTabCount('unpaid')})</TabsTrigger>
            <TabsTrigger value="paid">Paid ({getTabCount('paid')})</TabsTrigger>
            <TabsTrigger value="overdue">Overdue ({getTabCount('overdue')})</TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab} className="space-y-4">
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
                        Amount Due
                      </th>
                      <th className="px-6 py-3 text-start text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                        Reference
                      </th>
                      <th className="px-6 py-3 text-start text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-start text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                        Created
                      </th>
                      <th className="px-6 py-3 text-start text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                        Notes
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
                              <div className="h-4 bg-gray-200 dark:bg-gray-600 rounded w-32"></div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="animate-pulse">
                              <div className="h-4 bg-gray-200 dark:bg-gray-600 rounded w-20"></div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="animate-pulse">
                              <div className="h-4 bg-gray-200 dark:bg-gray-600 rounded w-28"></div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="animate-pulse">
                              <div className="h-4 bg-gray-200 dark:bg-gray-600 rounded w-40"></div>
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : creditNoteItems.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-6 py-16 text-center">
                          <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                            No credit note items found
                          </h3>
                          <p className="text-gray-500 dark:text-gray-400 mb-6">
                            Get started by creating your first credit note item to track refunds and adjustments.
                          </p>
                          <Button 
                            onClick={() => setLocation("/credit-note-items/create")}
                            className="bg-purple-600 hover:bg-purple-700"
                          >
                            <Plus className="h-4 w-4 me-2" />
                            Create Credit Note Item
                          </Button>
                        </td>
                      </tr>
                    ) : (
                      creditNoteItems.map((item) => (
                        <tr 
                          key={item.uuid}
                          className="hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
                          onClick={() => setLocation(`/credit-note-items/${item.uuid}`)}
                        >
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                {formatCurrency(item.amount, item.currency)}
                              </span>
                              {item.is_paid && (
                                <CheckCircle className="h-4 w-4 text-green-500" />
                              )}
                              <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                                item.is_paid 
                                  ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300'
                                  : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300'
                              }`}>
                                {item.is_paid ? 'Paid' : 'Unpaid'}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                              {item.amount_due > 0 ? formatCurrency(item.amount_due, item.currency) : '—'}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex flex-col">
                              {item.invoice_item_uuid && (
                                <span className="text-xs text-purple-600 font-medium">Invoice Item</span>
                              )}
                              {item.customer_uuid && (
                                <span className="text-xs text-blue-600 font-medium">Customer</span>
                              )}
                              {item.vendor_uuid && (
                                <span className="text-xs text-green-600 font-medium">Vendor</span>
                              )}
                              {item.purchase_order_item_uuid && (
                                <span className="text-xs text-orange-600 font-medium">Purchase Order Item</span>
                              )}
                              <span className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                                {(item.invoice_item_uuid || item.customer_uuid || item.vendor_uuid || item.purchase_order_item_uuid || '').slice(0, 8)}...
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(item.status)}`}>
                              {item.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400">
                              <Calendar className="h-3 w-3" />
                              {new Date(item.created_at).toLocaleDateString()}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                              {item.notes || '—'}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {totalPages > 1 && (
              <div className="flex justify-between items-center pt-4">
                <Button
                  variant="outline"
                  onClick={() => setFilters(prev => ({ ...prev, page: Math.max(1, prev.page - 1) }))}
                  disabled={filters.page <= 1}
                >
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {filters.page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  onClick={() => setFilters(prev => ({ ...prev, page: Math.min(totalPages, prev.page + 1) }))}
                  disabled={filters.page >= totalPages}
                >
                  Next
                </Button>
              </div>
            )}
          </TabsContent>
        </Tabs>


      </div>
    </AppLayout>
  );
}