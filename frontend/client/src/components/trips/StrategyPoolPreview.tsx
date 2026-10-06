import { useQuery } from "@tanstack/react-query";

import { useDebounced } from "@/components/analytics/shared";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { apiRequest } from "@/lib/queryClient";

/**
 * How many customers the picked strategy would consider, under the dropdown.
 *
 * A real child component, not a fragment rendered inside the strategy
 * FormField's `render`: that callback is react-hook-form's Controller, so a
 * useQuery called there throws a hook-order error the moment the field
 * conditionally unmounts.
 *
 * WHAT THE NUMBERS MEAN, because the wording is load-bearing:
 *   - total        — distinct customers at least one priority matches. A
 *                    provable hard ceiling on what a run can pick.
 *   - per priority — that priority's own pool, counted against EVERYTHING,
 *                    before its max_stops and before the stop budget. Exact
 *                    for Priority 1; an upper bound for the ones below it,
 *                    because in a real run earlier priorities take their
 *                    stops first.
 * Nothing here may say a priority WILL GET n. That is an allocation, and
 * computing it would mean re-running the selection stage this preview
 * deliberately refuses to touch.
 */

const MANUAL = "manual";
const LEGACY_CLUSTER = "legacy_cluster";
const CREATE_STRATEGY_SENTINEL = "__create_strategy__";

interface PriorityCount {
  index: number;
  count: number;
  max_stops: number | null;
}

interface PoolPreview {
  applicable: boolean;
  eligible_pool: number;
  total: number;
  priorities: PriorityCount[];
  overlaps: boolean;
  unmatched_service_areas: string[];
}

interface Props {
  strategy: string;
  serviceAreas: string[];
  desiredStops: unknown;
  taskCompleted: boolean;
}

export function StrategyPoolPreview({
  strategy,
  serviceAreas,
  desiredStops,
  taskCompleted,
}: Props) {
  const { t } = useLanguage();

  // Debounce a STRING, never the array. useDebounced's effect depends on
  // [value, ms], and form.watch hands back a NEW array reference on every
  // render — debouncing the array would reset its own timer on every
  // unrelated keystroke in the form and might never settle.
  // Sorted, because react-query hashes array keys by ORDER: untick and
  // retick one area and an unsorted key mints a second cache entry for an
  // identical answer. JSON rather than a comma join, because a service area
  // name has no validator and may legally contain a comma.
  const liveAreasKey = JSON.stringify([...serviceAreas].sort());
  const areasKey = useDebounced(liveAreasKey, 350);
  const strat = useDebounced(strategy, 350);

  // '' is the untouched default — the field's "manual" is only placeholder
  // text — so a naive `strategy !== "manual"` would fire a request on every
  // freshly opened setup form.
  const normalized = strat.trim().toLowerCase();
  const enabled =
    normalized !== "" &&
    normalized !== MANUAL &&
    normalized !== LEGACY_CLUSTER &&
    strat !== CREATE_STRATEGY_SENTINEL;

  // TRUE while the debounced inputs still lag the live ones. `isFetching`
  // alone is false during the 350ms window, so without this the previous
  // strategy's numbers render fully opaque under the NEW strategy's name —
  // a wrong number on screen, which is the one thing this must never do.
  const pending = strat !== strategy || areasKey !== liveAreasKey;

  const { data, isFetching, isError, error, refetch } = useQuery<PoolPreview>({
    queryKey: ["/task-execution/strategy-pool-preview", strat, areasKey],
    queryFn: () =>
      apiRequest("/task-execution/strategy-pool-preview", {
        method: "POST",
        body: { strategy: strat, service_areas: JSON.parse(areasKey) },
      }),
    enabled,
    // a live operational number: the global 5-minute staleTime would show a
    // dispatcher a count taken before they changed the areas
    staleTime: 0,
    gcTime: 0,
    // a 400 here means a stale strategy or a missing area — retrying cannot
    // heal either, and three attempts just delay the message
    retry: false,
    placeholderData: (prev) => prev,
  });

  // A 403 means this caller may submit the form but not read the count
  // (a create-without-read grant). Hide the block rather than offer a
  // Retry that can never succeed.
  const forbidden = /\b403\b/.test(String((error as any)?.message ?? ""));
  if (!enabled || forbidden || data?.applicable === false) return null;

  // the areas the NUMBERS describe, which is not necessarily what is ticked
  // right now — see `pending`
  const countedAreas: string[] = (() => {
    try {
      return JSON.parse(areasKey);
    } catch {
      return [];
    }
  })();

  const desired = Number(desiredStops);
  // run() walks each priority ONCE and clamps it to min(max_stops, remaining),
  // so a priority contributes at most min(its cap, its own count). That sum is
  // a hard ceiling alongside the union total: without it a strategy whose caps
  // all add up to less than desired_stops shows no warning at all.
  const ceiling = !data
    ? 0
    : data.priorities.length === 0
      ? data.total
      : Math.min(
          data.total,
          data.priorities.reduce(
            (sum, p) => sum + Math.min(p.max_stops ?? p.count, p.count),
            0,
          ),
        );
  const shortfall =
    !!data && !pending && Number.isFinite(desired) && desired > 0 && ceiling < desired;

  const Num = ({ children }: { children: React.ReactNode }) => (
    <span dir="ltr" className="tabular-nums font-medium text-foreground">
      {children}
    </span>
  );

  return (
    <div
      className="mt-2 space-y-1 text-sm text-muted-foreground"
      data-testid="strategy-pool-preview"
    >
      {isError ? (
        <div className="flex items-center gap-2">
          {/* inline, never a toast — a failed count must not read as a failed form */}
          <span data-testid="strategy-pool-error">{t("workflows.poolPreviewError")}</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-6 text-xs"
            onClick={() => refetch()}
            data-testid="strategy-pool-retry"
          >
            {t("workflows.poolPreviewRetry")}
          </Button>
        </div>
      ) : !data ? (
        <p data-testid="strategy-pool-loading">{t("workflows.poolPreviewLoading")}</p>
      ) : (
        <div className={isFetching || pending ? "opacity-60 space-y-1" : "space-y-1"}>
          <p data-testid="strategy-pool-total">
            {data.eligible_pool === 0 ? (
              // "in the selected service areas" is a lie when none are
              // ticked — that case means EVERYWHERE
              countedAreas.length === 0
                ? t("workflows.poolPreviewNoPoolAnywhere")
                : t("workflows.poolPreviewNoPool")
            ) : data.total === 0 ? (
              t("workflows.poolPreviewNoMatch")
            ) : (
              <>
                <Num>{data.total}</Num>{" "}
                {t("workflows.poolPreviewHeadline", {
                  pool: String(data.eligible_pool),
                })}
              </>
            )}
          </p>

          {/* from the DEBOUNCED areas, not the live prop: this caption labels
              the scope of the number beside it, and the two must not disagree */}
          {countedAreas.length === 0 && data.eligible_pool > 0 && (
            <p className="text-xs" data-testid="strategy-pool-all-areas">
              {t("workflows.poolPreviewAllAreas")}
            </p>
          )}

          {shortfall && (
            <p
              className="text-xs text-amber-700 dark:text-amber-500"
              data-testid="strategy-pool-shortfall"
            >
              {t("workflows.poolPreviewShortfall", { desired: String(desired) })}
            </p>
          )}

          {data.unmatched_service_areas.length > 0 && (
            <p
              className="text-xs text-amber-700 dark:text-amber-500"
              data-testid="strategy-pool-unmatched"
            >
              {t("workflows.poolPreviewUnmatched", {
                names: data.unmatched_service_areas.join(", "),
              })}
            </p>
          )}

          {data.priorities.length > 0 && (
            <ul className="space-y-0.5 pt-1">
              {data.priorities.map((p) => (
                <li
                  key={p.index}
                  className="flex items-center justify-between gap-2 text-xs"
                  data-testid={`strategy-pool-row-${p.index}`}
                >
                  {/* a priority has no name; the dialog numbers them the same way */}
                  <span>{t("workflows.priorityN", { n: String(p.index + 1) })}</span>
                  <span className="flex items-center gap-2">
                    {p.max_stops != null && (
                      <span data-testid={`strategy-pool-row-cap-${p.index}`}>
                        {t("workflows.poolPreviewCap", { n: String(p.max_stops) })}
                      </span>
                    )}
                    {/* a zero row still renders: hiding it makes a ten-band
                        strategy look like a three-band one */}
                    <span
                      dir="ltr"
                      className="tabular-nums"
                      data-testid={`strategy-pool-row-count-${p.index}`}
                    >
                      {p.count}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}

          {data.overlaps && (
            <p className="text-xs" data-testid="strategy-pool-overlap-note">
              {t("workflows.poolPreviewOverlap")}
            </p>
          )}

          {data.priorities.length > 1 && (
            <p className="text-xs" data-testid="strategy-pool-row-hint">
              {t("workflows.poolPreviewRowHint")}
            </p>
          )}

          {taskCompleted && (
            <p className="text-xs" data-testid="strategy-pool-already-routed">
              {t("workflows.poolPreviewAlreadyRouted")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
