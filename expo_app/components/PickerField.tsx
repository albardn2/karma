import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiCall, isOk } from '@/utils/api';

export interface PickerSpec {
  /** list endpoint, path only, e.g. "/material/" */
  endpoint: string;
  /** envelope key holding the rows — differs per module and must be exact */
  itemsKey: string;
  /**
   * query param to search on, if the DTO has one. Omit when it does not: the list
   * DTOs are extra="forbid", so an invented param 422s the entire request rather
   * than being ignored, and the field would simply never load.
   */
  searchParam?: string;
  /** extra fixed params, e.g. narrowing materials to a type */
  params?: Record<string, string>;
  label: (item: any) => string;
  value: (item: any) => string;
  sublabel?: (item: any) => string | undefined;
}

interface PickerFieldProps {
  spec: PickerSpec;
  value: string;
  onChange: (value: string, label: string) => void;
  /**
   * Label for a value that arrived already chosen — an edit form seeded from a record
   * holds the uuid but not the name, and without this the field reads as a raw uuid
   * until the user opens it.
   */
  initialLabel?: string;
  testID?: string;
}

/** The list DTOs cap per_page at 100; 20 is plenty for a phone-sized picker. */
const PAGE = 20;

/**
 * Choose one record from a list endpoint.
 *
 * ModuleForm's `select` renders every option as a chip, which is right for an enum of
 * nine and wrong for a materials table — a tenant with three hundred materials would
 * get an unusable wall. This fetches instead, searches server-side where the DTO
 * allows it, and falls back to filtering the first page locally where it does not.
 *
 * It keeps the chosen row's LABEL as well as its uuid, so the field can show "Sugar"
 * rather than the uuid the body carries.
 */
export function PickerField({ spec, value, onChange, initialLabel, testID }: PickerFieldProps) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [chosen, setChosen] = useState<string>('');

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    const qs = new URLSearchParams({ per_page: String(PAGE), ...(spec.params ?? {}) });
    if (spec.searchParam && query.trim()) qs.set(spec.searchParam, query.trim());
    const res = await apiCall<Record<string, any>>(`${spec.endpoint}?${qs.toString()}`);
    if (isOk(res.status)) setRows((res.data?.[spec.itemsKey] as any[]) ?? []);
    else {
      setRows([]);
      setFailed(true);
    }
    setLoading(false);
  }, [spec.endpoint, spec.itemsKey, spec.searchParam, JSON.stringify(spec.params), query]);

  useEffect(() => {
    if (!open) return;
    const id = setTimeout(load, query ? 300 : 0);
    return () => clearTimeout(id);
  }, [open, load, query]);

  // with no server-side search param, filter what we have rather than lie about it
  const shown =
    spec.searchParam || !query.trim()
      ? rows
      : rows.filter((r) => spec.label(r).toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <View>
      <TouchableOpacity
        style={styles.trigger}
        onPress={() => setOpen((o) => !o)}
        testID={testID}
      >
        <ThemedText style={[styles.triggerText, !value && styles.placeholder]} numberOfLines={1}>
          {value ? chosen || initialLabel || value : t('picker.choose')}
        </ThemedText>
        <ThemedText style={styles.chevron}>{open ? '⌃' : '⌄'}</ThemedText>
      </TouchableOpacity>

      {open && (
        <View style={styles.panel}>
          <TextInput
            style={styles.search}
            value={query}
            onChangeText={setQuery}
            placeholder={t('moduleList.search')}
            placeholderTextColor="#9ca3af"
            autoCorrect={false}
            testID={testID ? `${testID}-search` : undefined}
          />
          {loading ? (
            <ActivityIndicator style={styles.spinner} color="#5469D4" />
          ) : failed ? (
            <ThemedText style={styles.note}>{t('moduleList.failed')}</ThemedText>
          ) : !shown.length ? (
            <ThemedText style={styles.note}>{t('moduleList.noMatches')}</ThemedText>
          ) : (
            shown.map((r) => {
              const v = spec.value(r);
              const sub = spec.sublabel?.(r);
              return (
                <TouchableOpacity
                  key={v}
                  style={[styles.row, v === value && styles.rowOn]}
                  onPress={() => {
                    setChosen(spec.label(r));
                    onChange(v, spec.label(r));
                    setOpen(false);
                    setQuery('');
                  }}
                  testID={testID ? `${testID}-opt-${v}` : undefined}
                >
                  <ThemedText style={styles.rowLabel} numberOfLines={1}>
                    {spec.label(r)}
                  </ThemedText>
                  {!!sub && <ThemedText style={styles.rowSub}>{sub}</ThemedText>}
                </TouchableOpacity>
              );
            })
          )}
        </View>
      )}
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
  chevron: { fontSize: 14, color: '#6b7280', marginLeft: 8 },
  panel: {
    marginTop: 6,
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    paddingVertical: 6,
    maxHeight: 260,
  },
  search: {
    marginHorizontal: 8,
    marginBottom: 4,
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: '#1f2937',
  },
  spinner: { paddingVertical: 14 },
  note: { fontSize: 13, opacity: 0.6, textAlign: 'center', paddingVertical: 14 },
  row: { paddingHorizontal: 14, paddingVertical: 10 },
  rowOn: { backgroundColor: '#eef2ff' },
  rowLabel: { fontSize: 14, fontWeight: '600', color: '#1f2937' },
  rowSub: { fontSize: 11, opacity: 0.55, marginTop: 1 },
});
