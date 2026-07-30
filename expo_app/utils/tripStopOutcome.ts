/**
 * Deciding whether a trip stop's outcome should read as a sale.
 *
 * Twin of frontend/client/src/lib/tripStopOutcome.ts. The two clients render the
 * same stop form, so they must reach the same verdict — otherwise the same visit
 * is recorded differently depending on whether the driver used the app or the
 * web, and the trip's own sale count disagrees with the customer's history.
 * Keep the two in step; the contract they both rely on is pinned by
 * backend/tests/domains/test_trip_stop_sale_outcome.py.
 */

/** Half a cent — mirrors MONEY_TOLERANCE in backend/models/common.py. */
export const MONEY_TOLERANCE = 0.005;

/**
 * The machine key of an outcome option: everything before the Arabic half.
 *
 * Outcome options are composite strings — "sale - تم البيع",
 * "not_interested:price_too_high - غير مهتم: السعر مرتفع جدًا" — and the WHOLE
 * string is what lands in trip_stop.outcome, so it is data rather than a label
 * (see TripStopOutcome's docstring in create_trip_operator.py). Everything
 * downstream keys off this prefix: `ilike 'sale%'` in the backend analytics,
 * `startsWith('sale')` in TripAnalyticsCard.tsx and TripAnalytics.tsx.
 */
export const outcomeFamily = (option: string): string => option.split(' - ')[0].trim();

/**
 * Find the sale option among the ones THIS stop actually offers.
 *
 * Never hardcode the full value. Each stop's option list is a snapshot frozen
 * into task_inputs when its trip was created, so the strings differ by vintage:
 * the local database holds both a bare "sale" (a stop from 2026-06-30) and
 * "sale - تم البيع" (every stop since). Matching on the family key finds either.
 * Returns null when the snapshot has no sale option at all, which must leave the
 * field alone rather than invent a value the stop cannot store.
 */
export const findSaleOption = (options?: string[] | null): string | null =>
  options?.find((o) => typeof o === 'string' && outcomeFamily(o) === 'sale') ?? null;

/** The subset of an order row this decision needs. */
export interface RevenueOrderRow {
  trip_stop_uuid?: string | null;
  total_adjusted_amount?: number | null;
  is_deleted?: boolean;
  /** Null when every invoice on the order has been voided. */
  currency?: string | null;
}

/**
 * Did a revenue-bearing order get created at THIS stop?
 *
 * Two things here are load-bearing.
 *
 * `total_adjusted_amount` — invoiced items plus debit notes minus credit notes —
 * is the only field on an order that means "value of goods sold". Both obvious
 * alternatives are wrong in opposite directions, and each fails on the case the
 * other handles: `net_amount_due` collapses to 0 the moment payment is recorded,
 * and the app's create-order screen marks a cash sale paid immediately, so using
 * it would mean the most ordinary sale there is never triggers this;
 * `net_amount_paid` is 0 for anything sold on credit. Checked against live data:
 * of ten real stop-linked orders, `net_amount_due > 0` missed three genuine
 * sales, all of them paid in full at the stop.
 *
 * The comparison is against MONEY_TOLERANCE rather than 0 because the value can
 * arrive slightly negative. The ORM property this is serialized from sums debit
 * and credit notes over `self.invoice_items` WITHOUT skipping deleted items,
 * while the `total_amount` it adds them to DOES skip them — so an order whose
 * invoice lines were voided while a credit note stayed live reports a negative
 * total. A `!== 0` test would call that a sale.
 *
 * The trip_stop_uuid match is what makes this "at this stop": the orders
 * endpoint is scoped to the CUSTOMER, so without it every repeat buyer's stop
 * would flip to sale on the strength of a purchase from a previous visit.
 *
 * Pass the FULL fetched list, not the rendered recent-orders slice: that slice
 * is sorted unpaid/unfulfilled first and cut to five, and an order the driver
 * just created is paid AND fulfilled, so it sorts last and can be cut away
 * exactly for the customers who order most.
 */
export const hasRevenueOrderAtStop = (
  orders: RevenueOrderRow[] | null | undefined,
  tripStopUuid: string | null | undefined,
): boolean => {
  if (!tripStopUuid || !orders?.length) return false;
  return orders.some(
    (o) =>
      o?.trip_stop_uuid === tripStopUuid &&
      !o.is_deleted &&
      // No live invoice means no money to attribute, which is a different thing
      // from "invoiced at zero". Mirrors _money_by_currency in
      // backend/app/entrypoint/routes/trip_stop/routes.py, which skips these
      // before touching the amount.
      !!o.currency &&
      Number(o.total_adjusted_amount ?? 0) > MONEY_TOLERANCE,
  );
};
