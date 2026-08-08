import React from 'react';
import { StyleSheet, View } from 'react-native';
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

const niceMax = (v: number) => {
  if (v <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  return Math.ceil(v / mag) * mag;
};

/** Compact axis labels — "12.5k" beats "12500" on a narrow axis. */
const short = (n: number) => {
  const a = Math.abs(n);
  if (a >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (a >= 1_000) return `${(n / 1_000).toFixed(a >= 10_000 ? 0 : 1)}k`;
  return String(Math.round(n * 100) / 100);
};

interface GroupedBarChartProps {
  /** one entry per x-axis group (period); each carries N series values */
  groups: Array<{ label: string; values: number[] }>;
  /** series names, same length/order as each group's values — drives the legend */
  series: string[];
  width: number;
}

/**
 * Several bars per x group — revenue / gross / net per period, say.
 *
 * A signed axis, unlike the single BarChart: gross and especially net can go
 * negative (a loss-making month), so the zero line floats and bars grow up or
 * down from it. niceMax/short/SERIES_COLOURS are shared so it matches every other
 * chart. Kept deliberately small; the caller caps the group count (5 years / 8
 * quarters / 6 months) so N×groups bars never turn into a smear at 375pt.
 */
export function GroupedBarChart({ groups, series, width }: GroupedBarChartProps) {
  if (!groups.length || !series.length) return null;
  const all = groups.flatMap((g) => g.values);
  const rawMax = Math.max(...all, 0);
  const rawMin = Math.min(...all, 0);
  const max = niceMax(rawMax);
  const min = rawMin < 0 ? -niceMax(Math.abs(rawMin)) : 0;
  const span = max - min || 1;
  const plotW = width - PAD_L - 8;
  const plotH = CHART_H - PAD_T - PAD_B;
  const y0 = PAD_T + plotH * (max / span); // pixel row of value 0
  const slot = plotW / groups.length;
  const n = series.length;
  const barW = Math.max(3, Math.min(22, (slot * 0.7) / n));
  const groupW = barW * n;

  const gridlines = min < 0 ? [min, 0, max] : [0, max / 2, max];

  return (
    <Svg width={width} height={CHART_H}>
      {gridlines.map((v) => {
        const y = PAD_T + plotH * ((max - v) / span);
        return (
          <G key={v}>
            <Line
              x1={PAD_L}
              y1={y}
              x2={width - 8}
              y2={y}
              stroke={v === 0 ? '#9ca3af' : '#e5e7eb'}
              strokeWidth={1}
            />
            <SvgText x={PAD_L - 6} y={y + 4} fontSize={9} fill="#9ca3af" textAnchor="end">
              {short(v)}
            </SvgText>
          </G>
        );
      })}
      {groups.map((g, gi) => {
        const gx = PAD_L + slot * gi + (slot - groupW) / 2;
        return (
          <G key={`${g.label}-${gi}`}>
            {g.values.map((v, si) => {
              const h = (Math.abs(v) / span) * plotH;
              const x = gx + si * barW;
              // grow up from zero for positive, down for negative
              const y = v >= 0 ? y0 - h : y0;
              return (
                <Rect
                  key={si}
                  x={x}
                  y={y}
                  width={Math.max(barW - 1.5, 2)}
                  height={Math.max(h, 1)}
                  rx={2}
                  fill={SERIES_COLOURS[si % SERIES_COLOURS.length]}
                />
              );
            })}
            <SvgText
              x={gx + groupW / 2}
              y={CHART_H - 6}
              fontSize={9}
              fill="#6b7280"
              textAnchor="middle"
            >
              {g.label}
            </SvgText>
          </G>
        );
      })}
    </Svg>
  );
}

interface BarChartProps {
  data: Array<{ label: string; value: number }>;
  width: number;
  colour?: string;
}

export function BarChart({ data, width, colour = SERIES_COLOURS[0] }: BarChartProps) {
  if (!data.length) return null;
  const max = niceMax(Math.max(...data.map((d) => d.value), 0));
  const plotW = width - PAD_L - 8;
  const plotH = CHART_H - PAD_T - PAD_B;
  const slot = plotW / data.length;
  const barW = Math.max(4, Math.min(28, slot * 0.6));

  return (
    <Svg width={width} height={CHART_H}>
      {[0, 0.5, 1].map((f) => {
        const y = PAD_T + plotH * (1 - f);
        return (
          <G key={f}>
            <Line x1={PAD_L} y1={y} x2={width - 8} y2={y} stroke="#e5e7eb" strokeWidth={1} />
            <SvgText x={PAD_L - 6} y={y + 4} fontSize={9} fill="#9ca3af" textAnchor="end">
              {short(max * f)}
            </SvgText>
          </G>
        );
      })}
      {data.map((d, i) => {
        const h = max > 0 ? (d.value / max) * plotH : 0;
        const x = PAD_L + slot * i + (slot - barW) / 2;
        return (
          <G key={`${d.label}-${i}`}>
            <Rect x={x} y={PAD_T + plotH - h} width={barW} height={Math.max(h, 1)} rx={3} fill={colour} />
            {/* label every bar when there is room, otherwise every other one */}
            {(data.length <= 6 || i % 2 === 0) && (
              <SvgText
                x={x + barW / 2}
                y={CHART_H - 6}
                fontSize={9}
                fill="#6b7280"
                textAnchor="middle"
              >
                {d.label}
              </SvgText>
            )}
          </G>
        );
      })}
    </Svg>
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
}

export function LineChart({ series, width, step }: LineChartProps) {
  const withPoints = series.filter((s) => s.points.length);
  if (!withPoints.length) return null;

  const all = withPoints.flatMap((s) => s.points.map((p) => p.value));
  const rawMax = Math.max(...all, 0);
  const rawMin = Math.min(...all, 0);
  const max = niceMax(rawMax);
  const min = rawMin < 0 ? -niceMax(Math.abs(rawMin)) : 0;
  const span = max - min || 1;
  const n = Math.max(...withPoints.map((s) => s.points.length));
  const plotW = width - PAD_L - 8;
  const plotH = CHART_H - PAD_T - PAD_B;
  const x = (i: number) => PAD_L + (n === 1 ? plotW / 2 : (plotW * i) / (n - 1));
  const y = (v: number) => PAD_T + plotH * (1 - (v - min) / span);

  return (
    <Svg width={width} height={CHART_H}>
      {[0, 0.5, 1].map((f) => {
        const val = min + span * f;
        return (
          <G key={f}>
            <Line x1={PAD_L} y1={y(val)} x2={width - 8} y2={y(val)} stroke="#e5e7eb" strokeWidth={1} />
            <SvgText x={PAD_L - 6} y={y(val) + 4} fontSize={9} fill="#9ca3af" textAnchor="end">
              {short(val)}
            </SvgText>
          </G>
        );
      })}
      {/* zero line, drawn darker — with signed stock levels, crossing it matters */}
      {min < 0 && (
        <Line x1={PAD_L} y1={y(0)} x2={width - 8} y2={y(0)} stroke="#9ca3af" strokeWidth={1} />
      )}

      {withPoints.map((s, si) => {
        const colour = SERIES_COLOURS[si % SERIES_COLOURS.length];
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

      {withPoints[0].points.map((p, i) =>
        i === 0 || i === withPoints[0].points.length - 1 ? (
          <SvgText
            key={`${p.label}-${i}`}
            x={x(i)}
            y={CHART_H - 6}
            fontSize={9}
            fill="#6b7280"
            textAnchor={i === 0 ? 'start' : 'end'}
          >
            {p.label}
          </SvgText>
        ) : null,
      )}
    </Svg>
  );
}

export function ChartLegend({ names }: { names: string[] }) {
  if (names.length < 2) return null;
  return (
    <View style={styles.legend}>
      {names.map((n, i) => (
        <View key={n} style={styles.legendItem}>
          <View
            style={[styles.swatch, { backgroundColor: SERIES_COLOURS[i % SERIES_COLOURS.length] }]}
          />
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
});
