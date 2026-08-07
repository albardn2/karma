import { parseTs } from '@/utils/date';

export interface Lot {
  uuid: string;
  lot_id?: string | null;
  created_at: string;
  current_quantity: number;
  unit?: string | null;
  cost_per_unit?: number | null;
  warehouse_uuid?: string | null;
}

/**
 * A CLIENT-SIDE MIRROR OF THE SERVER'S FIFO ALLOCATION.
 *
 * A process does not let the user choose lots. The client sends a material and a
 * quantity; the server finds the lots itself, oldest first, and rewrites the request's
 * input list with what it actually drew. Verified: one input line of 443.13 kg came back
 * as two stored rows — 433.13 from the 2025 lot (draining it) and 10.0 from the 2026 one.
 *
 * This mirrors the repository's own predicate: material match, not deleted, quantity
 * above zero, ordered by created_at ascending — with no warehouse filter and no
 * is_active filter, both of which are easy to assume and both of which are absent.
 *
 * IT IS A PREVIEW AND NOTHING ELSE. The payload never carries a lot, so if the server's
 * ordering ever changes — expiry first, warehouse-scoped, an is_active clause — this
 * degrades the explanation shown to the user and cannot corrupt the write.
 */

/** Quantities are floats all the way down; compare with a tolerance, never with ===. */
export const EPS = 1e-6;

/** Guard against float dust like 36.400000000000006 reaching the wire or the screen. */
export const round6 = (n: number): number => Math.round(n * 1e6) / 1e6;

/**
 * What the server treats as available: the sum of POSITIVE lots, never a net sum.
 *
 * This distinction is not academic. A material here has lots of 0.0 and -199.2, and a
 * net sum would report -199.2 available — blocking a request the server would accept.
 * A negative lot means more was consumed than recorded, which is a bookkeeping problem,
 * not stock that can offset another lot.
 */
export const availableOf = (lots: Lot[]): number =>
  lots.reduce((s, l) => s + Math.max(Number(l.current_quantity) || 0, 0), 0);

export interface Draw {
  lot: Lot;
  take: number;
}

/**
 * Which lots a request would draw from, and how much is left unfilled.
 *
 * `short` above zero means the server would refuse — that is what the form blocks on,
 * so the refusal is shown while the quantity is still being typed rather than as a 404
 * after the whole form is filled.
 */
export function fifoPlan(lots: Lot[], want: number): { draws: Draw[]; short: number } {
  const pool = lots
    .filter((l) => Number(l.current_quantity) > 0)
    .sort((a, b) => +parseTs(a.created_at) - +parseTs(b.created_at));
  const draws: Draw[] = [];
  let left = want;
  for (const lot of pool) {
    if (left <= EPS) break;
    const take = Math.min(Number(lot.current_quantity), left);
    draws.push({ lot, take: round6(take) });
    left = round6(left - take);
  }
  return { draws, short: left > EPS ? left : 0 };
}

/**
 * Parse a typed quantity.
 *
 * A decimal comma is a real keyboard on an Arabic locale, and Number('1,5') is NaN — so
 * the comma is normalised rather than left to produce a silent NaN that reads as an
 * empty field.
 */
export const num = (s: string): number => Number(String(s).replace(',', '.').trim());

/**
 * Collapse repeated materials into one line per material.
 *
 * Required, not tidy: the server expands one input line into one row per lot it spans,
 * so a run cloned from a previous one arrives with the SAME material listed several
 * times. Re-submitting that unmerged asks for the material once per lot and consumes a
 * multiple of what was intended.
 */
export function mergeByMaterial<T extends { material_uuid: string; quantity: number }>(
  rows: T[],
): Array<{ material_uuid: string; quantity: number; from: T[] }> {
  const out = new Map<string, { material_uuid: string; quantity: number; from: T[] }>();
  for (const r of rows) {
    const cur = out.get(r.material_uuid);
    if (cur) {
      cur.quantity = round6(cur.quantity + r.quantity);
      cur.from.push(r);
    } else {
      out.set(r.material_uuid, { material_uuid: r.material_uuid, quantity: r.quantity, from: [r] });
    }
  }
  return [...out.values()];
}
