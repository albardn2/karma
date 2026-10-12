/**
 * The sale and interest funnel cards, shared by the company dashboard
 * (pages/TagFunnelsDashboard) and the trip page's funnel section
 * (components/trips/TripTagFunnels), so both draw a funnel the same way.
 * New funnel UI should import from here instead of adding another copy.
 */
import { Fragment } from "react";
import { ArrowDown, ArrowRight, Minus, TrendingDown, TrendingUp, Undo2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useLanguage } from "@/contexts/LanguageContext";

export interface Step {
  /** the tag's value half; null = carries no tag for the key */
  value: string | null;
  /** customers on the step today */
  current: number;
  /** customers on the step when the period ended — equals `current` for the current period */
  at_period_end: number;
  /** customers on the step when the period began — the trip's "before" line */
  at_period_start: number;
  net_change: number;
  entered: number;
  left: number;
}
export interface Move {
  from: string | null;
  to: string | null;
  count: number;
}
export interface Funnel {
  key: string;
  steps: Step[];
  transitions: Move[];
  /** live customers the funnel cannot place, today */
  outside: number;
  /** the same at the period's end — equals `outside` for the current period */
  outside_at_period_end: number;
}

// "change": the steps as they stood at the end of a calendar period, the
// period's net change, the arrows labelled with who moved, and the moves
// table — the view the dashboard was built around, and the default (and the
// only one the trip page uses: its period is the trip itself).
// "current": where every live customer stands right now — counts and each
// step's share of the funnel, nothing about movement. Two questions, so two
// views rather than one busy one.
export type FunnelMode = "current" | "change";

// null is a legitimate step value (the interest funnel's Unknown), so steps
// and moves are keyed through this rather than through the value itself
export const k = (v: string | null) => (v === null ? "none" : v);

/** A YYYY-MM-DD string as a local date — `new Date("2026-09-01")` would read
 * it as UTC midnight and show the previous day anywhere west of Greenwich. */
export function localDate(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** What tells one funnel from the other on screen — see useFunnelConfigs. */
export interface FunnelConfig {
  title: string;
  labels: Record<string, string>;
  colors: string[];
  /** the footnote for `n` customers the funnel cannot place */
  outsideText: (n: number) => string;
}

/**
 * The sale and interest funnels' titles, step names, bar colours and outside
 * footnotes, spread into a FunnelCard: `<FunnelCard {...configs.sale} … />`.
 * Kept in one place so the dashboard and the trip page cannot drift apart.
 */
export function useFunnelConfigs(): { sale: FunnelConfig; interest: FunnelConfig } {
  const { t } = useLanguage();
  return {
    sale: {
      title: t("dashboards.tfSales"),
      labels: {
        none: t("dashboards.tfNoTag"),
        no_sale: t("dashboards.tfNoSale"),
        one_time_sale: t("dashboards.tfOneTime"),
        repeated_sale: t("dashboards.tfRepeated"),
      },
      colors: ["bg-slate-400", "bg-blue-500", "bg-green-600"],
      outsideText: (n) => t("dashboards.tfOutsideSale", { n: n.toLocaleString() }),
    },
    interest: {
      title: t("dashboards.tfInterest"),
      labels: {
        none: t("dashboards.tfUnknown"),
        not_interested: t("dashboards.tfNotInterested"),
        interested: t("dashboards.tfInterested"),
      },
      colors: ["bg-slate-400", "bg-rose-500", "bg-green-600"],
      outsideText: (n) => t("dashboards.tfOutsideInterest", { n: n.toLocaleString() }),
    },
  };
}

export function FunnelCard({
  title,
  testId,
  funnel,
  mode,
  movesTitle,
  noMovesText,
  showBefore = false,
  labels,
  colors,
  outsideText,
}: FunnelConfig & {
  testId: string;
  funnel: Funnel;
  mode: FunnelMode;
  /** the heading over the moves table — names the window the moves happened in */
  movesTitle: string;
  /** shown in place of the table when nobody moved; defaults to the dashboard's */
  noMovesText?: string;
  /** add each step's count at the period's start under the big number */
  showBefore?: boolean;
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
                showBefore={showBefore}
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
            <div className="text-xs uppercase tracking-wider text-gray-500 mb-2">{movesTitle}</div>
            {funnel.transitions.length === 0 ? (
              <p className="text-sm text-gray-500">{noMovesText ?? t("dashboards.tfNoMoves")}</p>
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
  showBefore,
  testId,
}: {
  step: Step;
  /** the number to show — see FunnelCard's `shown` */
  count: number;
  label: string;
  color: string;
  max: number;
  mode: FunnelMode;
  /** this step's percentage of everyone standing on the funnel today, unrounded */
  share: number;
  showBefore: boolean;
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
      {/* the small number under the big one: where the step stood before */}
      {showBefore && (
        <div className="text-xs text-gray-500 tabular-nums" data-testid={`${testId}-before`}>
          {t("trips.funnelsBefore", { n: step.at_period_start.toLocaleString() })}
        </div>
      )}
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
