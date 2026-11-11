import { useIsFocused } from '@react-navigation/native';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { apiCall, isOk } from '@/utils/api';
import { API_QUERY_ROOT } from '@/utils/queryClient';

/** A read that came back as anything but a 2xx with a body. */
export class ApiQueryError extends Error {
  constructor(readonly status: number, readonly body?: string) {
    super(`GET failed with status ${status}`);
  }
}

/** One GET, failing with an ApiQueryError rather than resolving to an error shape. */
export async function apiGet<T>(path: string): Promise<T> {
  const res = await apiCall<T>(path);
  if (!isOk(res.status) || res.data == null) throw new ApiQueryError(res.status, res.error);
  return res.data;
}

/**
 * A read that takes more than one GET (paging through a list, say), cached and kept
 * fresh exactly like useApiQuery. `key` names the read: it must change whenever the
 * fetcher would fetch something different. Pass `null` to wait.
 *
 * The screen watches its data only while it is focused: screens under the current
 * one in the stack stay mounted, and without this every write would refetch every
 * one of them at once. When a screen is shown again it refetches if its data went
 * stale meanwhile, which a write anywhere guarantees.
 *
 * The previous result stays on screen while a new page, filter or search loads,
 * instead of being replaced by a spinner.
 *
 * `paused` keeps the data the screen has and stops refetching it, e.g. while the
 * user edits a copy of it: a refresh mid-edit would change what the save diffs
 * against.
 */
export function useCachedQuery<T>(
  key: string | null,
  fetcher: () => Promise<T>,
  { paused = false }: { paused?: boolean } = {},
) {
  const isFocused = useIsFocused();
  return useQuery<T, ApiQueryError>({
    queryKey: [API_QUERY_ROOT, key],
    enabled: key !== null && !paused,
    subscribed: isFocused,
    placeholderData: keepPreviousData,
    queryFn: fetcher,
  });
}

/** The cache key a GET of `path` lives under, for seeding it with a write's response. */
export const apiQueryKey = (path: string) => [API_QUERY_ROOT, path];

/** A GET against the API, cached and kept fresh. Pass `null` to wait, e.g. for a route param. */
export function useApiQuery<T>(path: string | null, options?: { paused?: boolean }) {
  return useCachedQuery<T>(path, () => apiGet<T>(path as string), options);
}
