import React from 'react';
import { I18nManager, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { useLanguage } from '@/contexts/LanguageContext';

// The sale and interest funnel cards, shared by the company dashboard
// (app/dashboards/tag-funnels) and the trip screen's funnels section — one
// renderer, so the two cannot drift apart. It lives here and not under app/
// because every file there is a route.

export interface Step {
  /** the tag's value half; null = carries no tag for the key */
  value: string | null;
  /** customers on the step today */
  current: number;
  /** customers on the step when the period ended — equals `current` for the current period */
  at_period_end: number;
  /** customers on the step when the period began */
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
  outside: number;
  outside_at_period_end: number;
}

export const k = (v: string | null) => (v === null ? 'none' : v);

// step colours: the web page's slate / blue / green and slate / rose / green
export const SALE_COLOURS = ['#94a3b8', '#3b82f6', '#16a34a'];
export const INTEREST_COLOURS = ['#94a3b8', '#f43f5e', '#16a34a'];

type Translate = ReturnType<typeof useLanguage>['t'];

/** The sale funnel's step names, keyed by k(value). */
export const saleLabels = (t: Translate): Record<string, string> => ({
  none: t('dashboards.tfNoTag'),
  no_sale: t('dashboards.tfNoSale'),
  one_time_sale: t('dashboards.tfOneTime'),
  repeated_sale: t('dashboards.tfRepeated'),
});

/** The interest funnel's step names, keyed by k(value). */
export const interestLabels = (t: Translate): Record<string, string> => ({
  none: t('dashboards.tfUnknown'),
  not_interested: t('dashboards.tfNotInterested'),
  interested: t('dashboards.tfInterested'),
});

/**
 * One funnel as a card, its steps stacked vertically with the arrow between
 * two steps pointing down. `showMovement` is the change view — each step as
 * the period left it, its net change, who entered and left, the counts on the
 * arrows and the list of moves; without it, where everyone stands right now
 * and each step's share. `showBefore` adds, under each bar, the count from
 * when the period began (the trip screen's "before the trip").
 */
export function FunnelPanel({
  title,
  testID,
  funnel,
  showMovement,
  movesTitle,
  noMovesText,
  showBefore = false,
  labels,
  colours,
  outsideText,
  style,
}: {
  title: string;
  testID: string;
  funnel: Funnel;
  showMovement: boolean;
  movesTitle: string;
  noMovesText?: string;
  showBefore?: boolean;
  labels: Record<string, string>;
  colours: string[];
  outsideText: (n: number) => string;
  style?: StyleProp<ViewStyle>;
}) {
  const { t } = useLanguage();
  const name = (v: string | null) => labels[k(v)] ?? (v as string);
  // the number a step shows: today's count, or where it stood when the
  // period closed — and the footnote speaks of the same moment
  const shown = (s: Step) => (showMovement ? s.at_period_end : s.current);
  const outside = showMovement ? funnel.outside_at_period_end : funnel.outside;
  const max = Math.max(1, ...funnel.steps.map(shown));
  // the funnel's population today, for the shares (the `outside` customers
  // are not on it, so they are not in anyone's share)
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
  // points the way reading goes, so it flips with the layout
  const toArrow = I18nManager.isRTL ? '←' : '→';

  return (
    <View style={[styles.panel, style]} testID={testID}>
      <ThemedText style={styles.panelTitle}>{title}</ThemedText>

      {funnel.steps.map((s, i) => {
        const count = shown(s);
        const share = placed > 0 ? (100 * s.current) / placed : 0;
        const pct = share > 0 && share < 1 ? '<1' : String(Math.round(share));
        return (
          <React.Fragment key={k(s.value)}>
            <View style={styles.step} testID={`${testID}-step-${k(s.value)}`}>
              <ThemedText style={styles.stepLabel}>{name(s.value)}</ThemedText>
              <View style={styles.stepRow}>
                <ThemedText style={styles.stepCount}>{count}</ThemedText>
                {showMovement ? (
                  <Delta n={s.net_change} />
                ) : (
                  <ThemedText style={styles.share}>{t('dashboards.tfShare', { pct })}</ThemedText>
                )}
              </View>
              {/* the bar is the funnel: each step's width relative to the fullest step */}
              <View style={styles.barTrack}>
                <View style={[styles.barFill, { width: `${Math.round((100 * count) / max)}%`, backgroundColor: colours[i] ?? '#9ca3af' }]} />
              </View>
              {showBefore && (
                <ThemedText style={styles.before} testID={`${testID}-step-${k(s.value)}-before`}>
                  {t('trips.funnelsBefore', { n: s.at_period_start })}
                </ThemedText>
              )}
              {showMovement && (s.entered > 0 || s.left > 0) && (
                <View style={styles.edgeRow}>
                  {s.entered > 0 && <ThemedText style={styles.edgeText}>{t('dashboards.tfEntered', { n: s.entered })}</ThemedText>}
                  {s.left > 0 && <ThemedText style={styles.edgeText}>{t('dashboards.tfLeft', { n: s.left })}</ThemedText>}
                </View>
              )}
            </View>

            {i < funnel.steps.length - 1 && (
              <Connector {...between(s.value, funnel.steps[i + 1].value)} showCounts={showMovement} testID={`${testID}-arrow-${i}`} />
            )}
          </React.Fragment>
        );
      })}

      {showMovement && (
        <View style={styles.moves}>
          <ThemedText style={styles.movesTitle}>{movesTitle}</ThemedText>
          {funnel.transitions.length === 0 ? (
            <ThemedText style={styles.stateText}>{noMovesText ?? t('dashboards.tfNoMoves')}</ThemedText>
          ) : (
            funnel.transitions.map((m) => (
              <View key={`${k(m.from)}>${k(m.to)}`} style={styles.moveRow}>
                <ThemedText style={styles.moveText} numberOfLines={2}>
                  {name(m.from)} {toArrow} {name(m.to)}
                </ThemedText>
                <ThemedText style={styles.moveCount}>{m.count}</ThemedText>
              </View>
            ))
          )}
        </View>
      )}

      {outside > 0 && (
        <ThemedText style={styles.caveat} testID={`${testID}-outside`}>
          {outsideText(outside)}
        </ThemedText>
      )}
    </View>
  );
}

/** The net-change badge: an arrow that points the way the step moved. */
export function Delta({ n }: { n: number }) {
  const tone = n > 0 ? styles.deltaUp : n < 0 ? styles.deltaDown : styles.deltaFlat;
  const glyph = n > 0 ? '↗' : n < 0 ? '↘' : '—';
  const text = n > 0 ? `+${n}` : String(n);
  return (
    <View style={[styles.delta, tone]}>
      <ThemedText style={[styles.deltaText, tone]}>
        {glyph} {text}
      </ThemedText>
    </View>
  );
}

/** The arrow between two steps — labelled with who moved along it in the
 * change view; just the shape of the funnel in the current view. */
export function Connector({ forward, back, showCounts, testID }: { forward: number; back: number; showCounts: boolean; testID: string }) {
  const { t } = useLanguage();
  return (
    <View style={styles.connector} testID={testID}>
      <ThemedText style={styles.connectorArrow}>↓</ThemedText>
      {showCounts && <ThemedText style={styles.connectorCount}>{forward}</ThemedText>}
      {showCounts && back > 0 && (
        <ThemedText style={styles.connectorBack} accessibilityLabel={t('dashboards.tfBack', { n: back })}>
          ↶ {back}
        </ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 16 },
  panelTitle: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 12 },
  step: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, padding: 12 },
  stepLabel: { fontSize: 11, fontWeight: '600', color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.6 },
  stepRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginTop: 2 },
  stepCount: { fontSize: 26, fontWeight: '700', color: '#111827', fontVariant: ['tabular-nums'] },
  share: { fontSize: 12, fontWeight: '600', color: '#6B7280', fontVariant: ['tabular-nums'] },
  barTrack: { height: 6, borderRadius: 3, backgroundColor: '#F3F4F6', marginTop: 8, overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3 },
  before: { fontSize: 11, lineHeight: 16, color: '#9ca3af', marginTop: 6, fontVariant: ['tabular-nums'] },
  edgeRow: { flexDirection: 'row', gap: 12, marginTop: 8 },
  edgeText: { fontSize: 11, color: '#6B7280', fontVariant: ['tabular-nums'] },
  delta: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  deltaText: { fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },
  deltaUp: { backgroundColor: '#f0fdf4', color: '#15803d' },
  deltaDown: { backgroundColor: '#fef2f2', color: '#b91c1c' },
  deltaFlat: { backgroundColor: '#F3F4F6', color: '#6B7280' },
  connector: { alignItems: 'center', paddingVertical: 6, gap: 2 },
  connectorArrow: { fontSize: 18, lineHeight: 20, color: '#9ca3af' },
  connectorCount: { fontSize: 12, fontWeight: '700', color: '#111827', fontVariant: ['tabular-nums'] },
  connectorBack: { fontSize: 11, color: '#B45309', fontVariant: ['tabular-nums'] },
  moves: { marginTop: 14 },
  movesTitle: { fontSize: 10, fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 },
  moveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E7EB',
  },
  moveText: { flex: 1, fontSize: 12, color: '#374151' },
  moveCount: { fontSize: 12, fontWeight: '700', color: '#111827', fontVariant: ['tabular-nums'] },
  caveat: { fontSize: 12, color: '#B45309', lineHeight: 17, marginTop: 10 },
  stateText: { fontSize: 13, color: '#6B7280', textAlign: 'center' },
});
