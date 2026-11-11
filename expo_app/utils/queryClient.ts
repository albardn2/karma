import { focusManager, QueryClient } from '@tanstack/react-query';
import { AppState, Platform } from 'react-native';

/** Root of every query key built from an API path, so writes can invalidate them as one set. */
export const API_QUERY_ROOT = 'api';

/**
 * The app's one cache of server reads.
 *
 * Thirty seconds of freshness: a screen revisited within that window shows what it
 * has without a request, and one revisited later refetches, which is how a change
 * made by someone else on another device reaches this one. A change made on THIS
 * device never waits for it: every successful write marks the whole cache stale.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

// React Native has no window to regain focus, so coming back to the foreground
// stands in for it: data that went stale while the phone was locked refetches.
if (Platform.OS !== 'web') {
  focusManager.setEventListener((setFocused) => {
    const sub = AppState.addEventListener('change', (state) => setFocused(state === 'active'));
    return () => sub.remove();
  });
}

/**
 * Mark every cached read stale after a successful write.
 *
 * Everything rather than the resources the write touched: a payment moves the
 * order, the invoice, the customer's balance, the account and half the dashboards,
 * and a hand-kept map of those edges is exactly what drifted before. It stays cheap
 * because a screen only watches its data while focused (see useApiQuery), so the one
 * visible screen refetches now and the rest refetch when they are shown again.
 */
export function invalidateAfterWrite() {
  queryClient.invalidateQueries({ queryKey: [API_QUERY_ROOT] });
}

/** Drop every cached read, so the next user on this device never sees the last one's data. */
export function clearQueryCache() {
  queryClient.clear();
}
