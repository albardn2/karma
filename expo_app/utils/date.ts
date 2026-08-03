// Language-agnostic date formatting: numeric month/day and 24h time render
// identically for every UI language (no "Jul", no localized AM/PM digits).

const pad = (n: number) => String(n).padStart(2, '0');

/** "07/11 07:02" — for list rows and compact labels. */
export const formatMonthDayTime = (d: Date): string =>
  `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** "07/11/2026" — when the year matters. */
export const formatNumericDate = (d: Date): string =>
  `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()}`;

/**
 * "2026-07-18" -> "07/18/2026", by SPLITTING the string. Never `new Date()`.
 *
 * These come from Postgres `date` columns — a calendar day with no time and no zone.
 * `new Date("2026-07-18")` is parsed as UTC midnight, so `.getDate()` returns the 17th
 * for any viewer west of Greenwich: the billing day would be displayed off by one for
 * a whole hemisphere. The web app hit this and fixed it the same way.
 *
 * Timestamps are different and may be parsed — `created_at` carries a time.
 */
export const plainDate = (s?: string | null): string => {
  const p = String(s ?? '').split('-');
  return p.length === 3 ? `${p[1]}/${p[2]}/${p[0]}` : '—';
};

/** The day-of-month from a date-only string, for "day 18 of each month". 0 if unparseable. */
export const plainDayOfMonth = (s?: string | null): number =>
  Number(String(s ?? '').split('-')[2] ?? 0) || 0;

/**
 * Today as a local YYYY-MM-DD, so a string comparison against a date-only field happens
 * in the viewer's own calendar. `toISOString().slice(0,10)` is UTC and is a day ahead in
 * Damascus before 03:00, which would show "due now" a day early.
 */
export const todayPlain = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
