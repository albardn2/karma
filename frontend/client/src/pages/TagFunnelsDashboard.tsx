import { Fragment, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowRight,
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
  current: number;
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
  outside: number;
}
interface Payload {
  window: Win;
  days: number;
  since: string;
  until: string;
  total_customers: number;
  new_customers: number;
  funnels: { sale: Funnel; interest: Funnel };
}

type Win = "week" | "month" | "quarter" | "year";

// "change": the steps with the window's net change, the arrows labelled with
// who moved, and the moves table — the view the dashboard was built around,
// and the default. "current": where every live customer stands right now —
// counts and each step's share of the funnel, nothing about movement. Two
// questions, so two views rather than one busy one.
type Mode = "current" | "change";

// the rolling windows, mirroring WINDOW_DAYS on the server; read from here
// rather than from the payload so the labels follow the toggle even while
// the next window is still loading (or failed to)
const DAYS: Record<Win, number> = { week: 7, month: 30, quarter: 91, year: 365 };

// null is a legitimate step value (the interest funnel's Unknown), so steps
// and moves are keyed through this rather than through the value itself
const k = (v: string | null) => (v === null ? "none" : v);

/**
 * The sale and interest funnels: where every live customer stands today, and
 * how the chosen window moved them.
 *
 * Each step shows the customers on it NOW (from their tags), a badge with the
 * net change over the window (moves in minus moves out, from the tag event
 * log), and — for the first step — how many newcomers arrived. The arrow
 * between two steps carries the number who moved forward in the window; a
 * small undo mark under it counts those who moved back (a voided order).
 */
export default function TagFunnelsDashboard({ embedded = false }: { embedded?: boolean }) {
  const { t } = useLanguage();
  const [mode, setMode] = useState<Mode>("change");
  const [win, setWin] = useState<Win>("month");

  // the current view shows nothing window-dependent, so it always reads the
  // default window: switching to it never waits on (or fails with) whichever
  // window was last picked in the change view
  const effectiveWin: Win = mode === "change" ? win : "month";
  const { data, isLoading, isPlaceholderData, error } = useQuery<Payload>({
    queryKey: ["/dashboard/tag-funnels", effectiveWin],
    queryFn: () => apiRequest(`/dashboard/tag-funnels?window=${effectiveWin}`),
    retry: false,
    // keep the previous window's numbers on screen (dimmed) while the next
    // one loads, so switching the toggle updates the cards instead of
    // blanking them
    placeholderData: keepPreviousData,
  });

  const forbidden = error && /^403/.test((error as Error).message || "");
  const days = DAYS[win];

  const MODES: { key: Mode; label: string }[] = [
    { key: "current", label: t("dashboards.tfModeCurrent") },
    { key: "change", label: t("dashboards.tfModeChange") },
  ];
  const WINDOWS: { key: Win; label: string }[] = [
    { key: "week", label: t("dashboards.tfWinWeek") },
    { key: "month", label: t("dashboards.tfWinMonth") },
    { key: "quarter", label: t("dashboards.tfWinQuarter") },
    { key: "year", label: t("dashboards.tfWinYear") },
  ];
  const toggle = (active: boolean) =>
    `px-3 py-1 rounded-md text-xs font-medium transition-colors ${
      active ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-900"
    }`;

  return (
    <DashboardShell embedded={embedded}>
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{t("dashboards.tagFunnels")}</h2>
          <p className="text-sm text-gray-600">{t("dashboards.tagFunnelsDesc")}</p>
        </div>
        {!forbidden && (
          <div className="flex items-center flex-wrap gap-2">
            <div
              role="group"
              aria-label={t("dashboards.tfModeGroup")}
              className="inline-flex items-center gap-1 p-1 rounded-lg bg-gray-100 border border-gray-200"
            >
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
            {/* the window only means something when movement is shown */}
            {mode === "change" && (
              <div
                role="group"
                aria-label={t("dashboards.tfWindowGroup")}
                className="inline-flex items-center gap-1 p-1 rounded-lg bg-gray-100 border border-gray-200"
              >
                {WINDOWS.map((w) => (
                  <button
                    key={w.key}
                    onClick={() => setWin(w.key)}
                    aria-pressed={win === w.key}
                    data-testid={`tf-window-${w.key}`}
                    className={toggle(win === w.key)}
                  >
                    {w.label}
                  </button>
                ))}
              </div>
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
        // a window that failed to load — first load or a later toggle — says
        // so, rather than sitting on a skeleton or on another window's numbers
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
                  total: data.total_customers.toLocaleString(),
                  created: data.new_customers.toLocaleString(),
                  days,
                })}
          </p>

          <FunnelCard
            title={t("dashboards.tfSales")}
            testId="tf-sale"
            funnel={data.funnels.sale}
            mode={mode}
            days={days}
            labels={{
              none: t("dashboards.tfNoTag"),
              no_sale: t("dashboards.tfNoSale"),
              one_time_sale: t("dashboards.tfOneTime"),
              repeated_sale: t("dashboards.tfRepeated"),
            }}
            colors={["bg-slate-400", "bg-blue-500", "bg-green-600"]}
            outsideText={t("dashboards.tfOutsideSale", { n: data.funnels.sale.outside.toLocaleString() })}
          />

          <FunnelCard
            title={t("dashboards.tfInterest")}
            testId="tf-interest"
            funnel={data.funnels.interest}
            mode={mode}
            days={days}
            labels={{
              none: t("dashboards.tfUnknown"),
              not_interested: t("dashboards.tfNotInterested"),
              interested: t("dashboards.tfInterested"),
            }}
            colors={["bg-slate-400", "bg-rose-500", "bg-green-600"]}
            outsideText={t("dashboards.tfOutsideInterest", {
              n: data.funnels.interest.outside.toLocaleString(),
            })}
          />

          <p className="text-xs text-gray-500">
            {mode === "current" ? t("dashboards.tfCurrentHint") : t("dashboards.tfChangeHint", { days })}
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
  days,
  labels,
  colors,
  outsideText,
}: {
  title: string;
  testId: string;
  funnel: Funnel;
  mode: Mode;
  days: number;
  labels: Record<string, string>;
  colors: string[];
  outsideText: string;
}) {
  const { t } = useLanguage();
  const name = (v: string | null) => labels[k(v)] ?? (v as string);
  const max = Math.max(1, ...funnel.steps.map((s) => s.current));
  // the funnel's population: everyone standing on some step (the `outside`
  // customers are not on it, so they are not in anyone's share)
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
            {t("dashboards.tfMoves", { days })}
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

        {funnel.outside > 0 && (
          <p className="text-xs text-amber-700" data-testid={`${testId}-outside`}>
            {outsideText}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function StepBox({
  step,
  label,
  color,
  max,
  mode,
  share,
  testId,
}: {
  step: Step;
  label: string;
  color: string;
  max: number;
  mode: Mode;
  /** this step's percentage of everyone standing on the funnel, unrounded */
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
        <span className="text-2xl font-bold tabular-nums text-gray-900">{step.current.toLocaleString()}</span>
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
        <div className={`h-2 rounded ${color}`} style={{ width: `${Math.round((100 * step.current) / max)}%` }} />
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
