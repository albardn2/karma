// Language-agnostic date formatting: numeric month/day and 24h time render
// identically for every UI language (no "Jul", no localized AM/PM digits).

const pad = (n: number) => String(n).padStart(2, '0');

/** "07/11 07:02" — for list rows and compact labels. */
export const formatMonthDayTime = (d: Date): string =>
  `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** "07/11/2026" — when the year matters. */
export const formatNumericDate = (d: Date): string =>
  `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()}`;
