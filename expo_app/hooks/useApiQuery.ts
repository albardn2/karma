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

/**
 * A GET against the API, cached and kept fresh.
 *
 * The screen watches its data only while it is focused: screens under the current
 * one in the stack stay mounted, and without this every write would refetch every
 * one of them at once. When a screen is shown again it refetches if its data went
 * stale meanwhile, which a write anywhere guarantees.
 *
 * The previous result stays on screen while a new page, filter or search loads,
 * instead of being replaced by a spinner.
 *
 * Pass `null` to wait, e.g. until a route param is known.
 */
export function useApiQuery<T>(path: string | null) {
  const isFocused = useIsFocused();
  return useQuery<T, ApiQueryError>({
    queryKey: [API_QUERY_ROOT, path],
    enabled: path !== null,
    subscribed: isFocused,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const res = await apiCall<T>(path as string);
      if (!isOk(res.status) || res.data == null) throw new ApiQueryError(res.status, res.error);
      return res.data;
    },
  });
}
