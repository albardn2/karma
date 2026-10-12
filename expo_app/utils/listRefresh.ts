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
