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
/** [year, month, day] from the YYYY-MM-DD prefix of a date or timestamp, read as written. */
const plainParts = (s?: string | null): [number, number, number] | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s ?? ''));
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
};

export const plainDate = (s?: string | null): string => {
  const p = plainParts(s);
  return p ? `${pad(p[1])}/${pad(p[2])}/${p[0]}` : '—';
};

/**
 * "11/1" for a calendar bucket key (a date, or a bucket start the server truncated
 * to midnight). Read as written: parsing it as a Date would put a date-only key at
 * UTC midnight, which is the previous day anywhere west of UTC.
 */
export const plainMonthDay = (s?: string | null): string => {
  const p = plainParts(s);
  return p ? `${p[1]}/${p[2]}` : '';
};

/** "11/26" (month/short year) for a month bucket key, read as written. */
export const plainMonthYear = (s?: string | null): string => {
  const p = plainParts(s);
  return p ? `${p[1]}/${String(p[0]).slice(2)}` : '';
};

/** Whole days from today (local) to a date-only value; negative once it has passed. */
export const daysUntilPlain = (s?: string | null): number | null => {
  const p = plainParts(s);
  if (!p) return null;
  const now = new Date();
  const target = Date.UTC(p[0], p[1] - 1, p[2]);
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target - today) / 86_400_000);
};

/** The day-of-month from a date-only string, for "day 18 of each month". 0 if unparseable. */
export const plainDayOfMonth = (s?: string | null): number => plainParts(s)?.[2] ?? 0;

/**
 * Today as a local YYYY-MM-DD, so a string comparison against a date-only field happens
 * in the viewer's own calendar. `toISOString().slice(0,10)` is UTC and is a day ahead in
 * Damascus before 03:00, which would show "due now" a day early.
 */
export const todayPlain = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/**
 * Parse a backend timestamp that has no zone. The columns are naive UTC, so a bare
 * `new Date(s)` reads them as LOCAL and shifts the result by the viewer's offset —
 * appending Z is what makes two screens agree about the same row.
 *
 * Only for timestamps. A date-only column (expiration_date, billing_day) must go
 * through plainDate instead: it is a calendar day, and parsing it at all is the bug.
 */
export const parseTs = (s?: string | null): Date =>
  new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(String(s ?? '')) ? String(s) : `${String(s ?? '')}Z`);
