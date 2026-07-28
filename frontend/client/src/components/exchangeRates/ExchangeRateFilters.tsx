import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Filter } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

// Only USD and SYP exist in the backend Currency enum for this pair, so the
// selects are hardcoded rather than fetched — /payment/currencies lists
// currencies the exchange-rate table has no rows for.
const CURRENCIES = ["USD", "SYP"] as const;
const SOURCES = ["sp-today", "manual"] as const;

export interface ExchangeRateFiltersType {
  from_currency?: string;
  to_currency?: string;
  source?: string;
  // the API names the date bounds `start` / `end` (plain ISO dates, not datetimes)
  start?: string;
  end?: string;
  page: number;
  per_page: number;
}

interface ExchangeRateFiltersProps {
  filters: ExchangeRateFiltersType;
  onFilterChange: (filters: Partial<ExchangeRateFiltersType>) => void;
  totalCount: number;
  perPage: number;
  onPerPageChange: (perPage: number) => void;
}

export function ExchangeRateFilters({
  filters,
  onFilterChange,
  totalCount,
  perPage,
  onPerPageChange,
}: ExchangeRateFiltersProps) {
  const { t, te } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const [localFilters, setLocalFilters] = useState<Partial<ExchangeRateFiltersType>>(filters);

  const activeFilterCount = [
    filters.from_currency,
    filters.to_currency,
    filters.source,
    filters.start,
    filters.end,
  ].filter(Boolean).length;

  const hasActiveFilters = activeFilterCount > 0;

  const handleApplyFilters = () => {
    // localFilters was snapshotted when the drawer mounted and is never re-synced,
    // so shipping it whole would revert a page-size change made outside the
    // drawer. Send only what this drawer owns — page/per_page stay the caller's.
    const { page: _page, per_page: _perPage, ...ownedByThisDrawer } = localFilters;
    onFilterChange(ownedByThisDrawer);
    setIsOpen(false);
  };

  const handleClearFilters = () => {
    const clearedFilters = {
      from_currency: undefined,
      to_currency: undefined,
      source: undefined,
      start: undefined,
      end: undefined,
    };
    setLocalFilters(clearedFilters);
    onFilterChange(clearedFilters);
    setIsOpen(false);
  };

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-4">
        {/* Results Count */}
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {t('exchangeRates.countRates', { count: totalCount })}
        </p>

        <Sheet open={isOpen} onOpenChange={setIsOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" className="relative" data-testid="exchange-rates-filters-trigger">
              <Filter className="h-4 w-4 me-2" />
              {t('common.filters')}
              {hasActiveFilters && (
                <span className="absolute -top-2 -end-2 bg-[#5469D4] text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
            </Button>
          </SheetTrigger>
          <SheetContent className="w-[400px] sm:w-[540px]" style={{ zIndex: 9999 }}>
            <SheetHeader>
              <SheetTitle>{t('exchangeRates.filterTitle')}</SheetTitle>
            </SheetHeader>

            <div className="space-y-6 mt-6">
              <div className="space-y-2">
                <Label htmlFor="from_currency">{t('exchangeRates.fromCurrency')}</Label>
                {/* a plain select, like the per-page control below: the Radix
                    Select has no empty-value option, and "All" has to be
                    expressible so the filter can be turned off again */}
                <select
                  id="from_currency"
                  value={localFilters.from_currency || ""}
                  onChange={(e) =>
                    setLocalFilters(prev => ({ ...prev, from_currency: e.target.value || undefined }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-sm"
                  data-testid="exchange-rates-filter-from-currency"
                >
                  <option value="">{t('exchangeRates.allCurrencies')}</option>
                  {CURRENCIES.map((currency) => (
                    <option key={currency} value={currency}>
                      {currency}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="to_currency">{t('exchangeRates.toCurrency')}</Label>
                <select
                  id="to_currency"
                  value={localFilters.to_currency || ""}
                  onChange={(e) =>
                    setLocalFilters(prev => ({ ...prev, to_currency: e.target.value || undefined }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-sm"
                  data-testid="exchange-rates-filter-to-currency"
                >
                  <option value="">{t('exchangeRates.allCurrencies')}</option>
                  {CURRENCIES.map((currency) => (
                    <option key={currency} value={currency}>
                      {currency}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="source">{t('exchangeRates.source')}</Label>
                <select
                  id="source"
                  value={localFilters.source || ""}
                  onChange={(e) =>
                    setLocalFilters(prev => ({ ...prev, source: e.target.value || undefined }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-sm"
                  data-testid="exchange-rates-filter-source"
                >
                  <option value="">{t('exchangeRates.allSources')}</option>
                  {SOURCES.map((source) => (
                    <option key={source} value={source}>
                      {te(source)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="start">{t('exchangeRates.startDate')}</Label>
                  <Input
                    id="start"
                    type="date"
                    value={localFilters.start || ""}
                    onChange={(e) =>
                      setLocalFilters(prev => ({ ...prev, start: e.target.value || undefined }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="end">{t('exchangeRates.endDate')}</Label>
                  <Input
                    id="end"
                    type="date"
                    value={localFilters.end || ""}
                    onChange={(e) =>
                      setLocalFilters(prev => ({ ...prev, end: e.target.value || undefined }))
                    }
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <Button
                  onClick={handleApplyFilters}
                  className="flex-1 bg-[#5469D4] hover:bg-[#4356C7]"
                  data-testid="exchange-rates-filters-apply"
                >
                  {t('exchangeRates.applyFilters')}
                </Button>
                {hasActiveFilters && (
                  <Button onClick={handleClearFilters} variant="outline" className="flex-1">
                    {t('exchangeRates.clearAll')}
                  </Button>
                )}
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* Per Page Selection */}
      <div className="flex items-center gap-2">
        <Label htmlFor="perPage" className="text-sm">{t('exchangeRates.show')}</Label>
        <select
          id="perPage"
          value={perPage}
          onChange={(e) => onPerPageChange(parseInt(e.target.value))}
          className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-sm"
        >
          <option value={10}>10</option>
          <option value={20}>20</option>
          <option value={50}>50</option>
          <option value={100}>100</option>
        </select>
        <span className="text-sm text-gray-600 dark:text-gray-400">{t('exchangeRates.perPageSuffix')}</span>
      </div>
    </div>
  );
}
