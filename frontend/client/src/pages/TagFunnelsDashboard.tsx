import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DashboardShell } from "@/components/DashboardShell";
import {
  FunnelCard,
  localDate,
  useFunnelConfigs,
  type Funnel,
  type FunnelMode,
} from "@/components/analytics/TagFunnel";
import { Card, CardContent } from "@/components/ui/card";
import { apiErrorMessage, apiRequest } from "@/lib/queryClient";
import { useLanguage } from "@/contexts/LanguageContext";

interface Period {
  granularity: Gran;
  offset: number;
  label: string;
  /** first day of the period, YYYY-MM-DD */
  start: string;
  /** first day AFTER the period, YYYY-MM-DD */
  end: string;
  is_current: boolean;
}
interface Payload {
  period: Period;
  /** when this tenant's tag log begins; null when nothing has been logged yet */
  history_from: string | null;
  total_customers: number;
  /** live customers at the period's end — equals total_customers for the current period */
  total_at_period_end: number;
  new_customers: number;
  funnels: { sale: Funnel; interest: Funnel };
}

type Gran = "week" | "month" | "quarter" | "year";

// the dashboard offers both views — see FunnelMode
type Mode = FunnelMode;

// how far back ‹ may step, per granularity — mirrors MAX_OFFSET on the server
// so the button greys out instead of the server silently clamping
const MAX_OFFSET: Record<Gran, number> = { week: 104, month: 36, quarter: 12, year: 5 };

const ymd = (d: Date) =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;

/**
 * The period the navigator is pointing at, worked out on the client the same
 * way the server does (UTC calendar, Monday weeks), so its name can follow
 * the ‹ › clicks immediately — while the payload is still loading, and even
 * if it fails — instead of lagging behind the last successful fetch. The
 * server's own `period` is still what the numbers describe.
 */
function expectedPeriod(gran: Gran, offset: number): Period {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  let start: Date;
  let end: Date;
  if (gran === "year") {
    start = new Date(Date.UTC(y - offset, 0, 1));
    end = new Date(Date.UTC(y - offset + 1, 0, 1));
  } else if (gran === "quarter") {
    const q0 = Math.floor(m / 3) * 3 - 3 * offset;
    start = new Date(Date.UTC(y, q0, 1));
    end = new Date(Date.UTC(y, q0 + 3, 1));
  } else if (gran === "month") {
    start = new Date(Date.UTC(y, m - offset, 1));
    end = new Date(Date.UTC(y, m - offset + 1, 1));
  } else {
    const monday = new Date(Date.UTC(y, m, now.getUTCDate() - ((now.getUTCDay() + 6) % 7) - 7 * offset));
    start = monday;
    // from the Monday itself — it may sit in an earlier month than today
    end = new Date(monday.getTime() + 7 * 86400000);
  }
  return { granularity: gran, offset, label: "", start: ymd(start), end: ymd(end), is_current: offset === 0 };
}

/**
 * The sale and interest funnels: where every live customer stands, and how a
 * calendar week, month, quarter or year moved them.
 *
 * In the change view each step shows the customers on it at the END of the
 * chosen period (today, for the current one), a badge with the period's net
 * change (moves in minus moves out, from the tag event log), and — for the
 * first step — how many newcomers arrived. The arrow between two steps
 * carries the number who moved forward in the period; a small undo mark
 * under it counts those who moved back (a voided order). ‹ › walk through
 * past periods, the way the materials-sold navigator does.
 */
export default function TagFunnelsDashboard({ embedded = false }: { embedded?: boolean }) {
  const { t, lang } = useLanguage();
  const configs = useFunnelConfigs();
  const [mode, setMode] = useState<Mode>("change");
  const [gran, setGranState] = useState<Gran>("month");
  const [offset, setOffset] = useState(0);
  // switching granularity re-anchors to the current period — an offset of 3
  // means something different in weeks than in years
  const setGran = (g: Gran) => {
    setGranState(g);
    setOffset(0);
  };

  // the current view shows nothing period-dependent, so it always reads this
  // month: switching to it never waits on (or fails with) whichever period
  // the change view was last on
  const q = mode === "change" ? { gran, offset } : { gran: "month" as Gran, offset: 0 };
  const { data, isLoading, isPlaceholderData, error } = useQuery<Payload>({
    queryKey: ["/dashboard/tag-funnels", q.gran, q.offset],
    queryFn: () => apiRequest(`/dashboard/tag-funnels?granularity=${q.gran}&offset=${q.offset}`),
    retry: false,
    // keep the previous period's numbers on screen (dimmed) while the next
    // one loads, so stepping the navigator updates the cards instead of
    // blanking them
    placeholderData: keepPreviousData,
  });

  const forbidden = error && /^403/.test((error as Error).message || "");

  // Western digits in both languages, as the rest of the client formats
  // numbers; Levantine month names for Arabic
  const locale = lang === "ar" ? "ar-SY-u-nu-latn" : "en-US";
  const fmt = (d: Date, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale, opts).format(d);

  // the period as a reader would name it: "September 2026", "Q3 2026",
  // "2026", "Sep 7 – Sep 13, 2026" — and "(to date)" while it is still running
  const periodName = (p: Period): string => {
    const start = localDate(p.start);
    let name: string;
    if (p.granularity === "year") {
      name = String(start.getFullYear());
    } else if (p.granularity === "quarter") {
      name = t("dashboards.tfQuarterLabel", { q: Math.floor(start.getMonth() / 3) + 1, year: start.getFullYear() });
    } else if (p.granularity === "month") {
      name = fmt(start, { month: "long", year: "numeric" });
    } else {
      const last = localDate(p.end);
      last.setDate(last.getDate() - 1);
      name = t("dashboards.tfWeekLabel", {
        from: fmt(start, { day: "numeric", month: "short" }),
        to: fmt(last, { day: "numeric", month: "short", year: "numeric" }),
      });
    }
    return p.is_current ? t("dashboards.tfPeriodToDate", { period: name }) : name;
  };
  // the server's period once it has answered for THIS selection; until then
  // (and if it never does) the one the navigator is pointing at
  const periodLabel = periodName(data && !isPlaceholderData ? data.period : expectedPeriod(q.gran, q.offset));
  const movesTitle = t("dashboards.tfMoves", { period: periodLabel });

  // a period that began before the tag log did cannot show all of its moves.
  // Both sides are UTC calendar dates, so compare them as such — parsing
  // history_from as a local instant would misfire in the hours around midnight
  const historyNote =
    mode === "change" && data?.history_from && data.period.start < data.history_from.slice(0, 10)
      ? t("dashboards.tfHistoryNote", {
          date: fmt(localDate(data.history_from.slice(0, 10)), { day: "numeric", month: "long", year: "numeric" }),
        })
      : null;

  const MODES: { key: Mode; label: string }[] = [
    { key: "current", label: t("dashboards.tfModeCurrent") },
    { key: "change", label: t("dashboards.tfModeChange") },
  ];
  const GRANS: { key: Gran; label: string }[] = [
    { key: "week", label: t("dashboards.tfWinWeek") },
    { key: "month", label: t("dashboards.tfWinMonth") },
    { key: "quarter", label: t("dashboards.tfWinQuarter") },
    { key: "year", label: t("dashboards.tfWinYear") },
  ];
  const toggle = (active: boolean) =>
    `px-3 py-1 rounded-md text-xs font-medium transition-colors ${
      active ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-900"
    }`;
  const pill = "inline-flex items-center gap-1 p-1 rounded-lg bg-gray-100 border border-gray-200";

  return (
    <DashboardShell embedded={embedded}>
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{t("dashboards.tagFunnels")}</h2>
          <p className="text-sm text-gray-600">{t("dashboards.tagFunnelsDesc")}</p>
        </div>
        {!forbidden && (
          <div className="flex items-center flex-wrap gap-2">
            <div role="group" aria-label={t("dashboards.tfModeGroup")} className={pill}>
              {MODES.map((m) => (
                <button
                  key={m.key}
                  onClick={() => setMode(m.key)}
                  aria-pressed={mode === m.key}
                  data-testid={`tf-mode-${m.key}`}
                  className={toggle(mode === m.key)}
                >
                  {m.label}
                </button>
              ))}
            </div>
            {/* the period only means something when movement is shown */}
            {mode === "change" && (
              <>
                {/* period navigator: ‹ steps back one period, › returns toward now */}
                <div role="group" aria-label={t("dashboards.tfWindowGroup")} className={pill}>
                  <button
                    onClick={() => setOffset(Math.min(MAX_OFFSET[gran], offset + 1))}
                    disabled={offset >= MAX_OFFSET[gran]}
                    data-testid="tf-prev"
                    aria-label={t("dashboards.tfPrevPeriod")}
                    className="px-2 py-1 rounded-md text-gray-500 hover:text-gray-900 disabled:opacity-30"
                  >
                    <ChevronLeft className="w-4 h-4 rtl:rotate-180" aria-hidden="true" />
                  </button>
                  <span
                    className={`px-2 text-xs font-medium text-gray-900 tabular-nums whitespace-nowrap ${isPlaceholderData ? "opacity-50" : ""}`}
                    data-testid="tf-period"
                  >
                    {periodLabel}
                  </span>
                  <button
                    onClick={() => setOffset(Math.max(0, offset - 1))}
                    disabled={offset === 0}
                    data-testid="tf-next"
                    aria-label={t("dashboards.tfNextPeriod")}
                    className="px-2 py-1 rounded-md text-gray-500 hover:text-gray-900 disabled:opacity-30"
                  >
                    <ChevronRight className="w-4 h-4 rtl:rotate-180" aria-hidden="true" />
                  </button>
                </div>
                <div role="group" aria-label={t("dashboards.tfGranGroup")} className={pill}>
                  {GRANS.map((g) => (
                    <button
                      key={g.key}
                      onClick={() => setGran(g.key)}
                      aria-pressed={gran === g.key}
                      data-testid={`tf-gran-${g.key}`}
                      className={toggle(gran === g.key)}
                    >
                      {g.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {forbidden ? (
        <Card>
          <CardContent className="pt-6 text-sm text-gray-500">{t("dashboard.analyticsRestricted")}</CardContent>
        </Card>
      ) : isLoading ? (
        <div className="space-y-6">
          <div className="h-48 rounded-lg bg-gray-50 animate-pulse" />
          <div className="h-48 rounded-lg bg-gray-50 animate-pulse" />
        </div>
      ) : error ? (
        // a period that failed to load — first load or a later step — says
        // so, rather than sitting on a skeleton or on another period's numbers
        <Card>
          <CardContent className="pt-6 text-sm text-red-700" data-testid="tf-error">
            {apiErrorMessage(error, t("dashboards.noData"))}
          </CardContent>
        </Card>
      ) : !data || data.total_customers === 0 ? (
        <Card>
          <CardContent className="pt-6 text-sm text-gray-500">{t("dashboards.noData")}</CardContent>
        </Card>
      ) : (
        <div
          className={`space-y-6 ${isPlaceholderData ? "opacity-60 transition-opacity" : ""}`}
          aria-busy={isPlaceholderData}
        >
          <p className="text-sm text-gray-600" data-testid="tf-summary">
            {mode === "current"
              ? t("dashboards.tfSummaryCurrent", { total: data.total_customers.toLocaleString() })
              : t("dashboards.tfSummary", {
                  // the period's own total, like the steps — not today's
                  total: data.total_at_period_end.toLocaleString(),
                  created: data.new_customers.toLocaleString(),
                  period: periodLabel,
                })}
          </p>

          <FunnelCard
            {...configs.sale}
            testId="tf-sale"
            funnel={data.funnels.sale}
            mode={mode}
            movesTitle={movesTitle}
          />

          <FunnelCard
            {...configs.interest}
            testId="tf-interest"
            funnel={data.funnels.interest}
            mode={mode}
            movesTitle={movesTitle}
          />

          {historyNote && (
            <p className="text-xs text-amber-700" data-testid="tf-history-note">
              {historyNote}
            </p>
          )}
          <p className="text-xs text-gray-500">
            {mode === "current" ? t("dashboards.tfCurrentHint") : t("dashboards.tfChangeHint", { period: periodLabel })}
          </p>
        </div>
      )}
    </DashboardShell>
  );
}
