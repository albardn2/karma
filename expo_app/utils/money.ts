/**
 * Rendering money without ever adding two currencies together.
 *
 * This is a hard rule in this product, not a stylistic one. Since the July 2026
 * redenomination a SYP figure is two orders of magnitude away from what it used to be,
 * and USD sits three from SYP, so a single "total" spanning both is not a rounding
 * problem — it is a number that means nothing. Every amount therefore travels with its
 * currency, and a map of currency to amount is rendered as several figures side by side.
 */

/**
 * Latin digits and comma grouping in every UI language: amounts are copied into
 * receipts, chats and bank apps, and SYP figures run to millions.
 */
const AMOUNT = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "1,234,567.50": two decimals, thousands grouped. */
export const formatAmount = (n: number): string => AMOUNT.format(Number(n));

/** "1,234.99 USD", or "—" for a missing amount. The currency is omitted only if absent. */
export const money = (n?: number | null, currency?: string | null): string =>
  n == null ? '—' : `${formatAmount(n)}${currency ? ` ${currency}` : ''}`;

/**
 * One figure per currency, joined — never summed. "120.00 USD · 45,000.00 SYP".
 *
 * Zero-value currencies are kept: a settled currency reading 0.00 is information, and
 * this renderer is used where a row is expected to exist. Callers that want a short
 * one-line summary filter the zero entries before passing the map in.
 */
export const perCurrency = (m?: Record<string, number> | null): string => {
  const entries = Object.entries(m ?? {});
  return entries.length ? entries.map(([cur, v]) => money(v, cur)).join(' · ') : '—';
};
