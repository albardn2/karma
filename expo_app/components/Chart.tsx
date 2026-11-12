import React, { useState } from 'react';
import { GestureResponderEvent, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { ThemedText } from '@/components/ThemedText';

/**
 * Charts drawn directly on react-native-svg.
 *
 * The web uses recharts; there is no equivalent already in the app and adding a
 * charting library for two shapes is not worth the dependency — react-native-svg
 * is already here for the map. These are deliberately small: a phone chart that
 * tries to match a desktop dashboard becomes unreadable at 375pt.
 */

export const SERIES_COLOURS = [
  '#5469D4', '#16a34a', '#d97706', '#dc2626', '#0891b2',
  '#7c3aed', '#be185d', '#0f766e', '#b45309', '#4338ca',
];

const CHART_H = 160;
const PAD_L = 38;
const PAD_B = 22;
const PAD_T = 8;

const NICE_STEPS = [1, 2, 2.5, 5, 10];
/** About four intervals fit the plot height without crowding the 9pt labels. */
const TARGET_INTERVALS = 4;
/** Width of one 9pt axis character, plus the gap kept between neighbouring labels. */
const CHAR_W = 5.4;
const LABEL_GAP = 6;

const niceStep = (raw: number) => {
  if (raw <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  return NICE_STEPS.find((f) => f * mag >= raw - 1e-9)! * mag;
};

/**
 * Evenly spaced ticks that always include zero.
 *
 * Positive and negative sides share one step, so a small dip below zero gets a full
 * step of room and its label never lands on top of the zero label.
 */
export function axisTicks(lo: number, hi: number): { min: number; max: number; ticks: number[] } {
  const low = Math.min(lo, 0);
  const high = Math.max(hi, 0) === low ? low + 1 : Math.max(hi, 0);
  const step = niceStep((high - low) / TARGET_INTERVALS);
  const min = Math.floor(low / step + 1e-9) * step;
  const max = Math.ceil(high / step - 1e-9) * step;
  const count = Math.round((max - min) / step);
  const ticks = Array.from({ length: count + 1 }, (_, i) => Math.round((min + i * step) * 1e6) / 1e6);
  return { min, max, ticks };
}

const trimZero = (s: string) => s.replace(/\.0$/, '');

/** Compact axis labels — "12.5k" beats "12500" on a narrow axis. */
const short = (n: number) => {
  const a = Math.abs(n);
  if (a >= 1_000_000) return `${trimZero((n / 1_000_000).toFixed(1))}M`;
  if (a >= 1_000) return `${trimZero((n / 1_000).toFixed(a >= 100_000 ? 0 : 1))}k`;
  return String(Math.round(n * 100) / 100);
};

/** "2026-W35" → "W35": the year repeats on every label and only crowds the axis. */
export const axisLabel = (label: string) => label.replace(/^\d{4}-W(\d{1,2})$/, 'W$1');

/** Label every stride-th slot, so that no two labels overlap at this slot width. */
export function labelStride(labels: string[], slotW: number): number {
  const widest = Math.max(0, ...labels.map((l) => axisLabel(l).length)) * CHAR_W + LABEL_GAP;
  return Math.max(1, Math.ceil(widest / Math.max(slotW, 1)));
}

const VALUE = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const defaultFormat = (n: number) => VALUE.format(n);

interface TipRow {
  name?: string;
  value: number;
  colour: string;
}

interface ChartFrameProps {
  width: number;
  count: number;
  /** slot index under a tap at this x, or null outside the plot */
  indexAt: (x: number) => number | null;
  /** x of the slot's centre, for the marker line */
  xAt: (i: number) => number;
  title: (i: number) => string;
  rows: (i: number) => TipRow[];
  formatValue: (n: number) => string;
  children: React.ReactNode;
}

/**
 * Tap a bar or point to see its exact values; tap it again, or elsewhere, to close.
 *
 * The axis labels are compact and some are skipped to fit, so the tooltip carries
 * the full period or name and every series' figure for that slot.
 */
function ChartFrame({ width, count, indexAt, xAt, title, rows, formatValue, children }: ChartFrameProps) {
  const [selected, setSelected] = useState<number | null>(null);
  const active = selected != null && selected < count ? selected : null;

  const onPress = (e: GestureResponderEvent) => {
    const i = indexAt(e.nativeEvent.locationX);
    setSelected(i == null || i === active ? null : i);
  };

  const x = active == null ? 0 : xAt(active);
  const side = x > width / 2 ? { right: width - x + 6 } : { left: x + 6 };

  return (
    <Pressable onPress={onPress} testID="chart-frame">
      <View>
        {children}
        {active != null && (
          <>
            <Svg width={width} height={CHART_H} style={StyleSheet.absoluteFill} pointerEvents="none">
              <Line x1={x} y1={PAD_T} x2={x} y2={CHART_H - PAD_B} stroke="#374151" strokeWidth={1} strokeDasharray="3,3" />
            </Svg>
            <View style={[styles.tip, side]} pointerEvents="none" testID="chart-tooltip">
              <ThemedText style={styles.tipTitle}>{title(active)}</ThemedText>
              {rows(active).map((r, ri) => (
                <View key={ri} style={styles.tipRow}>
                  <View style={[styles.swatch, { backgroundColor: r.colour }]} />
                  <ThemedText style={styles.tipText} numberOfLines={1}>
                    {r.name ? `${r.name}: ` : ''}
                    {formatValue(r.value)}
                  </ThemedText>
                </View>
              ))}
            </View>
          </>
        )}
      </View>
    </Pressable>
  );
}

/** Index of the equal-width slot under x, or null left or right of the plot. */
const slotIndex = (x: number, slot: number, count: number) => {
  const i = Math.floor((x - PAD_L) / slot);
  return i >= 0 && i < count ? i : null;
};

/** The y-axis gridlines and their labels. */
function YAxis({ ticks, y, width }: { ticks: number[]; y: (v: number) => number; width: number }) {
  return (
    <>
      {ticks.map((v) => (
        <G key={v}>
          <Line
            x1={PAD_L}
            y1={y(v)}
            x2={width - 8}
            y2={y(v)}
            stroke={v === 0 ? '#9ca3af' : '#e5e7eb'}
            strokeWidth={1}
          />
          <SvgText x={PAD_L - 6} y={y(v) + 4} fontSize={9} fill="#9ca3af" textAnchor="end">
            {short(v)}
          </SvgText>
        </G>
      ))}
    </>
  );
}

function XLabel({ x, label }: { x: number; label: string }) {
  return (
    <SvgText x={x} y={CHART_H - 6} fontSize={9} fill="#6b7280" textAnchor="middle">
      {axisLabel(label)}
    </SvgText>
  );
}

interface GroupedBarChartProps {
  /** one entry per x-axis group (period); each carries N series values */
  groups: Array<{ label: string; values: number[] }>;
  /** series names, same length/order as each group's values — drives the legend */
  series: string[];
  width: number;
  /** tooltip figures; plain grouped numbers when omitted */
  formatValue?: (n: number) => string;
}

/**
 * Several bars per x group — revenue / gross / net per period, say.
 *
 * A signed axis, unlike the single BarChart: gross and especially net can go
 * negative (a loss-making month), so the zero line floats and bars grow up or
 * down from it. The caller caps the group count (5 years / 8 quarters / 6 months)
 * so N×groups bars never turn into a smear at 375pt.
 */
export function GroupedBarChart({ groups, series, width, formatValue = defaultFormat }: GroupedBarChartProps) {
  if (!groups.length || !series.length) return null;
  const all = groups.flatMap((g) => g.values);
  const { min, max, ticks } = axisTicks(Math.min(...all), Math.max(...all));
  const span = max - min;
  const plotW = width - PAD_L - 8;
  const plotH = CHART_H - PAD_T - PAD_B;
  const y = (v: number) => PAD_T + plotH * ((max - v) / span);
  const slot = plotW / groups.length;
  const n = series.length;
  const barW = Math.max(3, Math.min(22, (slot * 0.7) / n));
  const groupW = barW * n;
  const stride = labelStride(groups.map((g) => g.label), slot);

  return (
    <ChartFrame
      width={width}
      count={groups.length}
      indexAt={(x) => slotIndex(x, slot, groups.length)}
      xAt={(i) => PAD_L + slot * i + slot / 2}
      title={(i) => groups[i].label}
      rows={(i) => groups[i].values.map((v, si) => ({ name: series[si], value: v, colour: SERIES_COLOURS[si % SERIES_COLOURS.length] }))}
      formatValue={formatValue}
    >
      <Svg width={width} height={CHART_H}>
        <YAxis ticks={ticks} y={y} width={width} />
        {groups.map((g, gi) => {
          const gx = PAD_L + slot * gi + (slot - groupW) / 2;
          return (
            <G key={`${g.label}-${gi}`}>
              {g.values.map((v, si) => {
                // a zero draws nothing: even a 1px sliver reads as "a little"
                if (v === 0) return null;
                const h = Math.max((Math.abs(v) / span) * plotH, 1);
                return (
                  <Rect
                    key={si}
                    x={gx + si * barW}
                    y={v > 0 ? y(0) - h : y(0)}
                    width={Math.max(barW - 1.5, 2)}
                    height={h}
                    rx={2}
                    fill={SERIES_COLOURS[si % SERIES_COLOURS.length]}
                  />
                );
              })}
              {gi % stride === 0 && <XLabel x={gx + groupW / 2} label={g.label} />}
            </G>
          );
        })}
      </Svg>
    </ChartFrame>
  );
}

interface StackedBarChartProps {
  /**
   * one entry per x-axis group; each carries the stack's segment values (>= 0).
   * `title` is the tooltip heading when the axis label is an abbreviation of it.
   */
  data: Array<{ label: string; segments: number[]; title?: string }>;
  /** segment names, same length/order as each entry's segments — drives the legend */
  series: string[];
  width: number;
  /** segment colours, same order as series; falls back to SERIES_COLOURS */
  colours?: string[];
  /** tooltip figures; plain grouped numbers when omitted */
  formatValue?: (n: number) => string;
}

/**
 * One bar per period, each split into stacked segments — received + debt, say.
 *
 * The segments sum to the bar (the caller guarantees received + debt = revenue),
 * so the bar's height reads as the period total and the split reads as its make-up.
 * Segments are assumed non-negative (a debt or a receipt cannot be less than zero);
 * that is why this is a plain upward stack, not the signed axis GroupedBarChart
 * needs.
 */
export function StackedBarChart({ data, series, width, colours, formatValue = defaultFormat }: StackedBarChartProps) {
  if (!data.length || !series.length) return null;
  const palette = colours ?? SERIES_COLOURS;
  const totals = data.map((d) => d.segments.reduce((s, v) => s + Math.max(v, 0), 0));
  const { max, ticks } = axisTicks(0, Math.max(...totals));
  const plotW = width - PAD_L - 8;
  const plotH = CHART_H - PAD_T - PAD_B;
  const y = (v: number) => PAD_T + plotH * (1 - v / max);
  const slot = plotW / data.length;
  const barW = Math.max(4, Math.min(28, slot * 0.6));
  const stride = labelStride(data.map((d) => d.label), slot);

  return (
    <ChartFrame
      width={width}
      count={data.length}
      indexAt={(x) => slotIndex(x, slot, data.length)}
      xAt={(i) => PAD_L + slot * i + slot / 2}
      title={(i) => data[i].title ?? data[i].label}
      rows={(i) => data[i].segments.map((v, si) => ({ name: series[si], value: v, colour: palette[si % palette.length] }))}
      formatValue={formatValue}
    >
      <Svg width={width} height={CHART_H}>
        <YAxis ticks={ticks} y={y} width={width} />
        {data.map((d, i) => {
          const x = PAD_L + slot * i + (slot - barW) / 2;
          let top = y(0); // stack grows up from the baseline
          return (
            <G key={`${d.label}-${i}`}>
              {d.segments.map((v, si) => {
                const h = (Math.max(v, 0) / max) * plotH;
                top -= h;
                return h > 0 ? (
                  <Rect key={si} x={x} y={top} width={barW} height={h} fill={palette[si % palette.length]} />
                ) : null;
              })}
              {i % stride === 0 && <XLabel x={x + barW / 2} label={d.label} />}
            </G>
          );
        })}
      </Svg>
    </ChartFrame>
  );
}

interface BarChartProps {
  data: Array<{ label: string; value: number }>;
  width: number;
  colour?: string;
  /** tooltip figures; plain grouped numbers when omitted */
  formatValue?: (n: number) => string;
}

export function BarChart({ data, width, colour = SERIES_COLOURS[0], formatValue = defaultFormat }: BarChartProps) {
  if (!data.length) return null;
  const { max, ticks } = axisTicks(0, Math.max(...data.map((d) => d.value)));
  const plotW = width - PAD_L - 8;
  const plotH = CHART_H - PAD_T - PAD_B;
  const y = (v: number) => PAD_T + plotH * (1 - v / max);
  const slot = plotW / data.length;
  const barW = Math.max(4, Math.min(28, slot * 0.6));
  const stride = labelStride(data.map((d) => d.label), slot);

  return (
    <ChartFrame
      width={width}
      count={data.length}
      indexAt={(x) => slotIndex(x, slot, data.length)}
      xAt={(i) => PAD_L + slot * i + slot / 2}
      title={(i) => data[i].label}
      rows={(i) => [{ value: data[i].value, colour }]}
      formatValue={formatValue}
    >
      <Svg width={width} height={CHART_H}>
        <YAxis ticks={ticks} y={y} width={width} />
        {data.map((d, i) => {
          const h = d.value > 0 ? Math.max((d.value / max) * plotH, 1) : 0;
          const x = PAD_L + slot * i + (slot - barW) / 2;
          return (
            <G key={`${d.label}-${i}`}>
              {h > 0 && <Rect x={x} y={y(0) - h} width={barW} height={h} rx={3} fill={colour} />}
              {i % stride === 0 && <XLabel x={x + barW / 2} label={d.label} />}
            </G>
          );
        })}
      </Svg>
    </ChartFrame>
  );
}

interface LineSeries {
  name: string;
  points: Array<{ label: string; value: number }>;
}

interface LineChartProps {
  series: LineSeries[];
  width: number;
  /** step lines, for a running stock level that changes at discrete events */
  step?: boolean;
  /** line colours, same order as series; falls back to SERIES_COLOURS */
  colours?: string[];
  /** tooltip figures; plain grouped numbers when omitted */
  formatValue?: (n: number) => string;
}

export function LineChart({ series, width, step, colours, formatValue = defaultFormat }: LineChartProps) {
  const palette = colours ?? SERIES_COLOURS;
  const withPoints = series.filter((s) => s.points.length);
  if (!withPoints.length) return null;

  const all = withPoints.flatMap((s) => s.points.map((p) => p.value));
  const { min, max, ticks } = axisTicks(Math.min(...all), Math.max(...all));
  const span = max - min;
  const n = Math.max(...withPoints.map((s) => s.points.length));
  const plotW = width - PAD_L - 8;
  const plotH = CHART_H - PAD_T - PAD_B;
  const x = (i: number) => PAD_L + (n === 1 ? plotW / 2 : (plotW * i) / (n - 1));
  const y = (v: number) => PAD_T + plotH * (1 - (v - min) / span);
  const axis = withPoints.find((s) => s.points.length === n)!.points;

  const indexAt = (px: number) => {
    if (px < PAD_L - 8 || px > width) return null;
    return n === 1 ? 0 : Math.min(n - 1, Math.max(0, Math.round(((px - PAD_L) / plotW) * (n - 1))));
  };

  return (
    <ChartFrame
      width={width}
      count={n}
      indexAt={indexAt}
      xAt={x}
      title={(i) => axis[i].label}
      rows={(i) =>
        withPoints
          .map((s) => ({ s, colour: palette[series.indexOf(s) % palette.length] }))
          .filter(({ s }) => i < s.points.length)
          .map(({ s, colour }) => ({ name: withPoints.length > 1 ? s.name : undefined, value: s.points[i].value, colour }))
      }
      formatValue={formatValue}
    >
      <Svg width={width} height={CHART_H}>
        <YAxis ticks={ticks} y={y} width={width} />
        {withPoints.map((s) => {
          const colour = palette[series.indexOf(s) % palette.length];
          let d = '';
          s.points.forEach((p, i) => {
            const px = x(i);
            const py = y(p.value);
            if (i === 0) d += `M ${px} ${py}`;
            else if (step) d += ` L ${px} ${y(s.points[i - 1].value)} L ${px} ${py}`;
            else d += ` L ${px} ${py}`;
          });
          return (
            <G key={s.name}>
              <Path d={d} stroke={colour} strokeWidth={2} fill="none" />
              {s.points.length === 1 && <Circle cx={x(0)} cy={y(s.points[0].value)} r={3} fill={colour} />}
            </G>
          );
        })}

        {/* first and last only: a line's labels sit at points, not in slots, and the
            tooltip gives every point in between */}
        {axis.map((p, i) =>
          i === 0 || i === axis.length - 1 ? (
            <SvgText
              key={`${p.label}-${i}`}
              x={x(i)}
              y={CHART_H - 6}
              fontSize={9}
              fill="#6b7280"
              textAnchor={i === 0 ? 'start' : 'end'}
            >
              {axisLabel(p.label)}
            </SvgText>
          ) : null,
        )}
      </Svg>
    </ChartFrame>
  );
}

export function ChartLegend({ names, colours }: { names: string[]; colours?: string[] }) {
  if (names.length < 2) return null;
  const palette = colours ?? SERIES_COLOURS;
  return (
    <View style={styles.legend}>
      {names.map((n, i) => (
        <View key={n} style={styles.legendItem}>
          <View style={[styles.swatch, { backgroundColor: palette[i % palette.length] }]} />
          <ThemedText style={styles.legendText} numberOfLines={1}>
            {n}
          </ThemedText>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  swatch: { width: 9, height: 9, borderRadius: 2 },
  legendText: { fontSize: 11, opacity: 0.7, maxWidth: 120 },
  tip: {
    position: 'absolute',
    top: 0,
    maxWidth: 200,
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 2,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  tipTitle: { fontSize: 12, fontWeight: '700', color: '#1f2937' },
  tipRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tipText: { fontSize: 12, color: '#374151' },
});
