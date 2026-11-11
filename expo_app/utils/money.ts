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

// Arabic-Indic (U+0660..) and Extended Arabic-Indic (U+06F0..) digits, and the
// Arabic decimal separator (U+066B), are what an Arabic keyboard types into a
// number field
const normaliseDigits = (text: string): string =>
  text
    .trim()
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/٫/g, '.');

/**
 * A typed amount (0 or more), or null when the text is not one.
 *
 * Strict where parseFloat is not: parseFloat("12abc") is 12 and parseFloat("1.2.3")
 * is 1.2, so a typo saved as a different price with no word said.
 *
 * A comma is read as a decimal comma only where it cannot be a thousands
 * separator — one comma, no point, one or two digits after it ("12,5"). "1,250"
 * is refused rather than read as 1.25: a SYP price a thousand times too small.
 */
export const parseAmount = (text: string): number | null => {
  let s = normaliseDigits(text);
  if (s.includes(',')) {
    if (!/^\d+,\d{1,2}$/.test(s)) return null;
    s = s.replace(',', '.');
  }
  if (!/^(\d+(\.\d*)?|\.\d+)$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

/** The most units one order line may carry — the server's bound (checkout and edit). */
export const MAX_QUANTITY = 1_000_000;

/** A whole number of units, 1 to MAX_QUANTITY, or null — "1.5" is not 1. */
export const parseWholeNumber = (text: string): number | null => {
  const s = normaliseDigits(text);
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) && n > 0 && n <= MAX_QUANTITY ? n : null;
};
