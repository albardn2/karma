import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Plus, Eye, MoreVertical, Receipt } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ExpenseFilters } from "@/components/expenses/ExpenseFilters";
import { format } from "date-fns";

interface Expense {
  uuid: string;
  created_by_uuid?: string;
  amount: number;
  currency: string;
  category: string;
  vendor_uuid?: string;
  description?: string;
  status: string;
  is_paid: boolean;
  amount_due: number;
  amount_paid: number;
  created_at: string;
  is_deleted: boolean;
  paid_at?: string;
}

interface ExpensePage {
  expenses: Expense[];
  total_count: number;
  page: number;
  per_page: number;
  pages: number;
}

interface ExpenseFiltersType {
  uuid?: string;
  vendor_uuid?: string;
  category?: string;
  status?: string;
  is_paid?: boolean;
  page: number;
  per_page: number;
}

export default function Expenses() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { t, te } = useLanguage();
  const [filters, setFilters] = useState<ExpenseFiltersType>({
    page: 1,
    per_page: 20,
  });

  const { data: expensePage, isLoading, error } = useQuery({
    queryKey: ["/expense/", filters],
    queryFn: () => {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          params.append(key, value.toString());
        }
      });
      return apiRequest(`/expense/?${params.toString()}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (uuid: string) => apiRequest(`/expense/${uuid}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/expense/"] });
      toast({
        title: t('common.success'),
        description: t('expenses.deleteSuccess'),
      });
    },
    onError: (error: any) => {
      toast({
        title: t('common.error'),
        description: error.message || t('expenses.deleteFailed'),
        variant: "destructive",
      });
    },
  });

  const expenses = expensePage?.expenses || [];
  const totalCount = expensePage?.total_count || 0;
  const currentPage = expensePage?.page || 1;
  const totalPages = expensePage?.pages || 1;

  const handleFilterChange = (newFilters: Partial<ExpenseFiltersType>) => {
    setFilters(prev => ({ ...prev, ...newFilters, page: 1 }));
  };

  const handlePageChange = (page: number) => {
    setFilters(prev => ({ ...prev, page }));
  };

  const handleDelete = (uuid: string) => {
    if (window.confirm(t('expenses.confirmDelete'))) {
      deleteMutation.mutate(uuid);
    }
  };

  const formatCurrency = (amount: number, currency: string) => {
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

  const getCategoryBadgeColor = (category: string) => {
    const colors: { [key: string]: string } = {
      'electricity': 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-300',
      'water': 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300',
      'rent': 'bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/20 dark:text-purple-300',
      'maintenance': 'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/20 dark:text-orange-300',
      'equipment': 'bg-indigo-100 text-indigo-800 border-indigo-200 dark:bg-indigo-900/20 dark:text-indigo-300',
      'supplies': 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/20 dark:text-green-300',
      'travel': 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/20 dark:text-red-300',
      'meals': 'bg-pink-100 text-pink-800 border-pink-200 dark:bg-pink-900/20 dark:text-pink-300',
      'other': 'bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-900/20 dark:text-gray-300',
    };
    return colors[category] || colors['other'];
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
            <p className="text-red-600">{t('expenses.loadError', { message: error.message })}</p>
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
              {t('nav.expenses')}
            </h1>
          </div>
          <Button
            onClick={() => setLocation("/expenses/create")}
            className="bg-[#5469D4] hover:bg-[#4356C7] text-white"
          >
            <Plus className="h-4 w-4 me-2" />
            {t('expenses.create')}
          </Button>
        </div>

        {/* Filters */}
        <ExpenseFilters 
          filters={filters} 
          onFilterChange={handleFilterChange}
          totalCount={totalCount}
          perPage={filters.per_page}
          onPerPageChange={(perPage) => setFilters(prev => ({ ...prev, per_page: perPage, page: 1 }))}
        />

        {/* Expenses Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              {t('nav.expenses')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {expenses.length === 0 ? (
              <div className="text-center py-8">
                <Receipt className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500 dark:text-gray-400">{t('expenses.noExpenses')}</p>
                <Button
                  onClick={() => setLocation("/expenses/create")}
                  className="mt-4 bg-[#5469D4] hover:bg-[#4356C7] text-white"
                >
                  <Plus className="h-4 w-4 me-2" />
                  {t('expenses.createFirst')}
                </Button>
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('common.amount')}</TableHead>
                      <TableHead>{t('common.category')}</TableHead>
                      <TableHead>{t('common.status')}</TableHead>
                      <TableHead>{t('expenses.paymentStatus')}</TableHead>
                      <TableHead>{t('expenses.vendor')}</TableHead>
                      <TableHead>{t('expenses.created')}</TableHead>
                      <TableHead>{t('common.description')}</TableHead>
                      <TableHead className="w-[70px]">{t('common.actions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {expenses.map((expense) => (
                      <TableRow key={expense.uuid} className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800">
                        <TableCell onClick={() => setLocation(`/expenses/${expense.uuid}`)}>
                          <div className="font-medium">
                            {formatCurrency(expense.amount, expense.currency)}
                          </div>
                        </TableCell>
                        <TableCell onClick={() => setLocation(`/expenses/${expense.uuid}`)}>
                          <Badge variant="outline" className={`text-xs ${getCategoryBadgeColor(expense.category)}`}>
                            {te(expense.category)}
                          </Badge>
                        </TableCell>
                        <TableCell onClick={() => setLocation(`/expenses/${expense.uuid}`)}>
                          <Badge variant="outline" className="text-xs">
                            {te(expense.status)}
                          </Badge>
                        </TableCell>
                        <TableCell onClick={() => setLocation(`/expenses/${expense.uuid}`)}>
                          <Badge 
                            className={`text-xs ${
                              expense.is_paid
                                ? 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/20 dark:text-green-300'
                                : 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/20 dark:text-red-300'
                            }`}
                          >
                            {te(expense.is_paid ? 'paid' : 'unpaid')}
                          </Badge>
                        </TableCell>
                        <TableCell onClick={() => setLocation(`/expenses/${expense.uuid}`)}>
                          <span className="font-mono text-xs text-gray-600 dark:text-gray-400">
                            {expense.vendor_uuid ? expense.vendor_uuid.substring(0, 8) + '...' : '—'}
                          </span>
                        </TableCell>
                        <TableCell onClick={() => setLocation(`/expenses/${expense.uuid}`)}>
                          {format(new Date(expense.created_at), 'MMM d, yyyy')}
                        </TableCell>
                        <TableCell onClick={() => setLocation(`/expenses/${expense.uuid}`)}>
                          <span className="text-sm text-gray-600 dark:text-gray-400 truncate max-w-[200px] block">
                            {expense.description || "—"}
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
                              <DropdownMenuItem onClick={() => setLocation(`/expenses/${expense.uuid}`)}>
                                <Eye className="h-4 w-4 me-2" />
                                {t('common.viewDetails')}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleDelete(expense.uuid)}
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
                      {t('expenses.pagination', {
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
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}