import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Plus, FileText, CheckCircle, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { AppLayout } from "@/components/layout/AppLayout";
import { DebitNoteItemFilters } from "@/components/debit-note-items/DebitNoteItemFilters";
import { useLanguage } from "@/contexts/LanguageContext";

interface DebitNoteItem {
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

interface DebitNoteItemPage {
  items: DebitNoteItem[];
  total_count: number;
  page: number;
  per_page: number;
  pages: number;
}

const formatCurrency = (amount: number, currency: string) => {
  if (!currency || currency === 'SYP') return `${amount.toLocaleString()} SYP`;
  
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency
    }).format(amount);
  } catch (error) {
    return `${amount.toLocaleString()} ${currency}`;
  }
};

const getReferenceIcon = (item: DebitNoteItem) => {
  if (item.invoice_item_uuid) return "📄";
  if (item.customer_uuid) return "👤";
  if (item.vendor_uuid) return "📦";
  if (item.purchase_order_item_uuid) return "🛒";
  return "📝";
};

const getReferenceType = (item: DebitNoteItem) => {
  if (item.invoice_item_uuid) return "notes.refInvoiceItem";
  if (item.customer_uuid) return "notes.refCustomer";
  if (item.vendor_uuid) return "notes.refVendor";
  if (item.purchase_order_item_uuid) return "notes.refPurchaseOrderItem";
  return "common.unknown";
};

const getReferenceColor = (item: DebitNoteItem) => {
  if (item.invoice_item_uuid) return "bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-300";
  if (item.customer_uuid) return "bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300";
  if (item.vendor_uuid) return "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300";
  if (item.purchase_order_item_uuid) return "bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-300";
  return "bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-300";
};

export default function DebitNoteItems() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { t, te } = useLanguage();
  const [activeTab, setActiveTab] = useState("all");
  const [filters, setFilters] = useState({
    uuid: "",
    invoice_item_uuid: "",
    customer_order_item_uuid: "",
    purchase_order_item_uuid: "",
    customer_uuid: "",
    vendor_uuid: "",
    status: "",
    is_paid: undefined as boolean | undefined
  });
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);

  // Build query parameters for API
  const buildQueryParams = () => {
    const params = new URLSearchParams();
    
    // Add filters
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== "" && value !== undefined && value !== null) {
        params.append(key, value.toString());
      }
    });

    // Add tab-based filters
    if (activeTab === "unpaid") {
      params.append("is_paid", "false");
    } else if (activeTab === "paid") {
      params.append("is_paid", "true");
    } else if (activeTab === "overdue") {
      params.append("status", "overdue");
    }

    // Add pagination
    params.append("page", page.toString());
    params.append("per_page", perPage.toString());

    return params.toString();
  };

  const { data: debitNoteItemsPage, isLoading, error } = useQuery<DebitNoteItemPage>({
    queryKey: ["/debit-note-item/", filters, activeTab, page, perPage],
    queryFn: async () => {
      const queryParams = buildQueryParams();
      const url = `/debit-note-item/${queryParams ? '?' + queryParams : ''}`;
      
      // Use apiRequest from queryClient instead of direct fetch
      const { apiRequest } = await import("@/lib/queryClient");
      return await apiRequest(url);
    },
    staleTime: 30000
  });

  const debitNoteItems = debitNoteItemsPage?.items || [];
  const totalCount = debitNoteItemsPage?.total_count || 0;

  const getTabCount = (tab: string) => {
    if (!debitNoteItemsPage) return 0;
    
    switch (tab) {
      case "all":
        return totalCount;
      case "unpaid":
        return debitNoteItems.filter(item => !item.is_paid).length;
      case "paid":
        return debitNoteItems.filter(item => item.is_paid).length;
      case "overdue":
        return debitNoteItems.filter(item => item.status === "overdue").length;
      default:
        return 0;
    }
  };

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    setPage(1); // Reset to first page when changing tabs
  };

  const handleFilterChange = (newFilters: typeof filters) => {
    setFilters(newFilters);
    setPage(1); // Reset to first page when filters change
  };

  const handlePerPageChange = (newPerPage: number) => {
    setPerPage(newPerPage);
    setPage(1); // Reset to first page when per page changes
  };

  if (error) {
    return (
      <AppLayout>
        <div className="p-8">
          <div className="text-center">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">{t('notes.debitErrorLoadingTitle')}</h3>
            <p className="text-red-600">{(error as Error).message}</p>
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
            <h1 className="text-3xl font-bold">{t('nav.debitNoteItems')}</h1>
            <p className="text-muted-foreground">
              {t('notes.debitSubtitle', { count: totalCount })}
            </p>
          </div>
          <div className="flex gap-2">
            <DebitNoteItemFilters 
              filters={filters}
              onFiltersChange={handleFilterChange}
              totalCount={totalCount}
              perPage={perPage}
              onPerPageChange={handlePerPageChange}
            />
            <Button onClick={() => setLocation("/debit-note-items/create")} className="bg-purple-600 hover:bg-purple-700">
              <Plus className="h-4 w-4 me-2" />
              {t('notes.addDebitItem')}
            </Button>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="all">{t('notes.tabAll', { count: getTabCount('all') })}</TabsTrigger>
            <TabsTrigger value="unpaid">{t('notes.tabUnpaid', { count: getTabCount('unpaid') })}</TabsTrigger>
            <TabsTrigger value="paid">{t('notes.tabPaid', { count: getTabCount('paid') })}</TabsTrigger>
            <TabsTrigger value="overdue">{t('notes.tabOverdue', { count: getTabCount('overdue') })}</TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab} className="space-y-4">
            <div className="bg-white dark:bg-gray-800 shadow-sm rounded-lg border dark:border-gray-700 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                      <th className="px-6 py-3 text-start text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                        {t('common.amount')}
                      </th>
                      <th className="px-6 py-3 text-start text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                        {t('notes.amountDue')}
                      </th>
                      <th className="px-6 py-3 text-start text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                        {t('notes.referenceType')}
                      </th>
                      <th className="px-6 py-3 text-start text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                        {t('common.status')}
                      </th>
                      <th className="px-6 py-3 text-start text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                        {t('notes.createdDate')}
                      </th>
                      <th className="px-6 py-3 text-start text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                        {t('common.notes')}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {isLoading ? (
                      Array.from({ length: 5 }).map((_, index) => (
                        <tr key={index}>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="animate-pulse">
                              <div className="h-4 bg-gray-200 dark:bg-gray-600 rounded w-28"></div>
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
                              <div className="h-4 bg-gray-200 dark:bg-gray-600 rounded w-40"></div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="animate-pulse">
                              <div className="h-4 bg-gray-200 dark:bg-gray-600 rounded w-48"></div>
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : debitNoteItems.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-6 py-16 text-center">
                          <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                            {t('notes.debitNoneFound')}
                          </h3>
                          <p className="text-gray-500 dark:text-gray-400 mb-6">
                            {t('notes.debitEmptyHint')}
                          </p>
                          <Button
                            onClick={() => setLocation("/debit-note-items/create")}
                            className="bg-purple-600 hover:bg-purple-700"
                          >
                            <Plus className="h-4 w-4 me-2" />
                            {t('notes.createDebitItem')}
                          </Button>
                        </td>
                      </tr>
                    ) : (
                      debitNoteItems.map((item) => (
                        <tr 
                          key={item.uuid}
                          className="hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
                          onClick={() => setLocation(`/debit-note-items/${item.uuid}`)}
                        >
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                {formatCurrency(item.amount, item.currency)}
                              </span>
                              {item.is_paid && (
                                <CheckCircle className="h-4 w-4 text-green-500" />
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="text-sm text-gray-900 dark:text-gray-100">
                              {formatCurrency(item.amount_due, item.currency)}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <span className="text-sm">{getReferenceIcon(item)}</span>
                              <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getReferenceColor(item)}`}>
                                {t(getReferenceType(item))}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                                item.is_paid 
                                  ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300'
                                  : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300'
                              }`}>
                                {te(item.is_paid ? 'paid' : 'unpaid')}
                              </span>
                              <Badge variant="secondary" className="text-xs">
                                {te(item.status)}
                              </Badge>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400">
                              <Calendar className="h-4 w-4" />
                              {new Date(item.created_at).toLocaleDateString()}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className="text-sm text-gray-500 dark:text-gray-400 truncate max-w-xs block">
                              {item.notes || t('notes.noNotes')}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Pagination */}
            {debitNoteItemsPage && debitNoteItemsPage.pages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    {t('notes.showingResults', { from: ((page - 1) * perPage) + 1, to: Math.min(page * perPage, totalCount), total: totalCount })}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(page - 1)}
                    disabled={page === 1}
                  >
                    {t('common.previous')}
                  </Button>
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    {t('notes.pageInfo', { page, pages: debitNoteItemsPage.pages })}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(page + 1)}
                    disabled={page === debitNoteItemsPage.pages}
                  >
                    {t('common.next')}
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}