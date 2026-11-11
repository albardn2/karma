/**
 * What a customer order's badges should say.
 *
 * The server's `is_fulfilled` and `is_paid` are "every live line / invoice is",
 * which is vacuously true when there is nothing to check: an order whose lines
 * were all removed read "Fulfilled", and one whose invoice totals 0.00 read
 * "Paid" — both claims about goods or money that never existed. These say what
 * is actually there.
 */

// the backend's MONEY_TOLERANCE: a balance within half a cent is settled
export const MONEY_TOLERANCE = 0.005;

interface OrderLike {
  is_fulfilled: boolean;
  is_paid?: boolean | null;
  total_adjusted_amount?: number | null;
  net_amount_paid?: number | null;
  net_amount_due?: number | null;
  customer_order_items?: { is_deleted?: boolean | null; is_fulfilled?: boolean | null }[] | null;
}

export const liveOrderItems = <T extends { is_deleted?: boolean | null }>(
  items?: T[] | null,
): T[] => (items ?? []).filter((i) => !i.is_deleted);

/** 'none' when the order has no live lines at all. */
export function fulfilState(o: OrderLike): 'none' | 'fulfilled' | 'unfulfilled' {
  const live = liveOrderItems(o.customer_order_items);
  if (!live.length) return 'none';
  return live.every((i) => i.is_fulfilled) ? 'fulfilled' : 'unfulfilled';
}

/** 'free' when there was never anything to pay. Works for an invoice too. */
export function payState(
  o: Pick<OrderLike, 'is_paid' | 'total_adjusted_amount' | 'net_amount_paid'>,
): 'free' | 'paid' | 'unpaid' {
  const total = Number(o.total_adjusted_amount ?? 0);
  const received = Number(o.net_amount_paid ?? 0);
  if (Math.abs(total) <= MONEY_TOLERANCE && received <= MONEY_TOLERANCE) return 'free';
  return o.is_paid ? 'paid' : 'unpaid';
}

/** Something is still owed. */
export const hasBalance = (o: { net_amount_due?: number | null }): boolean =>
  Number(o.net_amount_due ?? 0) > MONEY_TOLERANCE;

/**
 * The lists an order write can change, for markListsStale — so going back shows
 * the change rather than the row as it was before it.
 */
// the customer list shows each customer's balance, which every order write moves
export const ORDER_LISTS = ['/customer-order/', '/customer/'];
export const MONEY_LISTS = ['/payment/', '/financial-account/', '/transaction/'];
export const STOCK_LISTS = [
  '/inventory/',
  '/inventory-event/',
  '/vehicle-inventory/',
  '/vehicle-inventory-event/',
];
