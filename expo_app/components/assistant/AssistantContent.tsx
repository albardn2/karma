// Renders what the assistant sends: formatted text, charts, maps and approval cards.
// Charts reuse the app's own react-native-svg charts (components/Chart.tsx); maps
// use react-native-maps like the trip map. Same data as the web panel.
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import MapView, { Circle, Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { BarChart, ChartLegend, GroupedBarChart, LineChart, SERIES_COLOURS, StackedBarChart } from '@/components/Chart';
import type { ChartSpec, ConfirmEvent } from '@/utils/assistant';

const fmt = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
const compact = (n: number) =>
  Math.abs(n) >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : Math.abs(n) >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : fmt.format(n);

// ---------------------------------------------------------------- text

function Inline({ text, style }: { text: string; style?: any }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return (
    <Text style={style}>
      {parts.map((p, i) =>
        p.startsWith('**') && p.endsWith('**') && p.length > 4 ? (
          <Text key={i} style={{ fontWeight: '700' }}>{p.slice(2, -2)}</Text>
        ) : p.startsWith('`') && p.endsWith('`') && p.length > 2 ? (
          <Text key={i} style={s.code}>{p.slice(1, -1)}</Text>
        ) : (
          <Text key={i}>{p}</Text>
        ),
      )}
    </Text>
  );
}

const isRow = (l: string) => l.trim().startsWith('|') && l.trim().endsWith('|');
const isSep = (l: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l);
const cells = (l: string) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());

/** Paragraphs, headings, lists, tables, **bold**, `code`. Built from Text views only. */
export function RichText({ text, color }: { text: string; color: string }) {
  const blocks: React.ReactNode[] = [];
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  let i = 0;
  let k = 0;
  const base = [s.body, { color }];
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (isRow(line) && i + 1 < lines.length && isSep(lines[i + 1])) {
      const head = cells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && isRow(lines[i])) rows.push(cells(lines[i++]));
      blocks.push(
        <View key={k++} style={s.table}>
          <View style={[s.tr, s.th]}>
            {head.map((h, j) => <Inline key={j} text={h} style={[s.td, { color, fontWeight: '700' }]} />)}
          </View>
          {rows.map((r, ri) => (
            <View key={ri} style={s.tr}>
              {r.map((c, j) => <Inline key={j} text={c} style={[s.td, { color }]} />)}
            </View>
          ))}
        </View>,
      );
      continue;
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) { blocks.push(<Inline key={k++} text={h[2]} style={[...base, { fontWeight: '700', marginTop: 6 }]} />); i++; continue; }
    if (/^\s*([-*•]|\d+[.)])\s+/.test(line)) {
      while (i < lines.length && /^\s*([-*•]|\d+[.)])\s+/.test(lines[i])) {
        const ordered = /^\s*(\d+)[.)]/.exec(lines[i]);
        const item = lines[i].replace(/^\s*([-*•]|\d+[.)])\s+/, '');
        blocks.push(
          <View key={k++} style={s.li}>
            <Text style={[s.body, { color, width: 18 }]}>{ordered ? `${ordered[1]}.` : '•'}</Text>
            <Inline text={item} style={[...base, { flex: 1 }]} />
          </View>,
        );
        i++;
      }
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !isRow(lines[i]) && !/^(#{1,4})\s+/.test(lines[i]) &&
           !/^\s*([-*•]|\d+[.)])\s+/.test(lines[i])) para.push(lines[i++]);
    blocks.push(<Inline key={k++} text={para.join('\n')} style={[...base, { marginVertical: 3 }]} />);
  }
  return <View>{blocks}</View>;
}

// ---------------------------------------------------------------- charts

function Frame({ spec, children, footer }: { spec: ChartSpec; children: React.ReactNode; footer?: string }) {
  const src = spec.source;
  return (
    <View style={s.card}>
      <Text style={s.cardTitle}>{spec.title}{spec.unit ? <Text style={s.muted}> · {spec.unit}</Text> : null}</Text>
      {children}
      {spec.note ? <Text style={s.foot}>{spec.note}</Text> : null}
      <Text style={s.foot}>
        {footer ??
          (src.kind === 'query'
            ? `From Karma: ${String(src.endpoint ?? '').replace('__', ' · ').replace(/_/g, ' ')} — ${src.rows_matched ?? ''} records`
            : src.kind === 'model' ? 'Figures combined by the assistant' : 'From Karma')}
      </Text>
    </View>
  );
}

function HBars({ spec, pct }: { spec: ChartSpec; pct?: boolean }) {
  const vals = spec.series[0]?.values ?? [];
  const max = Math.max(1, ...vals.map((v) => Math.abs(v ?? 0)));
  const total = vals.reduce<number>((a, v) => a + (v ?? 0), 0) || 1;
  return (
    <View style={{ gap: 6 }}>
      {spec.labels.map((l, i) => {
        const v = vals[i] ?? 0;
        return (
          <View key={i}>
            <View style={s.hbarHead}>
              <Text style={s.hbarLabel} numberOfLines={1}>{l}</Text>
              <Text style={s.hbarValue}>{pct ? `${Math.round((v / total) * 100)}%` : compact(v)}</Text>
            </View>
            <View style={s.hbarTrack}>
              <View style={[s.hbarFill, { width: `${(Math.abs(v) / max) * 100}%`, backgroundColor: SERIES_COLOURS[pct ? i % SERIES_COLOURS.length : 0] }]} />
            </View>
          </View>
        );
      })}
    </View>
  );
}

function Heatmap({ spec }: { spec: ChartSpec }) {
  const all = spec.series.flatMap((x) => x.values).filter((v): v is number => typeof v === 'number');
  const max = Math.max(1, ...all);
  return (
    <View>
      <View style={{ flexDirection: 'row', marginLeft: 44 }}>
        {spec.labels.map((l, i) => (
          <Text key={i} style={s.hmCol} numberOfLines={1}>{i % 3 === 0 ? l.replace(':00', '') : ''}</Text>
        ))}
      </View>
      {spec.series.map((row) => (
        <View key={row.name} style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={s.hmRow} numberOfLines={1}>{row.name}</Text>
          {row.values.map((v, i) => (
            <View key={i} style={[s.hmCell, { backgroundColor: v ? `rgba(84,105,212,${0.1 + 0.85 * (v / max)})` : '#f1f5f9' }]} />
          ))}
        </View>
      ))}
    </View>
  );
}

function AssistantMap({ spec }: { spec: ChartSpec }) {
  const [[s0, w0], [n0, e0]] = spec.bounds ?? [[33.5, 36.3], [33.5, 36.3]];
  const region = {
    latitude: (s0 + n0) / 2, longitude: (w0 + e0) / 2,
    latitudeDelta: Math.max(0.02, (n0 - s0) * 1.3), longitudeDelta: Math.max(0.02, (e0 - w0) * 1.3),
  };
  const groups = spec.groups ?? [];
  const values = (spec.pins ?? []).map((p) => p.value ?? 0).filter((v) => v > 0);
  const maxV = values.length ? Math.max(...values) : 0;
  const maxW = Math.max(1, ...(spec.heat ?? []).map((c) => c.weight));
  const colour = (g?: string) => SERIES_COLOURS[Math.max(0, groups.indexOf(g ?? '')) % SERIES_COLOURS.length];
  return (
    <View>
      <View style={s.map}>
        <MapView
          style={StyleSheet.absoluteFill}
          provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
          initialRegion={region}
          scrollEnabled
          zoomEnabled
        >
          {(spec.heat ?? []).map((c, i) => {
            const t = c.weight / maxW;
            // radius in metres grows with weight; drawn under the pins
            return (
              <Circle key={`h${i}`} center={{ latitude: c.lat, longitude: c.lon }} radius={250 + 1200 * Math.sqrt(t)}
                fillColor={`rgba(239,${Math.round(200 - 160 * t)},68,${0.18 + 0.35 * t})`} strokeWidth={0} />
            );
          })}
          {(spec.routes ?? []).map((r, i) => (
            <Polyline key={`r${i}`} coordinates={r.coords.map(([lat, lon]) => ({ latitude: lat, longitude: lon }))}
              strokeColor="#111827" strokeWidth={3} lineDashPattern={[8, 6]} />
          ))}
          {(spec.pins ?? []).slice(0, 500).map((p, i) => (
            <Marker key={`p${i}`} coordinate={{ latitude: p.lat, longitude: p.lon }} pinColor={colour(p.group)}
              title={p.label || undefined}
              description={[p.value != null ? `${fmt.format(p.value)}${spec.unit ? ` ${spec.unit}` : ''}` : '', p.group ?? '']
                .filter(Boolean).join(' · ') || undefined}
              opacity={maxV && p.value ? 0.65 + 0.35 * (p.value / maxV) : 1}
            />
          ))}
        </MapView>
      </View>
      {groups.length > 0 && <ChartLegend names={groups} colours={groups.map((g) => colour(g))} />}
    </View>
  );
}

export function AssistantChart({ spec, width }: { spec: ChartSpec; width: number }) {
  const w = Math.max(200, width - 24);
  const unit = spec.unit ? ` ${spec.unit}` : '';
  const formatValue = (n: number) => `${compact(n)}${unit}`;
  const names = spec.series.map((x) => x.name);
  const num = (v: number | null | undefined) => (typeof v === 'number' ? v : 0);

  if (spec.type === 'map') {
    const src = spec.source;
    const missing = src.without_coordinates ? ` · ${src.without_coordinates} without a location` : '';
    return (
      <Frame spec={spec} footer={`${(spec.pins ?? []).length} on the map${missing} · tap a pin for details`}>
        <AssistantMap spec={spec} />
      </Frame>
    );
  }
  let body: React.ReactNode;
  switch (spec.type) {
    case 'heatmap':
      body = <Heatmap spec={spec} />;
      break;
    case 'horizontal_bar':
      body = <HBars spec={spec} />;
      break;
    case 'pie':
      body = <HBars spec={spec} pct />;
      break;
    case 'line':
    case 'area':
      body = (
        <>
          <LineChart width={w} formatValue={formatValue}
            series={spec.series.map((x) => ({ name: x.name, points: spec.labels.map((l, i) => ({ label: l, value: num(x.values[i]) })) }))} />
          {names.length > 1 && <ChartLegend names={names} />}
        </>
      );
      break;
    case 'stacked_bar':
      body = (
        <>
          <StackedBarChart width={w} formatValue={formatValue} series={names}
            data={spec.labels.map((l, i) => ({ label: l, segments: spec.series.map((x) => num(x.values[i])) }))} />
          <ChartLegend names={names} />
        </>
      );
      break;
    default:
      body =
        spec.series.length > 1 ? (
          <>
            <GroupedBarChart width={w} formatValue={formatValue} series={names}
              groups={spec.labels.map((l, i) => ({ label: l, values: spec.series.map((x) => num(x.values[i])) }))} />
            <ChartLegend names={names} />
          </>
        ) : (
          <BarChart width={w} formatValue={formatValue}
            data={spec.labels.map((l, i) => ({ label: l, value: num(spec.series[0]?.values[i]) }))} />
        );
  }
  return <Frame spec={spec}>{body}</Frame>;
}

// ---------------------------------------------------------------- approval card

export function ConfirmCard({
  event, state, error, onAnswer,
}: {
  event: Omit<ConfirmEvent, 'type'>;
  state: 'pending' | 'sending' | 'approved' | 'cancelled';
  error?: string;
  onAnswer: (approved: boolean, typed: string) => void;
}) {
  const [typed, setTyped] = useState('');
  const strong = event.tier === 'strong';
  const done = state === 'approved' || state === 'cancelled';
  const canApprove = !strong || typed.trim() === 'CONFIRM';
  return (
    <View style={[s.confirm, strong ? s.confirmStrong : s.confirmWrite, done && { opacity: 0.75 }]}>
      <Text style={s.confirmTitle}>
        {event.title}{event.target ? <Text style={{ fontWeight: '400' }}> — {event.target}</Text> : null}
      </Text>
      {strong && <Text style={s.strongNote}>Money, stock or delete — please check carefully.</Text>}
      {(event.lines.length ? event.lines : ['(no other details)']).map((l, i) => (
        <Text key={i} style={s.confirmLine}>{l}</Text>
      ))}
      <Text style={s.confirmPath}>{event.method} {event.path}</Text>
      {done ? (
        <Text style={[s.resolved, { color: state === 'approved' ? '#15803d' : '#64748b' }]}>
          {state === 'approved' ? '✓ Approved' : '✕ Cancelled — nothing changed'}
        </Text>
      ) : (
        <View style={{ gap: 8, marginTop: 10 }}>
          {strong && (
            <TextInput value={typed} onChangeText={setTyped} placeholder="Type CONFIRM to approve"
              autoCapitalize="characters" autoCorrect={false} style={s.confirmInput} />
          )}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity disabled={state === 'sending' || !canApprove} onPress={() => onAnswer(true, typed)}
              style={[s.btn, { backgroundColor: strong ? '#dc2626' : '#5469D4', opacity: canApprove ? 1 : 0.4 }]}>
              {state === 'sending' ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Approve</Text>}
            </TouchableOpacity>
            <TouchableOpacity disabled={state === 'sending'} onPress={() => onAnswer(false, '')} style={[s.btn, s.btnOutline]}>
              <Text style={[s.btnText, { color: '#334155' }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
          {error ? <Text style={{ color: '#dc2626', fontSize: 12 }}>{error}</Text> : null}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  body: { fontSize: 15, lineHeight: 21 },
  code: { fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }), fontSize: 13, backgroundColor: 'rgba(100,116,139,0.15)' },
  table: { borderWidth: StyleSheet.hairlineWidth, borderColor: '#cbd5e1', borderRadius: 8, marginVertical: 6, overflow: 'hidden' },
  tr: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, borderColor: '#e2e8f0' },
  th: { backgroundColor: 'rgba(100,116,139,0.12)', borderTopWidth: 0 },
  td: { flex: 1, fontSize: 12.5, paddingHorizontal: 6, paddingVertical: 5 },
  li: { flexDirection: 'row', marginVertical: 1 },
  card: { borderWidth: StyleSheet.hairlineWidth, borderColor: '#cbd5e1', borderRadius: 12, padding: 12, marginVertical: 6, backgroundColor: '#fff' },
  cardTitle: { fontSize: 13, fontWeight: '700', color: '#0f172a', marginBottom: 8 },
  muted: { fontWeight: '400', color: '#64748b' },
  foot: { fontSize: 10.5, color: '#64748b', marginTop: 6 },
  hbarHead: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  hbarLabel: { flex: 1, fontSize: 12, color: '#334155' },
  hbarValue: { fontSize: 12, color: '#0f172a', fontWeight: '600' },
  hbarTrack: { height: 8, backgroundColor: '#f1f5f9', borderRadius: 4, marginTop: 3, overflow: 'hidden' },
  hbarFill: { height: 8, borderRadius: 4 },
  hmCol: { width: 13, fontSize: 8, color: '#64748b', marginRight: 2 },
  hmRow: { width: 40, fontSize: 10, color: '#64748b', marginRight: 4, textAlign: 'right' },
  hmCell: { width: 13, height: 16, borderRadius: 2, marginRight: 2, marginBottom: 2 },
  map: { height: 260, borderRadius: 8, overflow: 'hidden' },
  confirm: { borderWidth: 1, borderRadius: 12, padding: 12, marginVertical: 6 },
  confirmWrite: { borderColor: '#fcd34d', backgroundColor: '#fffbeb' },
  confirmStrong: { borderColor: '#fca5a5', backgroundColor: '#fef2f2' },
  confirmTitle: { fontSize: 14, fontWeight: '700', color: '#0f172a' },
  strongNote: { fontSize: 12, color: '#b91c1c', marginTop: 2 },
  confirmLine: { fontSize: 13, color: '#1e293b', marginTop: 3 },
  confirmPath: { fontSize: 10, color: '#64748b', marginTop: 6, fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }) },
  confirmInput: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: '#fff', fontSize: 14 },
  resolved: { marginTop: 8, fontSize: 13, fontWeight: '600' },
  btn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, minWidth: 96, alignItems: 'center' },
  btnOutline: { borderWidth: 1, borderColor: '#cbd5e1', backgroundColor: '#fff' },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
});
