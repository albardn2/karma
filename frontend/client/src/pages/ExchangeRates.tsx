import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { DownloadCloud, History, RefreshCw } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  ExchangeRateFilters,
  type ExchangeRateFiltersType,
} from "@/components/exchangeRates/ExchangeRateFilters";
import { format, parseISO } from "date-fns";

interface ExchangeRate {
  uuid: string;
  from_currency: string;
  to_currency: string;
  // SYP per 1 USD, in NEW Syrian pounds (~133.9) — same unit as every other
  // SYP amount in the app. rate is the midpoint of buy_rate and sell_rate.
  rate: number;
  buy_rate?: number | null;
  sell_rate?: number | null;
  rate_date: string;
  source: string;
  notes?: string | null;
  created_at: string;
  created_by_uuid?: string | null;
  is_deleted: boolean;
}

interface ExchangeRatePage {
  // NOTE: the API names this `exchange_rates`, not `items`
  exchange_rates: ExchangeRate[];
  total_count: number;
  page: number;
  per_page: number;
  pages: number;
}

interface PullResult {
  created: number;
  updated: number;
  from_currency: string;
  to_currency: string;
  source: string;
  range?: string | null;
  first_date?: string | null;
  last_date?: string | null;
  exchange_rates: ExchangeRate[];
}

// How far back a backfill reaches. These are the ranges sp-today's own chart
// offers; the backend validates against the same set, because the source answers
// 200 with about a month for anything it does not recognise.
const BACKFILL_RANGES = ['today', '1w', '1m', '3m', '6m', '1y'] as const;
type BackfillRange = (typeof BACKFILL_RANGES)[number];

// apiRequest throws Error("<status>: <raw body>"), and the backend error body is
// {"error": "..."}. Dig the readable sentence out so a failed scrape reads as
// "sp-today.com is unreachable" instead of '502: {"error": "..."}'.
const apiErrorMessage = (error: unknown, fallback: string): string => {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const body = raw.slice(raw.indexOf(":") + 1).trim();
  try {
    const parsed = JSON.parse(body);
    if (parsed && typeof parsed.error === "string") return parsed.error;
    // the permission layer answers {"msg": ...}, not {"error": ...}
    if (parsed && typeof parsed.msg === "string") return parsed.msg;
  } catch {
    // not JSON — fall through
  }
  // prefer the caller's sentence over a raw '500: {...}' dump
  return fallback || raw;
};

// Latin digits with thousands separators everywhere, in both languages: the
// rate sits alongside other SYP amounts that are all rendered this way.
//
// Up to 4 decimals, unlike an amount: a rate is a multiplier, and in new pounds
// the midpoint of a buy/sell pair often lands on a half — 133.875. Trimming
// that to 133.88 would have someone reconciling 100 USD by hand arrive at
// 13,388 instead of the 13,387.50 the app actually computed.
const RATE_FORMAT = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

const formatRate = (value?: number | null) =>
  value === undefined || value === null ? "—" : RATE_FORMAT.format(value);

// rate_date is a plain date ("2026-07-27"). new Date() would read it as UTC
// midnight and render the previous day for anyone west of UTC; parseISO keeps
// it local.
const formatRateDate = (isoDate: string) => format(parseISO(isoDate), "MMM d, yyyy");

export default function ExchangeRates() {
  const { toast } = useToast();
  const { t, te } = useLanguage();
  const [filters, setFilters] = useState<ExchangeRateFiltersType>({
    page: 1,
    per_page: 50,
  });
  // a year by default: it is the deepest the source goes, and re-ingesting a day
  // already stored is an update, not a duplicate
  const [backfillRange, setBackfillRange] = useState<BackfillRange>('1y');

  const { data: ratePage, isLoading, error } = useQuery<ExchangeRatePage>({
    queryKey: ["/exchange-rate/", filters],
    queryFn: () => {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          params.append(key, value.toString());
        }
      });
      return apiRequest(`/exchange-rate/?${params.toString()}`);
    },
  });

  const pullMutation = useMutation({
    mutationFn: (): Promise<PullResult> =>
      apiRequest("/exchange-rate/pull", { method: "POST", body: {} }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/exchange-rate/"] });
      // sibling key, not a prefix match: react-query compares key elements with
      // ===, so the transaction form's default would otherwise stay stale for
      // its full staleTime and price a transfer at the pre-pull rate
      queryClient.invalidateQueries({ queryKey: ["/exchange-rate/latest"] });
      const row = result.exchange_rates?.[0];
      if (!row) {
        toast({ title: t('common.error'), description: t('exchangeRates.pullNoData'), variant: "destructive" });
        return;
      }
      toast({
        title: t('common.success'),
        description: t('exchangeRates.pullSuccess', {
          rate: formatRate(row.rate),
          from: row.from_currency,
          to: row.to_currency,
          date: row.rate_date,
          created: result.created,
          updated: result.updated,
        }),
      });
    },
    onError: (err: unknown) => {
      toast({
        title: t('common.error'),
        description: apiErrorMessage(err, t('exchangeRates.pullFailed')),
        variant: "destructive",
      });
    },
  });

  const backfillMutation = useMutation({
    mutationFn: (range: BackfillRange): Promise<PullResult> =>
      apiRequest("/exchange-rate/backfill", { method: "POST", body: { range } }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/exchange-rate/"] });
      // sibling key, not a prefix match: react-query compares key elements with
      // ===, so the transaction form's default would otherwise stay stale for
      // its full staleTime and price a transfer at the pre-pull rate
      queryClient.invalidateQueries({ queryKey: ["/exchange-rate/latest"] });
      if (!result.first_date || !result.last_date) {
        toast({ title: t('common.error'), description: t('exchangeRates.backfillNoData'), variant: "destructive" });
        return;
      }
      toast({
        title: t('common.success'),
        description: t('exchangeRates.backfillSuccess', {
          created: result.created,
          updated: result.updated,
          first: result.first_date,
          last: result.last_date,
        }),
      });
    },
    onError: (err: unknown) => {
      toast({
        title: t('common.error'),
        description: apiErrorMessage(err, t('exchangeRates.backfillFailed')),
        variant: "destructive",
      });
    },
  });

  const rates = ratePage?.exchange_rates || [];
  const totalCount = ratePage?.total_count || 0;
  const currentPage = ratePage?.page || 1;
  const totalPages = ratePage?.pages || 1;

  const handleFilterChange = (newFilters: Partial<ExchangeRateFiltersType>) => {
    setFilters(prev => ({ ...prev, ...newFilters, page: 1 }));
  };

  const handlePageChange = (page: number) => {
    setFilters(prev => ({ ...prev, page }));
  };

  // The action buttons stay reachable while the table loads or errors, so a
  // first-ever empty table can still be filled from the page it fails on.
  const headerActions = (
    <div className="flex items-center gap-3">
      {/* Plain select, like the per-page control: Radix Select cannot hold an
          empty value and this needs no placeholder state. */}
      <select
        value={backfillRange}
        onChange={(e) => setBackfillRange(e.target.value as BackfillRange)}
        className="h-9 rounded-md border border-gray-200 bg-white px-2 text-sm dark:border-gray-700 dark:bg-gray-900"
        aria-label={t('exchangeRates.backfillRangeLabel')}
        data-testid="exchange-rates-backfill-range"
      >
        {BACKFILL_RANGES.map((range) => (
          <option key={range} value={range}>
            {t(`exchangeRates.range_${range}`)}
          </option>
        ))}
      </select>
      <Button
        onClick={() => backfillMutation.mutate(backfillRange)}
        disabled={backfillMutation.isPending}
        variant="outline"
        data-testid="exchange-rates-backfill"
      >
        <DownloadCloud className="h-4 w-4 me-2" />
        {backfillMutation.isPending ? t('exchangeRates.backfilling') : t('exchangeRates.backfill')}
      </Button>
      <Button
        onClick={() => pullMutation.mutate()}
        disabled={pullMutation.isPending}
        className="bg-[#5469D4] hover:bg-[#4356C7] text-white"
        data-testid="exchange-rates-pull"
      >
        <RefreshCw className={`h-4 w-4 me-2 ${pullMutation.isPending ? 'animate-spin' : ''}`} />
        {pullMutation.isPending ? t('exchangeRates.pulling') : t('exchangeRates.pullToday')}
      </Button>
    </div>
  );

  const header = (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-3xl font-medium text-gray-900 dark:text-gray-100">
          {t('nav.exchangeRates')}
        </h1>
      </div>
      {headerActions}
    </div>
  );

  if (isLoading) {
    return (
      <AppLayout>
        <div className="p-8 space-y-8">
          {header}
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
        <div className="p-8 space-y-8">
          {header}
          <div className="text-center py-8">
            <p className="text-red-600">
              {t('exchangeRates.loadError', { message: apiErrorMessage(error, '') })}
            </p>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-8 space-y-8">
        {header}

        {/* Filters */}
        <ExchangeRateFilters
          filters={filters}
          onFilterChange={handleFilterChange}
          totalCount={totalCount}
          perPage={filters.per_page}
          onPerPageChange={(perPage) => setFilters(prev => ({ ...prev, per_page: perPage, page: 1 }))}
        />

        {/* Exchange Rates Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <History className="h-5 w-5" />
              {t('exchangeRates.historyTitle')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {rates.length === 0 ? (
              <div className="text-center py-8">
                <History className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500 dark:text-gray-400">{t('exchangeRates.noRates')}</p>
                <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
                  {t('exchangeRates.noRatesHint')}
                </p>
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('common.date')}</TableHead>
                      <TableHead>{t('exchangeRates.from')}</TableHead>
                      <TableHead>{t('exchangeRates.to')}</TableHead>
                      <TableHead>{t('exchangeRates.rate')}</TableHead>
                      <TableHead>{t('exchangeRates.buy')}</TableHead>
                      <TableHead>{t('exchangeRates.sell')}</TableHead>
                      <TableHead>{t('exchangeRates.source')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rates.map((rate) => (
                      <TableRow key={rate.uuid} data-testid={`exchange-rate-row-${rate.uuid}`}>
                        <TableCell>{formatRateDate(rate.rate_date)}</TableCell>
                        <TableCell>{rate.from_currency}</TableCell>
                        <TableCell>{rate.to_currency}</TableCell>
                        <TableCell className="font-medium">{formatRate(rate.rate)}</TableCell>
                        <TableCell className="text-gray-600 dark:text-gray-400">
                          {formatRate(rate.buy_rate)}
                        </TableCell>
                        <TableCell className="text-gray-600 dark:text-gray-400">
                          {formatRate(rate.sell_rate)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {te(rate.source)}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4">
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {t('exchangeRates.pagination', {
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
