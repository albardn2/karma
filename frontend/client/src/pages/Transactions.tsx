import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Plus, Eye, MoreVertical, ArrowRightLeft } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { TransactionFilters } from "@/components/transactions/TransactionFilters";
import { format } from "date-fns";
import { useLanguage } from "@/contexts/LanguageContext";

interface Transaction {
  uuid: string;
  created_by_uuid?: string;
  from_amount?: number;
  from_currency?: string;
  from_account_uuid?: string;
  to_account_uuid?: string;
  to_currency?: string;
  to_amount?: number;
  usd_to_syp_exchange_rate?: number;
  notes?: string;
  created_at: string;
  is_deleted: boolean;
}

interface TransactionPage {
  transactions: Transaction[];
  total_count: number;
  page: number;
  per_page: number;
  pages: number;
}

interface TransactionFiltersType {
  uuid?: string;
  from_account_uuid?: string;
  to_account_uuid?: string;
  start_date?: string;
  end_date?: string;
  page: number;
  per_page: number;
}

export default function Transactions() {
  const { t } = useLanguage();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [filters, setFilters] = useState<TransactionFiltersType>({
    page: 1,
    per_page: 20,
  });

  const { data: transactionPage, isLoading, error } = useQuery({
    queryKey: ["/transaction/", filters],
    queryFn: () => {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          params.append(key, value.toString());
        }
      });
      return apiRequest(`/transaction/?${params.toString()}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (uuid: string) => apiRequest(`/transaction/${uuid}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/transaction/"] });
      toast({
        title: t('common.success'),
        description: t('financial.transactionDeleted'),
      });
    },
    onError: (error: any) => {
      toast({
        title: t('common.error'),
        description: error.message || t('financial.failedDeleteTransaction'),
        variant: "destructive",
      });
    },
  });

  const transactions = transactionPage?.transactions || [];
  const totalCount = transactionPage?.total_count || 0;
  const currentPage = transactionPage?.page || 1;
  const totalPages = transactionPage?.pages || 1;

  const handleFilterChange = (newFilters: Partial<TransactionFiltersType>) => {
    setFilters(prev => ({ ...prev, ...newFilters, page: 1 }));
  };

  const handlePageChange = (page: number) => {
    setFilters(prev => ({ ...prev, page }));
  };

  const handleDelete = (uuid: string) => {
    if (window.confirm(t('financial.confirmDeleteTransaction'))) {
      deleteMutation.mutate(uuid);
    }
  };

  const formatCurrency = (amount?: number, currency?: string) => {
    if (!amount || !currency) return "—";
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

  if (isLoading) {
    return (
      <AppLayout>
        <div className="p-8">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-gray-200 rounded w-1/4"></div>
            <div className="h-32 bg-gray-200 rounded"></div>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (error) {
    return (
      <AppLayout>
        <div className="p-8">
          <div className="text-center py-8">
            <p className="text-red-600">{t('financial.errorLoadingTransactions', { message: error.message })}</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-8 space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-medium text-gray-900 dark:text-gray-100">
              {t('nav.transactions')}
            </h1>
          </div>
          <Button
            onClick={() => setLocation("/transactions/create")}
            className="bg-[#5469D4] hover:bg-[#4356C7] text-white"
          >
            <Plus className="h-4 w-4 me-2" />
            {t('financial.createTransaction')}
          </Button>
        </div>

        {/* Filters */}
        <TransactionFilters 
          filters={filters} 
          onFilterChange={handleFilterChange}
          totalCount={totalCount}
          perPage={filters.per_page}
          onPerPageChange={(perPage) => setFilters(prev => ({ ...prev, per_page: perPage, page: 1 }))}
        />

        {/* Transactions Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <ArrowRightLeft className="h-5 w-5" />
              {t('nav.transactions')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {transactions.length === 0 ? (
              <div className="text-center py-8">
                <ArrowRightLeft className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500 dark:text-gray-400">{t('financial.noTransactionsFound')}</p>
                <Button
                  onClick={() => setLocation("/transactions/create")}
                  className="mt-4 bg-[#5469D4] hover:bg-[#4356C7] text-white"
                >
                  <Plus className="h-4 w-4 me-2" />
                  {t('financial.createFirstTransaction')}
                </Button>
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('financial.from')}</TableHead>
                      <TableHead>{t('financial.to')}</TableHead>
                      <TableHead>{t('financial.exchangeRate')}</TableHead>
                      <TableHead>{t('financial.fromAccount')}</TableHead>
                      <TableHead>{t('financial.toAccount')}</TableHead>
                      <TableHead>{t('financial.created')}</TableHead>
                      <TableHead>{t('common.notes')}</TableHead>
                      <TableHead className="w-[70px]">{t('common.actions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactions.map((transaction) => (
                      <TableRow key={transaction.uuid} className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800">
                        <TableCell onClick={() => setLocation(`/transactions/${transaction.uuid}`)}>
                          <div className="font-medium">
                            {formatCurrency(transaction.from_amount, transaction.from_currency)}
                          </div>
                        </TableCell>
                        <TableCell onClick={() => setLocation(`/transactions/${transaction.uuid}`)}>
                          <div className="font-medium">
                            {formatCurrency(transaction.to_amount, transaction.to_currency)}
                          </div>
                        </TableCell>
                        <TableCell onClick={() => setLocation(`/transactions/${transaction.uuid}`)}>
                          {transaction.usd_to_syp_exchange_rate ? (
                            <Badge variant="outline" className="text-xs">
                              {transaction.usd_to_syp_exchange_rate.toFixed(2)}
                            </Badge>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell onClick={() => setLocation(`/transactions/${transaction.uuid}`)}>
                          <span className="font-mono text-xs text-gray-600 dark:text-gray-400">
                            {transaction.from_account_uuid ? transaction.from_account_uuid.substring(0, 8) + '...' : '—'}
                          </span>
                        </TableCell>
                        <TableCell onClick={() => setLocation(`/transactions/${transaction.uuid}`)}>
                          <span className="font-mono text-xs text-gray-600 dark:text-gray-400">
                            {transaction.to_account_uuid ? transaction.to_account_uuid.substring(0, 8) + '...' : '—'}
                          </span>
                        </TableCell>
                        <TableCell onClick={() => setLocation(`/transactions/${transaction.uuid}`)}>
                          {format(new Date(transaction.created_at), 'MMM d, yyyy')}
                        </TableCell>
                        <TableCell onClick={() => setLocation(`/transactions/${transaction.uuid}`)}>
                          <span className="text-sm text-gray-600 dark:text-gray-400 truncate max-w-[200px] block">
                            {transaction.notes || "—"}
                          </span>
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => setLocation(`/transactions/${transaction.uuid}`)}>
                                <Eye className="h-4 w-4 me-2" />
                                {t('common.viewDetails')}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleDelete(transaction.uuid)}
                                className="text-red-600"
                              >
                                {t('common.delete')}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4">
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {t('financial.showingTransactions', {
                        from: (currentPage - 1) * filters.per_page + 1,
                        to: Math.min(currentPage * filters.per_page, totalCount),
                        total: totalCount,
                      })}
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePageChange(currentPage - 1)}
                        disabled={currentPage === 1}
                      >
                        {t('common.previous')}
                      </Button>
                      <span className="text-sm px-3 py-1 bg-gray-100 dark:bg-gray-800 rounded">
                        {t('financial.pageOf', { page: currentPage, pages: totalPages })}
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
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}