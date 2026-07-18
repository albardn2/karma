import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DollarSign } from "lucide-react";
import { AddPricingDialog } from "@/components/pricing/AddPricingDialog";
import { PricingFilters } from "@/components/pricing/PricingFilters";
import { useLanguage } from "@/contexts/LanguageContext";

interface Pricing {
  uuid: string;
  material_uuid: string;
  material_name?: string;
  material_sku?: string;
  price_per_unit: number;
  currency: string;
  effective_date?: string;
  expiry_date?: string;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
}

interface PricingPage {
  pricings: Pricing[];
  total_count: number;
  page: number;
  per_page: number;
  pages: number;
}

interface PricingFilters {
  uuid?: string;
  material_uuid?: string;
  currency?: string;
  page: number;
  per_page: number;
}

export default function Pricing() {
  const { t } = useLanguage();
  const [currentPage, setCurrentPage] = useState(1);
  const [perPage, setPerPage] = useState(20);
  const [filters, setFilters] = useState<Omit<PricingFilters, 'page' | 'per_page'>>({});

  // Fetch pricing data
  const { data: pricingData, isLoading } = useQuery<PricingPage>({
    queryKey: ["/pricing/", currentPage, perPage, filters],
    queryFn: async ({ queryKey }) => {
      const [, page, per_page, currentFilters] = queryKey;
      const params = new URLSearchParams({
        page: String(page),
        per_page: String(per_page),
        ...(currentFilters as Record<string, string>)
      });
      
      // Remove empty values
      Object.keys(currentFilters as Record<string, string>).forEach(key => {
        if (!(currentFilters as Record<string, string>)[key]) {
          params.delete(key);
        }
      });

      return await apiRequest(`/pricing/?${params.toString()}`);
    },
  });

  const handleFilterChange = (newFilters: typeof filters) => {
    setFilters(newFilters);
    setCurrentPage(1); // Reset to first page when filtering
  };

  const handlePerPageChange = (newPerPage: number) => {
    setPerPage(newPerPage);
    setCurrentPage(1); // Reset to first page when changing per page
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    // Scroll to top when page changes
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const totalCount = pricingData?.total_count || 0;
  const totalPages = Math.ceil(totalCount / perPage);

  if (isLoading) {
    return (
      <AppLayout>
        <div className="container mx-auto px-4 py-6">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-gray-200 rounded w-1/4"></div>
            <div className="grid gap-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-32 bg-gray-200 rounded"></div>
              ))}
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">{t('nav.pricing')}</h1>
            <p className="text-sm text-muted-foreground">
              {t(totalCount === 1 ? 'pricing.entryOnPage' : 'pricing.entriesOnPage', { count: totalCount })}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <PricingFilters
              filters={filters}
              onFiltersChange={handleFilterChange}
              totalCount={totalCount}
              perPage={perPage}
              onPerPageChange={handlePerPageChange}
            />
            <AddPricingDialog />
          </div>
        </div>

        <div className="space-y-6">
          {/* Pricing List */}
          {pricingData?.pricings && pricingData.pricings.length > 0 ? (
            <div className="grid gap-4">
              {pricingData.pricings.map((pricing) => (
                <Link key={pricing.uuid} href={`/pricing/${pricing.uuid}`}>
                  <Card className="cursor-pointer hover:shadow-md transition-shadow">
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-4 mb-2">
                            <h3 className="font-semibold text-lg">
                              ${pricing.price_per_unit.toLocaleString()}
                            </h3>
                            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                              {pricing.currency}
                            </Badge>
                            {pricing.material_name && (
                              <Badge variant="secondary">
                                {pricing.material_name}
                              </Badge>
                            )}
                          </div>
                          
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <span>{t('pricing.materialWithId', { id: pricing.material_uuid })}</span>
                            <span>•</span>
                            <span>{t('pricing.createdOn', { date: new Date(pricing.created_at).toLocaleDateString() })}</span>
                            {pricing.effective_date && (
                              <>
                                <span>•</span>
                                <span>{t('pricing.effectiveOn', { date: new Date(pricing.effective_date).toLocaleDateString() })}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 px-4">
              <div className="w-24 h-24 mb-8 bg-gradient-to-br from-blue-100 to-purple-100 rounded-2xl flex items-center justify-center">
                <DollarSign className="h-12 w-12 text-[#5469D4]" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-3">
                {Object.values(filters).some(v => v) ? t('pricing.noPricingFound') : t('pricing.noPricingYet')}
              </h3>
              <p className="text-gray-500 mb-8 max-w-md text-center leading-relaxed">
                {Object.values(filters).some(v => v)
                  ? t('pricing.emptyFilteredDesc')
                  : t('pricing.emptyDesc')}
              </p>
              <AddPricingDialog />
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <p className="text-sm text-muted-foreground">
                {t('pricing.showingEntries', { from: ((currentPage - 1) * perPage) + 1, to: Math.min(currentPage * perPage, totalCount), total: totalCount })}
              </p>
              <div className="flex items-center space-x-2 rtl:space-x-reverse">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(1)}
                  disabled={currentPage <= 1}
                >
                  {t('pricing.first')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage <= 1}
                >
                  {t('common.previous')}
                </Button>
                <div className="flex items-center gap-2">
                  <span className="text-sm">{t('common.page')}</span>
                  <span className="text-sm font-medium">{currentPage}</span>
                  <span className="text-sm">{t('common.of')}</span>
                  <span className="text-sm font-medium">{totalPages}</span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage >= totalPages}
                >
                  {t('common.next')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(totalPages)}
                  disabled={currentPage >= totalPages}
                >
                  {t('pricing.last')}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}