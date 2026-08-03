/**
 * Rendering money without ever adding two currencies together.
 *
 * This is a hard rule in this product, not a stylistic one. Since the July 2026
 * redenomination a SYP figure is two orders of magnitude away from what it used to be,
 * and USD sits three from SYP, so a single "total" spanning both is not a rounding
 * problem — it is a number that means nothing. Every amount therefore travels with its
 * currency, and a map of currency to amount is rendered as several figures side by side.
 */

/** "9.99 USD", or "—" for a missing amount. The currency is omitted only if absent. */
export const money = (n?: number | null, currency?: string | null): string =>
  n == null ? '—' : `${Number(n).toFixed(2)}${currency ? ` ${currency}` : ''}`;

/**
 * One figure per currency, joined — never summed. "120.00 USD · 45000.00 SYP".
 *
 * Zero-value currencies are kept: a settled currency reading 0.00 is information, and
 * this renderer is used where a row is expected to exist. (The platform console's list
 * rows do filter them, deliberately, because there a currency segment that collapses to
 * nothing keeps a one-line summary short — different job, so it keeps its own local
 * version rather than sharing this one.)
 */
export const perCurrency = (m?: Record<string, number> | null): string => {
  const entries = Object.entries(m ?? {});
  return entries.length
    ? entries.map(([cur, v]) => `${Number(v).toFixed(2)} ${cur}`).join(' · ')
    : '—';
};
