import React, { useMemo, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { BottomSheetModal } from '@/components/BottomSheetModal';
import { useLanguage } from '@/contexts/LanguageContext';
import { plainDate, todayPlain } from '@/utils/date';

interface DateFieldProps {
  /** a date-only YYYY-MM-DD, or '' for none */
  value: string;
  onChange: (value: string) => void;
  title: string;
  testID?: string;
}

const pad = (n: number) => String(n).padStart(2, '0');
const toPlain = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

/** Monday-first rows of day numbers for one month, 0 for the blanks around it. */
function monthGrid(year: number, month: number): number[][] {
  const first = (new Date(year, month, 1).getDay() + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  const cells = [...Array(first).fill(0), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(0);
  return Array.from({ length: cells.length / 7 }, (_, r) => cells.slice(r * 7, r * 7 + 7));
}

/**
 * A date-only field picked from a month calendar.
 *
 * Plain JS on the shared bottom sheet, so it needs no native module and works in the
 * installed builds. It reads and writes YYYY-MM-DD strings and never goes through a
 * Date in UTC, so the day picked is the day stored, in every timezone.
 */
export function DateField({ value, onChange, title, testID }: DateFieldProps) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const initial = (value || todayPlain()).split('-').map(Number);
  const [view, setView] = useState({ year: initial[0], month: initial[1] - 1 });
  const grid = useMemo(() => monthGrid(view.year, view.month), [view]);
  const today = todayPlain();

  const shift = (delta: number) =>
    setView(({ year, month }) => {
      const m = month + delta;
      return { year: year + Math.floor(m / 12), month: ((m % 12) + 12) % 12 };
    });

  const openAt = () => {
    const [y, m] = (value || today).split('-').map(Number);
    setView({ year: y, month: m - 1 });
    setOpen(true);
  };

  return (
    <View>
      <TouchableOpacity style={styles.trigger} onPress={openAt} testID={testID}>
        <ThemedText style={[styles.triggerText, !value && styles.placeholder]}>
          {value ? plainDate(value) : t('picker.choose')}
        </ThemedText>
        <ThemedText style={styles.icon}>📅</ThemedText>
      </TouchableOpacity>

      <BottomSheetModal visible={open} onClose={() => setOpen(false)} title={title}>
        <View style={styles.monthRow}>
          <TouchableOpacity onPress={() => shift(-1)} hitSlop={12} testID={testID ? `${testID}-prev` : undefined}>
            <ThemedText style={styles.nav}>‹</ThemedText>
          </TouchableOpacity>
          <ThemedText style={styles.month}>
            {pad(view.month + 1)}/{view.year}
          </ThemedText>
          <TouchableOpacity onPress={() => shift(1)} hitSlop={12} testID={testID ? `${testID}-next` : undefined}>
            <ThemedText style={styles.nav}>›</ThemedText>
          </TouchableOpacity>
        </View>
        <View style={styles.week}>
          {t('date.weekdaysMonFirst').split(',').map((w, i) => (
            <ThemedText key={i} style={[styles.cell, styles.weekday]}>
              {w}
            </ThemedText>
          ))}
        </View>
        {grid.map((row, r) => (
          <View key={r} style={styles.week}>
            {row.map((d, c) => {
              if (!d) return <View key={c} style={styles.cell} />;
              const plain = toPlain(view.year, view.month, d);
              const on = plain === value;
              return (
                <TouchableOpacity
                  key={c}
                  style={[styles.cell, on && styles.cellOn, plain === today && !on && styles.cellToday]}
                  onPress={() => {
                    onChange(plain);
                    setOpen(false);
                  }}
                  testID={testID ? `${testID}-day-${plain}` : undefined}
                >
                  <ThemedText style={[styles.day, on && styles.dayOn]}>{d}</ThemedText>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
        <TouchableOpacity
          style={styles.todayBtn}
          onPress={() => {
            onChange(today);
            setOpen(false);
          }}
        >
          <ThemedText style={styles.todayText}>{t('date.today')}</ThemedText>
        </TouchableOpacity>
      </BottomSheetModal>
    </View>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
  },
  triggerText: { flex: 1, fontSize: 15, color: '#1f2937' },
  placeholder: { color: '#9ca3af' },
  icon: { fontSize: 15 },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, paddingHorizontal: 8 },
  nav: { fontSize: 28, lineHeight: 32, color: '#5469D4', fontWeight: '700', paddingHorizontal: 8 },
  month: { fontSize: 16, fontWeight: '700' },
  week: { flexDirection: 'row' },
  cell: { flex: 1, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 20 },
  cellOn: { backgroundColor: '#5469D4' },
  cellToday: { borderWidth: 1, borderColor: '#5469D4' },
  day: { fontSize: 15, color: '#1f2937' },
  weekday: { aspectRatio: undefined, paddingVertical: 4, textAlign: 'center', fontSize: 12, fontWeight: '600', opacity: 0.5 },
  dayOn: { color: '#fff', fontWeight: '700' },
  todayBtn: { alignSelf: 'center', paddingVertical: 10, paddingHorizontal: 16, marginTop: 4 },
  todayText: { fontSize: 15, fontWeight: '600', color: '#5469D4' },
});
