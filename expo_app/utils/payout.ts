/** The four things a payout can be for; exactly one link is set on each. */
export interface PayoutLinks {
  expense_uuid?: string | null;
  purchase_order_uuid?: string | null;
  employee_uuid?: string | null;
  credit_note_item_uuid?: string | null;
}

export const payoutKindKey = (x: PayoutLinks): string =>
  x.expense_uuid
    ? 'payouts.forExpense'
    : x.purchase_order_uuid
      ? 'payouts.forPurchaseOrder'
      : x.employee_uuid
        ? 'payouts.forEmployee'
        : x.credit_note_item_uuid
          ? 'payouts.forCreditNote'
          : 'payouts.unlinked';
