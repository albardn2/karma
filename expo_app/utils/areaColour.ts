// One service area, one colour, on every screen that draws it.
//
// The all-areas map keyed colour off the row's INDEX inside the page it fetched
// (map.tsx: PALETTE[i % PALETTE.length]) — the same defect the web map has. That can
// never agree with the list: the list pages at 20 and the map fetches 100, so index 3
// is a different area on the two screens, and a search or the "covering me" chip
// renumbers everything. Keying off the uuid makes an area's colour a property of the
// area: stable across pagination, across filters, and between the list and the map,
// which is the only thing that makes drawing it worth anything. "The teal one in the
// list" has to be the teal one on the map.
//
// SIX COLOURS WAS NOT ENOUGH, measured rather than felt. Hashing the 13 real uuids into
// six put five of them on one colour and left two colours unused. Ten drops the worst
// group to 3 and the colliding pairs from 13 to 7. Colour is therefore a recognition
// aid and NEVER an identifier — with 100 areas it cannot be — so nothing may key off
// it, and every row states its facts in text as well.
//
// Palette rules, both computed rather than eyeballed: every entry clears 3:1 against
// white (WCAG 1.4.11, non-text graphic; the weakest is #D97706 at 3.19) and every pair
// is at least dE76 26.9 apart, so no two read as "the same colour, slightly darker".
// There is deliberately no grey in it, because grey is reserved below for "no shape".
export const AREA_PALETTE = [
  '#5469D4', // indigo — the app's primary
  '#0E9F6E', // green
  '#D97706', // amber
  '#DC2626', // red
  '#7C3AED', // violet
  '#0891B2', // cyan
  '#C026D3', // fuchsia
  '#DB2777', // pink
  '#4D7C0F', // olive
  '#0F766E', // deep teal
];

/**
 * Grey, for an area whose geometry will not parse.
 *
 * The map DROPS those areas rather than drawing them empty, so giving one a palette
 * colour would be a promise the map does not keep. 4.76:1 on white, dE76 24.1 from its
 * nearest palette entry, so it never reads as one of them.
 */
export const AREA_NO_SHAPE = '#64748B';

/**
 * Stable palette entry for an area. FNV-1a over the uuid: deterministic, dependency
 * free, and unsigned (`>>> 0`) so the bucket matches the distribution that was
 * measured (7 of 10 colours used over the real 13, largest group 3).
 */
export function areaColour(uuid: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < uuid.length; i++) {
    h ^= uuid.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return AREA_PALETTE[(h >>> 0) % AREA_PALETTE.length];
}
