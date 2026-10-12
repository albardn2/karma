import { queryClient } from "@/lib/queryClient";

// what an expense delete can change, by the first element of the query key
const AFFECTED_KEY_PREFIXES = ["/expense/", "/payout/", "/trip/", "/dashboard"];

/**
 * Refresh everything an expense delete can change.
 *
 * Deleting an expense also deletes its payouts (the server does both in one
 * write), so the money moves too: each payout's amount returns to the account
 * it was paid from, the trip the expense belonged to has one expense fewer,
 * and the spend/profitability dashboards and the expense analytics lose it.
 * Without this they keep showing the deleted money until a reload — every
 * query here is fresh for five minutes.
 *
 * Matched by PREFIX of the key's first element, not with `queryKey`: react-
 * query compares key elements exactly, so ["/expense/"] would miss
 * ["/expense/analytics/over-time", …] and ["/trip/"] would miss
 * ["/trip/summary", …]. Financial-account keys are not uniform either
 * ("/financial-account/…" and "/financial-account" without the slash), so
 * they are matched by substring, as AddFinancialAccountDialog does.
 */
export function refreshAfterExpenseDelete() {
  queryClient.invalidateQueries({
    predicate: (query) => {
      const key = query.queryKey[0];
      return (
        typeof key === "string" &&
        (AFFECTED_KEY_PREFIXES.some((p) => key.startsWith(p)) || key.includes("/financial-account"))
      );
    },
  });
}
