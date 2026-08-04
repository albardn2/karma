import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { useLanguage } from '@/contexts/LanguageContext';

export type CostCcy = 'USD' | 'SYP';

/**
 * Which currency costs are reported in.
 *
 * This is a REPORTING currency, not a filter: the server converts each lot's cost at
 * the rate nearest its own events, so switching does not change which rows appear —
 * only what the money says. Nothing is summed across currencies; one figure is shown
 * because every figure on screen has been converted into the same one.
 *
 * USD and SYP only. Passing anything else is rejected two different ways depending on
 * the route — 422 on the list, 400 on a detail — so the set is closed here rather than
 * left to a server error the user cannot act on.
 */
export function CostCurrencyToggle({
  value,
  onChange,
  label,
  testIDPrefix,
}: {
  value: CostCcy;
  onChange: (c: CostCcy) => void;
  label?: string;
  testIDPrefix: string;
}) {
  const { t, tef } = useLanguage();
  return (
    <View style={styles.row}>
      <ThemedText style={styles.label}>{label ?? t('inventory.costIn')}</ThemedText>
      {(['USD', 'SYP'] as const).map((c) => (
        <TouchableOpacity
          key={c}
          style={[styles.chip, value === c && styles.chipOn]}
          onPress={() => onChange(c)}
          testID={`${testIDPrefix}-ccy-${c}`}
        >
          <ThemedText style={[styles.text, value === c && styles.textOn]}>{tef(c)}</ThemedText>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { fontSize: 12, opacity: 0.6, marginRight: 2 },
  // the app's one filter-chip design, as used by trips and FilterChips
  chip: {
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  chipOn: { backgroundColor: '#5469D4', borderColor: '#5469D4' },
  text: { fontSize: 12, fontWeight: '600', color: '#4B5563' },
  textOn: { color: '#fff' },
});
