import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Banknote, Package } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/contexts/LanguageContext";
import type { TripSummary } from "@/lib/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tripUuids: string[];
}

/** Cash and stock rolled up over the trips selected in the list.
 *
 * The cash columns deliberately match the single-trip page's Expected Cash card
 * (collected / spend / unpaid / should return) so a total can be checked against
 * the trips it came from without translating between two vocabularies.
 */
export function TripSummaryDialog({ open, onOpenChange, tripUuids }: Props) {
  const { t, te } = useLanguage();

  const { data, isLoading, error } = useQuery<TripSummary>({
    // the uuid list is part of the key, so changing the selection refetches
    queryKey: ["/trip/summary", [...tripUuids].sort().join(",")],
    queryFn: () =>
      apiRequest(`/trip/summary?trip_uuids=${encodeURIComponent(tripUuids.join(","))}`),
    enabled: open && tripUuids.length > 0,
    retry: false,
  });

  const money = (n: number) => Number(n).toFixed(2);
  // quantities can be fractional but are usually whole; don't pad 12 to 12.000
  const qty = (n: number) => {
    const v = Number(n);
    return Number.isInteger(v) ? String(v) : String(Number(v.toFixed(3)));
  };
  // only what was actually paid out comes off the net; costs still owed get
  // their own column, and only when one of the trips has any
  const hasUnpaidSpend = (data?.cash || []).some((row) => Number(row.expenses_unpaid) > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto" data-testid="dialog-trip-summary">
        <DialogHeader>
          <DialogTitle>{t('trips.summaryTitle')}</DialogTitle>
          <DialogDescription>
            {t('trips.summarySubtitle', { count: data?.trip_count ?? tripUuids.length })}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-3 py-6" data-testid="trip-summary-loading">
            <div className="h-4 bg-gray-200 dark:bg-gray-600 rounded w-1/3 animate-pulse" />
            <div className="h-4 bg-gray-200 dark:bg-gray-600 rounded w-2/3 animate-pulse" />
            <div className="h-4 bg-gray-200 dark:bg-gray-600 rounded w-1/2 animate-pulse" />
          </div>
        ) : error ? (
          <p className="py-6 text-sm text-red-600" data-testid="trip-summary-error">
            {t('trips.summaryFailed', { message: (error as Error).message })}
          </p>
        ) : !data ? null : (
          <div className="space-y-6">
            {/* Anything that makes the totals cover less than the selection is
                said out loud, not left for the reader to notice. */}
            {data.missing_uuids.length > 0 && (
              <div
                className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 p-3 text-sm text-amber-800 dark:text-amber-200"
                data-testid="trip-summary-missing"
              >
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{t('trips.summaryMissing', { count: data.missing_uuids.length })}</span>
              </div>
            )}
            {data.trips_without_end_inventory.length > 0 && (
              <div
                className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 p-3 text-sm text-amber-800 dark:text-amber-200"
                data-testid="trip-summary-open-trips"
              >
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>
                  {t('trips.summaryNoEndSnapshot', {
                    count: data.trips_without_end_inventory.length,
                  })}
                </span>
              </div>
            )}

            {/* Cash */}
            <section>
              <div className="flex items-center gap-2 mb-2">
                <Banknote className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {t('trips.expectedCash')}
                </h3>
              </div>
              {data.cash.length === 0 ? (
                <p className="text-sm text-gray-500" data-testid="trip-summary-cash-empty">
                  {t('trips.summaryNoCash')}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" data-testid="table-summary-cash">
                    <thead>
                      <tr className="text-start text-gray-500 border-b">
                        <th className="py-2 pe-4 font-medium text-start">{t('common.currency')}</th>
                        <th className="py-2 pe-4 font-medium text-end">{t('trips.cashCollected')}</th>
                        <th className="py-2 pe-4 font-medium text-end">{t('trips.tripSpend')}</th>
                        {hasUnpaidSpend && (
                          <th className="py-2 pe-4 font-medium text-end">{t('trips.unpaidSpend')}</th>
                        )}
                        <th className="py-2 font-medium text-end">{t('trips.shouldReturn')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.cash.map((row) => (
                        <tr
                          key={row.currency}
                          className="border-b last:border-0"
                          data-testid={`summary-cash-${row.currency}`}
                        >
                          <td className="py-2 pe-4">{te(row.currency)}</td>
                          <td className="py-2 pe-4 text-end tabular-nums">{money(row.collected)}</td>
                          <td className="py-2 pe-4 text-end tabular-nums text-amber-700 dark:text-amber-500">
                            {row.expenses_paid ? `- ${money(row.expenses_paid)}` : "—"}
                          </td>
                          {hasUnpaidSpend && (
                            <td
                              className="py-2 pe-4 text-end tabular-nums text-gray-500"
                              data-testid={`summary-cash-unpaid-${row.currency}`}
                            >
                              {row.expenses_unpaid ? money(row.expenses_unpaid) : "—"}
                            </td>
                          )}
                          <td
                            className={`py-2 text-end font-semibold tabular-nums ${
                              row.net < 0 ? "text-red-600" : ""
                            }`}
                          >
                            {money(row.net)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Stock */}
            <section>
              <div className="flex items-center gap-2 mb-2">
                <Package className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {t('trips.summaryNetInventory')}
                </h3>
              </div>
              {data.materials.length === 0 ? (
                <p className="text-sm text-gray-500" data-testid="trip-summary-materials-empty">
                  {t('trips.summaryNoMaterials')}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" data-testid="table-summary-materials">
                    <thead>
                      <tr className="text-start text-gray-500 border-b">
                        <th className="py-2 pe-4 font-medium text-start">{t('trips.material')}</th>
                        <th className="py-2 pe-4 font-medium text-end">{t('trips.summaryLoaded')}</th>
                        <th className="py-2 pe-4 font-medium text-end">{t('trips.reconSold')}</th>
                        <th className="py-2 pe-4 font-medium text-end">{t('trips.summaryReturned')}</th>
                        <th className="py-2 pe-4 font-medium text-end">{t('trips.summaryNetChange')}</th>
                        <th className="py-2 font-medium text-end">{t('trips.reconVariance')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.materials.map((row) => (
                        <tr
                          key={row.material_uuid}
                          className="border-b last:border-0"
                          data-testid={`summary-material-${row.material_uuid}`}
                        >
                          <td className="py-2 pe-4">
                            {row.material_name || `${row.material_uuid.substring(0, 8)}…`}
                            {row.measure_unit && (
                              <span className="text-xs text-gray-500 ms-1">({row.measure_unit})</span>
                            )}
                          </td>
                          <td className="py-2 pe-4 text-end tabular-nums">{qty(row.loaded)}</td>
                          <td className="py-2 pe-4 text-end tabular-nums">{qty(row.sold)}</td>
                          <td className="py-2 pe-4 text-end tabular-nums">{qty(row.returned)}</td>
                          <td
                            className={`py-2 pe-4 text-end font-semibold tabular-nums ${
                              row.net_change < 0 ? "text-red-600" : row.net_change > 0 ? "text-green-700" : ""
                            }`}
                          >
                            {row.net_change > 0 ? `+${qty(row.net_change)}` : qty(row.net_change)}
                            {/* the number covers fewer trips than the row's sold figure */}
                            {row.net_change_partial && (
                              <span
                                className="ms-1 text-amber-600"
                                title={t('trips.summaryPartialHint')}
                                data-testid={`summary-material-partial-${row.material_uuid}`}
                              >
                                *
                              </span>
                            )}
                          </td>
                          <td className="py-2 text-end">
                            {row.variance === 0 ? (
                              <span className="text-gray-400">—</span>
                            ) : (
                              <Badge variant="destructive">
                                {row.variance > 0 ? `+${qty(row.variance)}` : qty(row.variance)}
                              </Badge>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="text-xs text-gray-500 mt-2">{t('trips.summaryNetChangeHint')}</p>
                </div>
              )}
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
