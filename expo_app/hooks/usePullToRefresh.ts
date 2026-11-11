import { useCallback, useState } from 'react';

/**
 * The spinner state for a pull to refresh.
 *
 * Kept apart from the query's own fetching flag: that flag is also true for the
 * quiet refetch a screen does when it is shown again, and a spinner there would
 * flash at the top of every list the user goes back to.
 */
export function usePullToRefresh(refetch: () => Promise<unknown>) {
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    refetch().finally(() => setRefreshing(false));
  }, [refetch]);
  return { refreshing, onRefresh };
}
