/**
 * A customer's balance is what they owe: invoices still due plus debit notes, less
 * credit notes. So a positive figure is debt, shown in red, and a negative one is
 * credit in the customer's favour, shown in green.
 */
export const customerBalanceColor = (balance: number): string =>
  balance > 0 ? '#dc2626' : balance < 0 ? '#059669' : '#6b7280';
