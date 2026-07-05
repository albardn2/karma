import React, { useMemo, useRef } from 'react';
import {
  Animated,
  Dimensions,
  PanResponder,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export interface SheetStop {
  taskExecutionUuid: string;
  tripStopUuid: string;
  customerName: string;
  status: string;
  index: number;
}

const STATUS_LABEL: Record<string, string> = {
  in_progress: 'Current',
  completed: 'Done',
  not_started: 'Upcoming',
  cancelled: 'Cancelled',
  failed: 'Failed',
};
const statusColor = (status: string, isCurrent: boolean) => {
  if (isCurrent) return '#5469D4';
  if (status === 'completed') return '#16a34a';
  if (status === 'cancelled' || status === 'failed') return '#dc2626';
  return '#9ca3af';
};

export function StopsSheet({
  stops,
  currentStopUuid,
  onStopPress,
  onAddStop,
  finishAction,
}: {
  stops: SheetStop[];
  currentStopUuid: string | null;
  onStopPress: (stop: SheetStop) => void;
  onAddStop: () => void;
  finishAction?: { label: string; onPress: () => void } | null;
}) {
  const insets = useSafeAreaInsets();
  const screenH = Dimensions.get('window').height;
  const SHEET_H = Math.min(screenH * 0.62, 560);
  const PEEK = 190; // visible height when collapsed
  const COLLAPSED = SHEET_H - PEEK; // translateY when collapsed
  const translateY = useRef(new Animated.Value(COLLAPSED)).current;
  const lastY = useRef(COLLAPSED);

  const snapTo = (to: number) => {
    Animated.spring(translateY, { toValue: to, useNativeDriver: true, bounciness: 4 }).start();
    lastY.current = to;
  };

  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dy) > 4,
        onPanResponderMove: (_e, g) => {
          const next = Math.min(COLLAPSED, Math.max(0, lastY.current + g.dy));
          translateY.setValue(next);
        },
        onPanResponderRelease: (_e, g) => {
          const current = Math.min(COLLAPSED, Math.max(0, lastY.current + g.dy));
          // snap to whichever end is closer, biased by fling velocity
          const goExpand = g.vy < -0.5 || (g.vy <= 0.5 && current < COLLAPSED / 2);
          snapTo(goExpand ? 0 : COLLAPSED);
        },
      }),
    [COLLAPSED]
  );

  const toggle = () => snapTo(lastY.current > COLLAPSED / 2 ? 0 : COLLAPSED);

  return (
    <Animated.View
      style={[
        styles.sheet,
        { height: SHEET_H, bottom: 0, transform: [{ translateY }], paddingBottom: insets.bottom },
      ]}
    >
      {/* drag handle + header */}
      <View {...pan.panHandlers}>
        <TouchableOpacity activeOpacity={0.9} onPress={toggle} style={styles.handleArea}>
          <View style={styles.handle} />
        </TouchableOpacity>
        <View style={styles.header}>
          <ThemedText style={styles.title}>Stops ({stops.length})</ThemedText>
          <TouchableOpacity style={styles.addBtn} onPress={onAddStop} testID="sheet-add-stop">
            <ThemedText style={styles.addBtnText}>＋ Add Stop</ThemedText>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        {stops.length === 0 ? (
          <ThemedText style={styles.empty}>No stops yet. Tap “Add Stop” to begin.</ThemedText>
        ) : (
          stops.map((s, i) => {
            const isCurrent = s.tripStopUuid === currentStopUuid;
            const color = statusColor(s.status, isCurrent);
            const last = i === stops.length - 1;
            return (
              <TouchableOpacity
                key={s.taskExecutionUuid}
                style={[styles.row, isCurrent && styles.rowCurrent]}
                onPress={() => onStopPress(s)}
                testID={`sheet-stop-${s.tripStopUuid}`}
              >
                {/* progress rail */}
                <View style={styles.rail}>
                  <View style={[styles.dot, { backgroundColor: color }]} />
                  {!last && <View style={styles.line} />}
                </View>
                <View style={styles.rowBody}>
                  <ThemedText style={styles.rowName} numberOfLines={1}>{i + 1}. {s.customerName}</ThemedText>
                  <ThemedText style={[styles.rowStatus, { color }]}>
                    {STATUS_LABEL[s.status] || s.status}
                  </ThemedText>
                </View>
                {isCurrent && <ThemedText style={styles.chevron}>›</ThemedText>}
              </TouchableOpacity>
            );
          })
        )}

        {finishAction && (
          <TouchableOpacity style={styles.finishBtn} onPress={finishAction.onPress} testID="sheet-finish-trip">
            <ThemedText style={styles.finishText}>{finishAction.label}</ThemedText>
          </TouchableOpacity>
        )}
      </ScrollView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -3 },
    elevation: 16,
  },
  handleArea: { alignItems: 'center', paddingTop: 8, paddingBottom: 4 },
  handle: { width: 40, height: 5, borderRadius: 3, backgroundColor: '#d1d5db' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(0,0,0,0.08)',
  },
  title: { fontSize: 17, fontWeight: '700' },
  addBtn: { backgroundColor: '#5469D4', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  list: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24 },
  empty: { textAlign: 'center', opacity: 0.6, paddingVertical: 24 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  rowCurrent: { backgroundColor: 'rgba(84,105,212,0.08)', borderRadius: 10, marginHorizontal: -8, paddingHorizontal: 8 },
  rail: { width: 24, alignItems: 'center', alignSelf: 'stretch' },
  dot: { width: 14, height: 14, borderRadius: 7, marginTop: 14, borderWidth: 2, borderColor: '#fff' },
  line: { flex: 1, width: 2, backgroundColor: 'rgba(0,0,0,0.12)', marginTop: 2 },
  rowBody: { flex: 1, paddingVertical: 12, paddingLeft: 6 },
  rowName: { fontSize: 15, fontWeight: '600' },
  rowStatus: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  chevron: { fontSize: 24, color: '#5469D4', paddingHorizontal: 6 },
  finishBtn: { marginTop: 16, backgroundColor: '#16a34a', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  finishText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
