import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Plus, Filter, Wallet, DollarSign, Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Link } from "wouter";
import type { FinancialAccount, FinancialAccountPage, FinancialAccountListParams } from "@/lib/types";
import { formatDate, formatCurrency } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { AddFinancialAccountDialog } from "@/components/financial-accounts/AddFinancialAccountDialog";
import { useLanguage } from "@/contexts/LanguageContext";

export default function FinancialAccounts() {
  const { t } = useLanguage();
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [localFilters, setLocalFilters] = useState<FinancialAccountListParams>({
    page: 1,
    per_page: 20,
  });
  const [appliedFilters, setAppliedFilters] = useState<FinancialAccountListParams>({
    page: 1,
    per_page: 20,
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const queryKey = appliedFilters.page && appliedFilters.per_page 
    ? `/financial-account/?page=${appliedFilters.page}&per_page=${appliedFilters.per_page}`
    : "/financial-account/";

  const {
    data: accountsData,
    isLoading,
    error,
  } = useQuery<FinancialAccountPage>({
    queryKey: [queryKey],
    enabled: true,
  });

  const handleApplyFilters = () => {
    const updatedFilters = { ...localFilters, page: 1 };
    setAppliedFilters(updatedFilters);
    setCurrentPage(1);
    setIsFiltersOpen(false);
  };

  const handleClearFilters = () => {
    const defaultFilters = { page: 1, per_page: 20 };
    setLocalFilters(defaultFilters);
    setAppliedFilters(defaultFilters);
    setCurrentPage(1);
    setIsFiltersOpen(false);
  };

  const handlePreviousPage = () => {
    if (currentPage > 1) {
      const newPage = currentPage - 1;
      setCurrentPage(newPage);
      setAppliedFilters(prev => ({ ...prev, page: newPage }));
    }
  };

  const handleNextPage = () => {
    if (accountsData && currentPage < accountsData.pages) {
      const newPage = currentPage + 1;
      setCurrentPage(newPage);
      setAppliedFilters(prev => ({ ...prev, page: newPage }));
    }
  };

  const formatAccountCurrency = (currency: string) => {
    return currency.toUpperCase();
  };

  const getBalanceColor = (balance: number) => {
    if (balance > 0) return "text-green-600";
    if (balance < 0) return "text-red-600";
    return "text-gray-600";
  };

  if (error) {
    return (
      <AppLayout>
        <div className="flex-1 overflow-auto p-4 lg:p-6">
          <div className="text-center py-12">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">{t('financial.accountsLoadError')}</h3>
            <p className="text-gray-600">{t('financial.tryAgainLater')}</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="flex-1 overflow-auto p-4 lg:p-6">
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{t('nav.financialAccounts')}</h1>
              <p className="text-gray-600">
                {accountsData ? t('financial.accountsCount', { count: accountsData.total_count }) : t('common.loading')}
              </p>
            </div>
            <div className="flex gap-2">
              <Sheet open={isFiltersOpen} onOpenChange={setIsFiltersOpen}>
                <SheetTrigger asChild>
                  <Button variant="outline">
                    <Filter className="h-4 w-4 me-2" />
                    {t('common.filters')}
                  </Button>
                </SheetTrigger>
                <SheetContent>
                  <SheetHeader>
                    <SheetTitle>{t('financial.filterAccounts')}</SheetTitle>
                    <SheetDescription>
                      {t('financial.filterAccountsDesc')}
                    </SheetDescription>
                  </SheetHeader>
                  <div className="py-6">
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">{t('financial.uuid')}</label>
                        <input
                          type="text"
                          placeholder={t('financial.searchByUuid')}
                          value={localFilters.uuid || ""}
                          onChange={(e) => setLocalFilters(prev => ({ 
                            ...prev, 
                            uuid: e.target.value 
                          }))}
                          className="w-full p-2 border border-gray-300 rounded-md"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">{t('financial.accountName')}</label>
                        <input
                          type="text"
                          placeholder={t('financial.searchByAccountName')}
                          value={localFilters.account_name || ""}
                          onChange={(e) => setLocalFilters(prev => ({ 
                            ...prev, 
                            account_name: e.target.value 
                          }))}
                          className="w-full p-2 border border-gray-300 rounded-md"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">{t('financial.itemsPerPage')}</label>
                        <select
                          value={localFilters.per_page}
                          onChange={(e) => setLocalFilters(prev => ({
                            ...prev,
                            per_page: parseInt(e.target.value)
                          }))}
                          className="w-full p-2 border border-gray-300 rounded-md"
                        >
                          <option value={10}>{t('financial.nPerPage', { count: 10 })}</option>
                          <option value={20}>{t('financial.nPerPage', { count: 20 })}</option>
                          <option value={50}>{t('financial.nPerPage', { count: 50 })}</option>
                          <option value={100}>{t('financial.nPerPage', { count: 100 })}</option>
                        </select>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={handleApplyFilters} className="flex-1">
                      {t('financial.applyFilters')}
                    </Button>
                    <Button onClick={handleClearFilters} variant="outline" className="flex-1">
                      {t('financial.clear')}
                    </Button>
                  </div>
                </SheetContent>
              </Sheet>
              <AddFinancialAccountDialog />
            </div>
          </div>

          {/* Accounts List */}
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {[...Array(6)].map((_, i) => (
                <Card key={i} className="animate-pulse">
                  <CardContent className="p-6">
                    <div className="space-y-3">
                      <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                      <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                      <div className="h-3 bg-gray-200 rounded w-1/4"></div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : accountsData?.accounts.length === 0 ? (
            <div className="text-center py-12">
              <Wallet className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">{t('financial.noAccountsFound')}</h3>
              <p className="text-gray-600 mb-4">{t('financial.getStartedCreateAccount')}</p>
              <AddFinancialAccountDialog />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {accountsData?.accounts.map((account: FinancialAccount) => (
                  <Card key={account.uuid} className="hover:shadow-md transition-shadow cursor-pointer">
                    <Link href={`/financial-accounts/${account.uuid}`}>
                      <CardContent className="p-6">
                        <div className="mb-4">
                          <h3 className="font-semibold text-gray-900 mb-1">{account.account_name}</h3>
                          <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
                            <DollarSign className="h-3 w-3" />
                            <span>{formatAccountCurrency(account.currency)}</span>
                          </div>
                          <div className={`text-lg font-bold ${getBalanceColor(account.balance)}`}>
                            {formatCurrency(account.balance, account.currency)}
                          </div>
                        </div>

                        {account.notes && (
                          <p className="text-sm text-gray-600 mb-3 line-clamp-2">{account.notes}</p>
                        )}

                        <div className="flex items-center justify-between text-xs text-gray-500">
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            <span>{formatDate(account.created_at)}</span>
                          </div>
                          <Badge variant={account.is_deleted ? "destructive" : "default"}>
                            {account.is_deleted ? t('financial.statusDeleted') : t('financial.statusActive')}
                          </Badge>
                        </div>
                      </CardContent>
                    </Link>
                  </Card>
                ))}
              </div>

              {/* Pagination */}
              {accountsData && accountsData.pages > 1 && (
                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-700">
                    {t('financial.showingPage', {
                      page: currentPage,
                      pages: accountsData.pages,
                      total: accountsData.total_count,
                    })}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handlePreviousPage}
                      disabled={currentPage <= 1}
                    >
                      <ChevronLeft className="h-4 w-4 me-1" />
                      {t('common.previous')}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleNextPage}
                      disabled={currentPage >= accountsData.pages}
                    >
                      {t('common.next')}
                      <ChevronRight className="h-4 w-4 ms-1" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </AppLayout>
  );
}