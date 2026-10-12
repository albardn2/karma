import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  I18nManager,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { ModuleGuard } from '@/components/ModuleGuard';
import { FilterChip, ScrollingChipRow } from '@/components/FilterChips';
import {
  FunnelPanel,
  INTEREST_COLOURS,
  SALE_COLOURS,
  interestLabels,
  saleLabels,
  type Funnel,
} from '@/components/TagFunnel';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiCall, isOk } from '@/utils/api';

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
  history_from: string | null;
  total_customers: number;
  total_at_period_end: number;
  new_customers: number;
  funnels: { sale: Funnel; interest: Funnel };
}

type Gran = 'week' | 'month' | 'quarter' | 'year';
// "change": the steps as they stood at the end of a calendar period, the
// period's net change and who moved — the default. "current": where everyone
// stands right now, nothing about movement. Same two views as the web page.
type Mode = 'current' | 'change';

// how far back ‹ may step, per granularity — mirrors MAX_OFFSET on the server
const MAX_OFFSET: Record<Gran, number> = { week: 104, month: 36, quarter: 12, year: 5 };

const pad2 = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;

/**
 * The period the navigator points at, worked out the way the server does
 * (UTC calendar, Monday weeks) so its name can follow the ‹ › taps at once
 * instead of lagging behind the last fetch.
 */
function expectedPeriod(gran: Gran, offset: number): Period {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  let start: Date;
  let end: Date;
  if (gran === 'year') {
    start = new Date(Date.UTC(y - offset, 0, 1));
    end = new Date(Date.UTC(y - offset + 1, 0, 1));
  } else if (gran === 'quarter') {
    const q0 = Math.floor(m / 3) * 3 - 3 * offset;
    start = new Date(Date.UTC(y, q0, 1));
    end = new Date(Date.UTC(y, q0 + 3, 1));
  } else if (gran === 'month') {
    start = new Date(Date.UTC(y, m - offset, 1));
    end = new Date(Date.UTC(y, m - offset + 1, 1));
  } else {
    const monday = new Date(Date.UTC(y, m, now.getUTCDate() - ((now.getUTCDay() + 6) % 7) - 7 * offset));
    start = monday;
    // from the Monday itself — it may sit in an earlier month than today
    end = new Date(monday.getTime() + 7 * 86400000);
  }
  return { granularity: gran, offset, label: '', start: ymd(start), end: ymd(end), is_current: offset === 0 };
}

/** YYYY-MM-DD -> [year, month(1-12), day] without any time-zone parsing. */
const parts = (s: string) => s.split('-').map(Number) as [number, number, number];

/**
 * The sale and interest funnels — where every live customer stands, and how a
 * calendar week, month, quarter or year moved them. The app twin of the web
 * TagFunnelsDashboard: the steps stack vertically here, with the arrow between
 * two steps pointing down and carrying the number who moved along it.
 */
export function TagFunnelsScreenImpl({ embedded = false }: { embedded?: boolean }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t, lang } = useLanguage();

  const [mode, setMode] = useState<Mode>('change');
  const [gran, setGranRaw] = useState<Gran>('month');
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);

  // switching granularity re-anchors to the current period — an offset of 3
  // months means nothing in weeks
  const setGran = (g: Gran) => {
    setGranRaw(g);
    setOffset(0);
  };

  // the current view shows nothing period-dependent, so it always reads this
  // month and never waits on whichever period the change view was last on
  const q = mode === 'change' ? { gran, offset } : { gran: 'month' as Gran, offset: 0 };
  // two quick ‹ taps fire two requests; only the latest may land, or an
  // out-of-order reply would leave one period's numbers under another's label
  const requestSeq = useRef(0);
  const load = useCallback(
    async (isRefresh = false) => {
      const mine = ++requestSeq.current;
      if (!isRefresh) setLoading(true);
      setFailed(false);
      const res = await apiCall<Payload>(`/dashboard/tag-funnels?granularity=${q.gran}&offset=${q.offset}`);
      if (mine !== requestSeq.current) return;
      if (isOk(res.status) && res.data) setData(res.data);
      else setFailed(true);
      setLoading(false);
      setRefreshing(false);
    },
    [q.gran, q.offset],
  );

  useEffect(() => {
    load();
  }, [load]);

  // month names come from the translations (no Intl on the native side);
  // English abbreviates to three letters, Arabic has no short forms
  const monthName = (m: number, short = false) => {
    const full = t(`dashboards.tfM${m}`);
    return short && lang !== 'ar' ? full.slice(0, 3) : full;
  };
  // "September 2026", "Q3 2026", "2026", "21 Sep – 27 Sep 2026" — and
  // "(to date)" while the period is still running
  const periodName = (p: Period): string => {
    const [y, m, d] = parts(p.start);
    let name: string;
    if (p.granularity === 'year') name = String(y);
    else if (p.granularity === 'quarter') name = t('dashboards.tfQuarterLabel', { q: Math.floor((m - 1) / 3) + 1, year: y });
    else if (p.granularity === 'month') name = `${monthName(m)} ${y}`;
    else {
      // the period's last day is the day before its exclusive end
      const last = new Date(Date.UTC(...parts(p.end).map((v, i) => (i === 1 ? v - 1 : v)) as [number, number, number]));
      last.setUTCDate(last.getUTCDate() - 1);
      name = t('dashboards.tfWeekLabel', {
        from: `${d} ${monthName(m, true)}`,
        to: `${last.getUTCDate()} ${monthName(last.getUTCMonth() + 1, true)} ${last.getUTCFullYear()}`,
      });
    }
    return p.is_current ? t('dashboards.tfPeriodToDate', { period: name }) : name;
  };
  // the server's period once it has answered for THIS selection; until then
  // the one the navigator is pointing at
  const shownPeriod =
    data && data.period.granularity === q.gran && data.period.offset === q.offset ? data.period : expectedPeriod(q.gran, q.offset);
  const periodLabel = periodName(shownPeriod);

  // a period that began before the tag log did cannot show all of its moves
  const historyNote =
    mode === 'change' && data?.history_from && data.period.start < data.history_from.slice(0, 10)
      ? (() => {
          const [y, m, d] = parts(data.history_from.slice(0, 10));
          return t('dashboards.tfHistoryNote', { date: `${d} ${monthName(m)} ${y}` });
        })()
      : null;

  const GRANS: Array<[Gran, string]> = [
    ['week', t('dashboards.gWeek')],
    ['month', t('dashboards.gMonth')],
    ['quarter', t('dashboards.gQuarter')],
    ['year', t('dashboards.gYear')],
  ];
  // the chevrons point the way each button travels in time, so they flip with
  // the layout: in RTL "previous" sits on the right and points right
  const prevGlyph = I18nManager.isRTL ? '›' : '‹';
  const nextGlyph = I18nManager.isRTL ? '‹' : '›';
  // while a new period loads, keep the last one on screen dimmed rather than
  // collapsing both funnels to a spinner (the spinner is for the first load)
  const dimmed = loading && !!data;

  const inner = (
    <>
      <View style={styles.controls}>
        <ScrollingChipRow>
          <FilterChip label={t('dashboards.tfModeCurrent')} active={mode === 'current'} onPress={() => setMode('current')} testID="tf-mode-current" />
          <FilterChip label={t('dashboards.tfModeChange')} active={mode === 'change'} onPress={() => setMode('change')} testID="tf-mode-change" />
        </ScrollingChipRow>

        {/* the period only means something when movement is shown */}
        {mode === 'change' && (
          <>
            <ScrollingChipRow>
              {GRANS.map(([g, label]) => (
                <FilterChip key={g} label={label} active={gran === g} onPress={() => setGran(g)} testID={`tf-gran-${g}`} />
              ))}
            </ScrollingChipRow>

            {/* period navigator: ‹ steps back one period, › returns toward now */}
            <View style={styles.periodRow}>
              <TouchableOpacity
                style={[styles.periodBtn, offset >= MAX_OFFSET[gran] && styles.periodBtnOff]}
                onPress={() => setOffset(Math.min(MAX_OFFSET[gran], offset + 1))}
                disabled={offset >= MAX_OFFSET[gran]}
                hitSlop={8}
                testID="tf-prev"
                accessibilityLabel={t('dashboards.tfPrevPeriod')}
              >
                <ThemedText style={styles.periodBtnText}>{prevGlyph}</ThemedText>
              </TouchableOpacity>
              <ThemedText style={styles.periodLabel} testID="tf-period">
                {periodLabel}
              </ThemedText>
              <TouchableOpacity
                style={[styles.periodBtn, offset === 0 && styles.periodBtnOff]}
                onPress={() => setOffset(Math.max(0, offset - 1))}
                disabled={offset === 0}
                hitSlop={8}
                testID="tf-next"
                accessibilityLabel={t('dashboards.tfNextPeriod')}
              >
                <ThemedText style={styles.periodBtnText}>{nextGlyph}</ThemedText>
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>

      {loading && !data ? (
        <View style={styles.centre}>
          <ActivityIndicator size="large" color="#5469D4" />
        </View>
      ) : failed ? (
        <View style={styles.centre}>
          <ThemedText style={styles.stateText}>{t('moduleList.failed')}</ThemedText>
          <TouchableOpacity style={styles.retry} onPress={() => load()}>
            <ThemedText style={styles.retryText}>{t('moduleList.retry')}</ThemedText>
          </TouchableOpacity>
        </View>
      ) : !data || data.total_customers === 0 ? (
        <View style={styles.centre}>
          <ThemedText style={styles.stateText}>{t('dashboards.noData')}</ThemedText>
        </View>
      ) : (
        <View style={dimmed ? styles.dimmed : undefined} accessibilityState={{ busy: dimmed }}>
          <ThemedText style={styles.summary} testID="tf-summary">
            {mode === 'current'
              ? t('dashboards.tfSummaryCurrent', { total: data.total_customers })
              : t('dashboards.tfSummary', {
                  total: data.total_at_period_end,
                  created: data.new_customers,
                  period: periodLabel,
                })}
          </ThemedText>

          <FunnelPanel
            title={t('dashboards.tfSales')}
            testID="tf-sale"
            funnel={data.funnels.sale}
            showMovement={mode === 'change'}
            movesTitle={t('dashboards.tfMoves', { period: periodLabel })}
            labels={saleLabels(t)}
            colours={SALE_COLOURS}
            outsideText={(n) => t('dashboards.tfOutsideSale', { n })}
          />
          <FunnelPanel
            title={t('dashboards.tfInterest')}
            testID="tf-interest"
            funnel={data.funnels.interest}
            showMovement={mode === 'change'}
            movesTitle={t('dashboards.tfMoves', { period: periodLabel })}
            labels={interestLabels(t)}
            colours={INTEREST_COLOURS}
            outsideText={(n) => t('dashboards.tfOutsideInterest', { n })}
          />

          {historyNote && (
            <ThemedText style={styles.caveat} testID="tf-history-note">
              {historyNote}
            </ThemedText>
          )}
          <ThemedText style={styles.defn}>
            {mode === 'current' ? t('dashboards.tfCurrentHint') : t('dashboards.tfChangeHint', { period: periodLabel })}
          </ThemedText>
        </View>
      )}
    </>
  );

  // Home stacks this panel inside its own scroller: section title in place
  // of the top bar, and no ScrollView / guard of its own
  if (embedded) {
    return (
      <View style={styles.embeddedSection}>
        <ThemedText style={styles.embeddedTitle}>{t('dashboards.tagFunnels')}</ThemedText>
        {inner}
      </View>
    );
  }

  return (
    <ModuleGuard module="dashboard">
      <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12} testID="tf-back">
            <ThemedText style={styles.back}>‹</ThemedText>
          </TouchableOpacity>
          <ThemedText style={styles.topTitle}>{t('dashboards.tagFunnels')}</ThemedText>
          <View style={styles.backSpacer} />
        </View>

        <ScrollView
          contentContainerStyle={[styles.body, { paddingBottom: 40 + insets.bottom }]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load(true);
              }}
            />
          }
        >
          {inner}
        </ScrollView>
      </ThemedView>
    </ModuleGuard>
  );
}

export default function TagFunnelsScreen() {
  return <TagFunnelsScreenImpl />;
}

const styles = StyleSheet.create({
  embeddedSection: { paddingHorizontal: 20 },
  embeddedTitle: { fontSize: 20, fontWeight: '700', color: '#111827', marginBottom: 12, textAlign: 'left' },
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 },
  back: { fontSize: 30, lineHeight: 34, color: '#5469D4', fontWeight: '700' },
  backSpacer: { width: 24 },
  topTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '600' },
  body: { paddingHorizontal: 20, paddingTop: 6 },
  controls: { gap: 6, marginBottom: 14 },
  periodRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14, marginTop: 4 },
  periodBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  periodBtnOff: { opacity: 0.35 },
  periodBtnText: { fontSize: 20, lineHeight: 22, color: '#5469D4', fontWeight: '700' },
  // wraps rather than truncates: an Arabic week label ("5 تشرين الأول – 11
  // تشرين الأول 2026 (حتى اليوم)") has no short month forms to fall back on
  periodLabel: { flexShrink: 1, fontSize: 14, fontWeight: '700', color: '#111827', minWidth: 92, textAlign: 'center', lineHeight: 19 },
  summary: { fontSize: 13, color: '#4B5563', lineHeight: 18, marginBottom: 12 },
  dimmed: { opacity: 0.6 },
  defn: { fontSize: 11, color: '#6B7280', lineHeight: 16, marginTop: 4 },
  caveat: { fontSize: 12, color: '#B45309', lineHeight: 17, marginTop: 10 },
  centre: { alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 },
  stateText: { fontSize: 13, color: '#6B7280', textAlign: 'center' },
  retry: { backgroundColor: '#5469D4', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 },
  retryText: { color: '#fff', fontWeight: '600' },
});
