/**
 * "This list is out of date": set by a screen that changed records behind a
 * list, read by the list when it comes back into view.
 *
 * Going back with router.back() returns to the list screen that is already
 * mounted, so it does not fetch again, and a record just deleted on the
 * detail screen would still be listed until a pull-to-refresh. Refetching on
 * every focus would cost a request each time any list is revisited; marking
 * the endpoints a write actually touched keeps the refetch to when it matters.
 *
 * Keyed by the list's endpoint, exactly as ModuleListScreen is given it
 * (e.g. "/payment/").
 */
const stale = new Set<string>();

export function markListsStale(...endpoints: string[]) {
  for (const endpoint of endpoints) stale.add(endpoint);
}

/** True once per marking: the caller refetches, and the mark is cleared. */
export function takeListStale(endpoint: string): boolean {
  return stale.delete(endpoint);
}

/**
 * A one-line confirmation for the list to show when it comes back into view —
 * "Customer deleted" — since router.back() cannot carry params, and replacing
 * to the list instead would stack a second copy of it over the stale first.
 * Same keying as the stale marks.
 *
 * Short-lived: it is for the screen the user lands on next. A write made from
 * a screen with no such list under it (an order deleted from the screen a
 * customer's New order led to) left the message waiting, and the next visit
 * to that list, maybe hours later, announced it as news.
 */
const FLASH_TTL_MS = 10_000;
const flashes = new Map<string, { message: string; at: number }>();

export function setListFlash(endpoint: string, message: string) {
  flashes.set(endpoint, { message, at: Date.now() });
}

/** The pending message, once and only while fresh; null when there is none. */
export function takeListFlash(endpoint: string): string | null {
  const entry = flashes.get(endpoint);
  flashes.delete(endpoint);
  return entry && Date.now() - entry.at <= FLASH_TTL_MS ? entry.message : null;
}
