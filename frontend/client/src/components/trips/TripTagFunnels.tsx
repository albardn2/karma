import { useQuery } from "@tanstack/react-query";
import { FunnelCard, localDate, useFunnelConfigs, type Funnel } from "@/components/analytics/TagFunnel";
import { Card, CardContent } from "@/components/ui/card";
import { apiErrorMessage, apiRequest } from "@/lib/queryClient";
import { useLanguage } from "@/contexts/LanguageContext";

/** GET /trip/<uuid>/tag-funnels — the dashboard's funnels over one trip. */
interface TripFunnelsPayload {
  trip_uuid: string;
  /** worked stops (completed or skipped), revisits included */
  stops: number;
  /** distinct live customers on those stops, today */
  total_customers: number;
  /** the same customers as of the trip's end */
  total_at_period_end: number;
  /** of them, created during the trip */
  new_customers: number;
  /** when this tenant's tag log begins (naive UTC); null when nothing has been logged yet */
  history_from: string | null;
  /** the trip window, naive UTC datetimes; `end` is now while the trip runs.
   * `estimated`: the trip did not record when it set off or stopped working,
   * so the window is a fallback */
  period: { start: string; end: string; is_current: boolean; estimated: boolean };
  funnels: { sale: Funnel; interest: Funnel };
}

/**
 * The sale and interest funnels restricted to the customers this trip
 * stopped at, and how the trip moved them: the dashboard's change view with
 * the trip itself as the one fixed period, plus each step's count from
 * before the trip began.
 */
export function TripTagFunnels({ tripUuid }: { tripUuid: string }) {
  const { t, lang } = useLanguage();
  const configs = useFunnelConfigs();

  // under ["/trip/"], so the page's own invalidations (audit, edits) refresh it too
  const { data, isLoading, error } = useQuery<TripFunnelsPayload>({
    queryKey: ["/trip/", tripUuid, "tag-funnels"],
    queryFn: () => apiRequest(`/trip/${tripUuid}/tag-funnels`),
    enabled: !!tripUuid,
    retry: false,
  });

  // nobody on the funnel at the trip's end: no stop has been worked yet
  const empty = !data || (data.total_at_period_end === 0 && data.total_customers === 0);

  // Western digits in both languages and Levantine month names for Arabic,
  // as the dashboard formats its dates
  const locale = lang === "ar" ? "ar-SY-u-nu-latn" : "en-US";

  // a trip that began before the tag log did cannot show all of its moves.
  // Both sides are UTC calendar dates, so compare them as such
  const historyNote =
    data?.history_from && data.period.start.slice(0, 10) < data.history_from.slice(0, 10)
      ? t("trips.funnelsHistoryNote", {
          date: new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric" }).format(
            localDate(data.history_from.slice(0, 10))
          ),
        })
      : null;

  return (
    <div className="mt-6 space-y-6" data-testid="trip-funnels">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-gray-900">{t("trips.funnelsTitle")}</h2>
        {data && !empty && (
          <p className="mt-1 text-sm text-gray-600" data-testid="trip-funnels-desc">
            {t(data.period.is_current ? "trips.funnelsDescOpen" : "trips.funnelsDesc", {
              n: data.total_at_period_end.toLocaleString(),
            })}
            {data.new_customers > 0 && (
              <>
                {" "}
                <span data-testid="trip-funnels-new">
                  {t("trips.funnelsNew", { n: data.new_customers.toLocaleString() })}
                </span>
              </>
            )}
          </p>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-6" data-testid="trip-funnels-loading">
          <div className="h-48 rounded-lg bg-gray-50 animate-pulse" />
          <div className="h-48 rounded-lg bg-gray-50 animate-pulse" />
        </div>
      ) : error ? (
        // a failed load says so, rather than sitting on a skeleton
        <Card>
          <CardContent className="pt-6 text-sm text-red-700" data-testid="trip-funnels-error">
            {apiErrorMessage(error, t("common.error"))}
          </CardContent>
        </Card>
      ) : empty ? (
        <Card>
          <CardContent className="pt-6 text-sm text-gray-500" data-testid="trip-funnels-empty">
            {t("trips.funnelsEmpty")}
          </CardContent>
        </Card>
      ) : (
        <>
          <FunnelCard
            {...configs.sale}
            testId="trip-funnels-sale"
            funnel={data.funnels.sale}
            mode="change"
            movesTitle={t("trips.funnelsMoves")}
            noMovesText={t("trips.funnelsNoMoves")}
            showBefore
          />

          <FunnelCard
            {...configs.interest}
            testId="trip-funnels-interest"
            funnel={data.funnels.interest}
            mode="change"
            movesTitle={t("trips.funnelsMoves")}
            noMovesText={t("trips.funnelsNoMoves")}
            showBefore
          />

          {data.period.estimated && (
            <p className="text-xs text-amber-700" data-testid="trip-funnels-estimated">
              {t("trips.funnelsEstimated")}
            </p>
          )}
          {historyNote && (
            <p className="text-xs text-amber-700" data-testid="trip-funnels-history-note">
              {historyNote}
            </p>
          )}
          <p className="text-xs text-gray-500" data-testid="trip-funnels-hint">
            {t("trips.funnelsHint")}
          </p>
        </>
      )}
    </div>
  );
}
