import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { CreditCard, CheckCircle } from "lucide-react";
import { PaymentFilters } from "@/components/payments/PaymentFilters";
import { useLanguage } from "@/contexts/LanguageContext";
import { format } from "date-fns";

interface Payment {
  uuid: string;
  created_by_uuid?: string;
  invoice_uuid?: string;
  financial_account_uuid?: string;
  amount: number;
  currency: string;
  payment_method: string;
  notes?: string;
  debit_note_item_uuid?: string;
  created_at: string;
  is_deleted: boolean;
}

interface PaymentPage {
  payments: Payment[];
  total_count: number;
  page: number;
  per_page: number;
  pages: number;
}

interface PaymentFilters {
  uuid?: string;
  invoice_uuid?: string;
  financial_account_uuid?: string;
  debit_note_item_uuid?: string;
}

export default function Payments() {
  const { t, te } = useLanguage();
  const [, setLocation] = useLocation();
  const [filters, setFilters] = useState<PaymentFilters>({});
  const [currentPage, setCurrentPage] = useState(1);
  const [perPage, setPerPage] = useState(20);

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
    data: paymentData,
    isLoading,
    error,
  } = useQuery<PaymentPage>({
    queryKey: ["/payment/", { ...filters, page: currentPage, per_page: perPage }],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append("page", currentPage.toString());
      params.append("per_page", perPage.toString());
      
      Object.entries(filters as Record<string, any>).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== "") {
          params.append(key, value.toString());
        }
      });
      
      const fullUrl = `/payment/?${params.toString()}`;
      return await apiRequest(fullUrl);
    },
    enabled: true,
    refetchOnWindowFocus: false,
  });

  const handleFilterChange = (newFilters: Omit<PaymentFilters, 'page' | 'per_page'>) => {
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

  const payments = paymentData?.payments || [];
  const totalCount = paymentData?.total_count || 0;
  const totalPages = Math.ceil(totalCount / perPage);

  return (
    <AppLayout>
      <div className="p-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-medium text-gray-900 dark:text-gray-100 mb-2">{t('nav.payments')}</h1>
          <p className="text-gray-600 dark:text-gray-400">
            {t('payments.subtitle')}
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between mb-6">
          <PaymentFilters
            filters={filters}
            onFiltersChange={handleFilterChange}
            totalCount={totalCount}
            perPage={perPage}
            onPerPageChange={handlePerPageChange}
          />
          <Button 
            onClick={() => setLocation("/payments/create")}
            className="bg-[#5469D4] hover:bg-[#4356C7] text-white"
          >
            {t('payments.createPayment')}
          </Button>
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
                    {t('payments.method')}
                  </th>
                  <th className="px-6 py-3 text-start text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    {t('payments.invoiceUuid')}
                  </th>
                  <th className="px-6 py-3 text-start text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    {t('payments.financialAccount')}
                  </th>
                  <th className="px-6 py-3 text-start text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    {t('payments.created')}
                  </th>
                  <th className="px-6 py-3 text-end text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    {t('common.actions')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-16 text-center">
                      <div className="animate-pulse space-y-4">
                        <div className="h-4 bg-gray-200 dark:bg-gray-600 rounded w-32 mx-auto"></div>
                        <div className="h-4 bg-gray-200 dark:bg-gray-600 rounded w-48 mx-auto"></div>
                        <div className="h-4 bg-gray-200 dark:bg-gray-600 rounded w-24 mx-auto"></div>
                      </div>
                      <p className="mt-4 text-gray-500 dark:text-gray-400">{t('payments.loading')}</p>
                    </td>
                  </tr>
                ) : payments.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-16 text-center">
                      <CreditCard className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                      <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                        {error ? t('payments.authRequired') : t('payments.noPayments')}
                      </h3>
                      <p className="text-gray-500 dark:text-gray-400 mb-6">
                        {error?.message?.includes('JWT') || error?.message?.includes('Authorization')
                          ? t('payments.pleaseLogIn')
                          : error ? t('payments.errorMessage', { message: error.message }) : t('payments.emptyHint')}
                      </p>
                      {!error && (
                        <Button 
                          onClick={() => setLocation("/payments/create")}
                          className="bg-[#5469D4] hover:bg-[#4356C7] text-white"
                        >
                          {t('payments.createPayment')}
                        </Button>
                      )}
                    </td>
                  </tr>
                ) : (
                  payments.map((payment) => (
                    <tr 
                      key={payment.uuid}
                      className="hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
                      onClick={() => setLocation(`/payments/${payment.uuid}`)}
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            {formatCurrency(payment.amount, payment.currency)}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300">
                          {te(payment.payment_method)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-gray-900 dark:text-gray-100">
                          {payment.invoice_uuid ? payment.invoice_uuid.substring(0, 8) + '...' : t('payments.na')}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-gray-900 dark:text-gray-100">
                          {payment.financial_account_uuid ? payment.financial_account_uuid.substring(0, 8) + '...' : t('payments.na')}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                          {format(new Date(payment.created_at), 'MMM d, yyyy')}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setLocation(`/payments/${payment.uuid}`);
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
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-3 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
            <div className="flex-1 flex justify-between sm:hidden">
              <Button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage <= 1}
                variant="outline"
              >
                {t('common.previous')}
              </Button>
              <Button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage >= totalPages}
                variant="outline"
              >
                {t('common.next')}
              </Button>
            </div>
            <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  {t('common.showing', {
                    from: ((currentPage - 1) * perPage) + 1,
                    to: Math.min(currentPage * perPage, totalCount),
                    total: totalCount,
                  })}{' '}
                  {t('common.results')}
                </p>
              </div>
              <div>
                <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px rtl:space-x-reverse">
                  <Button
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage <= 1}
                    variant="outline"
                    className="rounded-e-none"
                  >
                    {t('common.previous')}
                  </Button>
                  <Button
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage >= totalPages}
                    variant="outline"
                    className="rounded-s-none"
                  >
                    {t('common.next')}
                  </Button>
                </nav>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}