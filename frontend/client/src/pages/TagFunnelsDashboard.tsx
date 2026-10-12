import { Fragment, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Minus,
  TrendingDown,
  TrendingUp,
  Undo2,
} from "lucide-react";
import { DashboardShell } from "@/components/DashboardShell";
import { Card, CardContent } from "@/components/ui/card";
import { apiErrorMessage, apiRequest } from "@/lib/queryClient";
import { useLanguage } from "@/contexts/LanguageContext";

interface Step {
  /** the tag's value half; null = carries no tag for the key */
  value: string | null;
  /** customers on the step today */
  current: number;
  /** customers on the step when the period ended — equals `current` for the current period */
  at_period_end: number;
  net_change: number;
  entered: number;
  left: number;
}
interface Move {
  from: string | null;
  to: string | null;
  count: number;
}
interface Funnel {
  key: string;
  steps: Step[];
  transitions: Move[];
  /** live customers the funnel cannot place, today */
  outside: number;
  /** the same at the period's end — equals `outside` for the current period */
  outside_at_period_end: number;
}
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

// "change": the steps as they stood at the end of a calendar period, the
// period's net change, the arrows labelled with who moved, and the moves
// table — the view the dashboard was built around, and the default.
// "current": where every live customer stands right now — counts and each
// step's share of the funnel, nothing about movement. Two questions, so two
// views rather than one busy one.
type Mode = "current" | "change";

// how far back ‹ may step, per granularity — mirrors MAX_OFFSET on the server
// so the button greys out instead of the server silently clamping
const MAX_OFFSET: Record<Gran, number> = { week: 104, month: 36, quarter: 12, year: 5 };

// null is a legitimate step value (the interest funnel's Unknown), so steps
// and moves are keyed through this rather than through the value itself
const k = (v: string | null) => (v === null ? "none" : v);

/** A YYYY-MM-DD string as a local date — `new Date("2026-09-01")` would read
 * it as UTC midnight and show the previous day anywhere west of Greenwich. */
function localDate(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d);
}

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
            title={t("dashboards.tfSales")}
            testId="tf-sale"
            funnel={data.funnels.sale}
            mode={mode}
            periodLabel={periodLabel}
            labels={{
              none: t("dashboards.tfNoTag"),
              no_sale: t("dashboards.tfNoSale"),
              one_time_sale: t("dashboards.tfOneTime"),
              repeated_sale: t("dashboards.tfRepeated"),
            }}
            colors={["bg-slate-400", "bg-blue-500", "bg-green-600"]}
            outsideText={(n) => t("dashboards.tfOutsideSale", { n: n.toLocaleString() })}
          />

          <FunnelCard
            title={t("dashboards.tfInterest")}
            testId="tf-interest"
            funnel={data.funnels.interest}
            mode={mode}
            periodLabel={periodLabel}
            labels={{
              none: t("dashboards.tfUnknown"),
              not_interested: t("dashboards.tfNotInterested"),
              interested: t("dashboards.tfInterested"),
            }}
            colors={["bg-slate-400", "bg-rose-500", "bg-green-600"]}
            outsideText={(n) => t("dashboards.tfOutsideInterest", { n: n.toLocaleString() })}
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

function FunnelCard({
  title,
  testId,
  funnel,
  mode,
  periodLabel,
  labels,
  colors,
  outsideText,
}: {
  title: string;
  testId: string;
  funnel: Funnel;
  mode: Mode;
  periodLabel: string;
  labels: Record<string, string>;
  colors: string[];
  /** the footnote for `n` customers the funnel cannot place */
  outsideText: (n: number) => string;
}) {
  const { t } = useLanguage();
  const name = (v: string | null) => labels[k(v)] ?? (v as string);
  // the number a step shows: today's count, or where it stood when the
  // period closed (the same thing for the current period) — and the footnote
  // speaks of the same moment
  const shown = (s: Step) => (mode === "change" ? s.at_period_end : s.current);
  const outside = mode === "change" ? funnel.outside_at_period_end : funnel.outside;
  const max = Math.max(1, ...funnel.steps.map(shown));
  // the funnel's population today: everyone standing on some step (the
  // `outside` customers are not on it, so they are not in anyone's share)
  const placed = funnel.steps.reduce((sum, s) => sum + s.current, 0);

  // the count moving between two ADJACENT steps, each way
  const between = (a: string | null, b: string | null) => {
    let forward = 0;
    let back = 0;
    for (const m of funnel.transitions) {
      if (m.from === a && m.to === b) forward += m.count;
      else if (m.from === b && m.to === a) back += m.count;
    }
    return { forward, back };
  };

  return (
    <Card data-testid={testId}>
      <CardContent className="pt-6 space-y-5">
        <h3 className="text-base font-semibold text-gray-900">{title}</h3>

        <div className="flex flex-col md:flex-row md:items-stretch gap-2">
          {funnel.steps.map((s, i) => (
            <Fragment key={k(s.value)}>
              <StepBox
                step={s}
                count={shown(s)}
                label={name(s.value)}
                color={colors[i] ?? "bg-gray-400"}
                max={max}
                mode={mode}
                share={placed > 0 ? (100 * s.current) / placed : 0}
                testId={`${testId}-step-${k(s.value)}`}
              />
              {i < funnel.steps.length - 1 && (
                <Connector
                  {...between(s.value, funnel.steps[i + 1].value)}
                  showCounts={mode === "change"}
                  testId={`${testId}-arrow-${i}`}
                />
              )}
            </Fragment>
          ))}
        </div>

        {mode === "change" && (
          <div>
            <div className="text-xs uppercase tracking-wider text-gray-500 mb-2">
              {t("dashboards.tfMoves", { period: periodLabel })}
            </div>
            {funnel.transitions.length === 0 ? (
              <p className="text-sm text-gray-500">{t("dashboards.tfNoMoves")}</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-start text-xs uppercase tracking-wider text-gray-500">
                    <th className="pb-1 text-start">{t("dashboards.tfFrom")}</th>
                    <th className="pb-1 text-start">{t("dashboards.tfTo")}</th>
                    <th className="pb-1 text-end">{t("dashboards.tfCustomers")}</th>
                  </tr>
                </thead>
                <tbody>
                  {funnel.transitions.map((m) => (
                    <tr key={`${k(m.from)}>${k(m.to)}`} className="border-t border-gray-100">
                      <td className="py-1.5 text-gray-700">{name(m.from)}</td>
                      <td className="py-1.5 text-gray-700">
                        <span className="inline-flex items-center gap-1">
                          <ArrowRight className="h-3.5 w-3.5 text-gray-400 rtl:-scale-x-100" aria-hidden="true" />
                          {name(m.to)}
                        </span>
                      </td>
                      <td className="py-1.5 text-end tabular-nums font-medium text-gray-900">
                        {m.count.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {outside > 0 && (
          <p className="text-xs text-amber-700" data-testid={`${testId}-outside`}>
            {outsideText(outside)}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function StepBox({
  step,
  count,
  label,
  color,
  max,
  mode,
  share,
  testId,
}: {
  step: Step;
  /** the number to show — see FunnelCard's `shown` */
  count: number;
  label: string;
  color: string;
  max: number;
  mode: Mode;
  /** this step's percentage of everyone standing on the funnel today, unrounded */
  share: number;
  testId: string;
}) {
  const { t } = useLanguage();
  // a step that holds someone never reads "0%"
  const pct = share > 0 && share < 1 ? "<1" : String(Math.round(share));
  return (
    <div className="flex-1 min-w-0 rounded-lg border border-gray-200 p-3" data-testid={testId}>
      <div className="text-xs uppercase tracking-wider text-gray-500 truncate">{label}</div>
      <div className="mt-1 flex items-baseline justify-between gap-2">
        <span className="text-2xl font-bold tabular-nums text-gray-900">{count.toLocaleString()}</span>
        {mode === "change" ? (
          <Delta n={step.net_change} />
        ) : (
          <span className="text-xs font-medium tabular-nums text-gray-500" data-testid={`${testId}-share`}>
            {t("dashboards.tfShare", { pct })}
          </span>
        )}
      </div>
      {/* the bar is the funnel: each step's width relative to the fullest step */}
      <div className="mt-2 h-2 rounded bg-gray-100">
        <div className={`h-2 rounded ${color}`} style={{ width: `${Math.round((100 * count) / max)}%` }} />
      </div>
      {mode === "change" && (step.entered > 0 || step.left > 0) && (
        <div className="mt-2 flex flex-wrap gap-x-3 text-[11px] text-gray-500 tabular-nums">
          {step.entered > 0 && <span>{t("dashboards.tfEntered", { n: step.entered.toLocaleString() })}</span>}
          {step.left > 0 && <span>{t("dashboards.tfLeft", { n: step.left.toLocaleString() })}</span>}
        </div>
      )}
    </div>
  );
}

/** The net-change badge: an arrow that points the way the step moved. */
function Delta({ n }: { n: number }) {
  const Icon = n > 0 ? TrendingUp : n < 0 ? TrendingDown : Minus;
  const cls =
    n > 0 ? "text-green-700 bg-green-50" : n < 0 ? "text-red-700 bg-red-50" : "text-gray-500 bg-gray-100";
  const text = n > 0 ? `+${n.toLocaleString()}` : n.toLocaleString();
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums ${cls}`}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {text}
    </span>
  );
}

/** The arrow between two steps — in the change view, labelled with who moved
 * along it; in the current view, just the shape of the funnel. */
function Connector({
  forward,
  back,
  showCounts,
  testId,
}: {
  forward: number;
  back: number;
  showCounts: boolean;
  testId: string;
}) {
  const { t } = useLanguage();
  return (
    <div
      className="flex md:flex-col items-center justify-center gap-1 md:w-20 shrink-0 text-xs text-gray-600"
      data-testid={testId}
    >
      <ArrowRight className="hidden md:block h-5 w-5 text-gray-400 rtl:-scale-x-100" aria-hidden="true" />
      <ArrowDown className="md:hidden h-5 w-5 text-gray-400" aria-hidden="true" />
      {showCounts && <span className="font-semibold tabular-nums text-gray-900">{forward.toLocaleString()}</span>}
      {showCounts && back > 0 && (
        <span
          className="inline-flex items-center gap-0.5 text-amber-700 tabular-nums"
          title={t("dashboards.tfBack", { n: back })}
          aria-label={t("dashboards.tfBack", { n: back })}
        >
          <Undo2 className="h-3 w-3" aria-hidden="true" />
          {back.toLocaleString()}
        </span>
      )}
    </div>
  );
}
