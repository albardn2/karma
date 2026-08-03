import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ThemedText } from '@/components/ThemedText';
import { ModuleListScreen } from '@/components/ModuleListScreen';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiCall, isOk } from '@/utils/api';
import { formatNumericDate } from '@/utils/date';

interface ProcessRow {
  uuid: string;
  type?: string | null;
  notes?: string | null;
  created_at: string;
  workflow_execution_uuid?: string | null;
  data?: {
    inputs?: unknown[];
    outputs?: unknown[];
  } | null;
}

/**
 * Production runs — what was consumed and what came out.
 *
 * Read-only, deliberately. A process MOVES REAL STOCK: it draws its inputs from FIFO
 * lots and creates output inventory, so creating one from a phone would be a stock
 * movement typed one-handed in a van. The create form is also a poor fit on its own
 * terms — two variable-length material grids, no on-hand figures to check against, and
 * insufficient stock only surfaces as a 404 after the whole form is filled.
 *
 * There is no text search. ProcessListParams permits uuid, type, start_date, end_date,
 * created_by_uuid, page and per_page and nothing else, so `searchParam` is omitted
 * rather than pointed at a param that would 422 every request. Filtering is by `type`,
 * whose values come from the closed enum at GET /process/types.
 *
 * Rows show input and output COUNTS, not names: a list row carries only material uuids,
 * and resolving a dozen of them per row to render a card is not worth the requests. The
 * detail screen does the join.
 */
export default function ProcessesScreen() {
  const router = useRouter();
  const { t, tef } = useLanguage();
  const [types, setTypes] = useState<string[]>([]);

  useEffect(() => {
    // the closed enum, straight from the server rather than duplicated here
    apiCall<string[]>('/process/types').then((res) => {
      if (isOk(res.status) && Array.isArray(res.data)) setTypes(res.data);
    });
  }, []);

  const filters = useMemo(
    () => types.map((ty) => ({ id: ty, label: tef(ty), params: { type: ty } })),
    [types, tef],
  );

  const count = (a?: unknown[] | null) => (Array.isArray(a) ? a.length : 0);

  return (
    <ModuleListScreen<ProcessRow>
      module="processes"
      title={t('menu.processes')}
      endpoint="/process/"
      itemsKey="items"
      filters={filters}
      keyExtractor={(p) => p.uuid}
      renderItem={(p) => (
        <TouchableOpacity
          style={styles.row}
          onPress={() => router.push(`/processes/${p.uuid}`)}
          testID={`process-${p.uuid}`}
        >
          <View style={styles.rowLeft}>
            <ThemedText style={styles.type} numberOfLines={1}>
              {p.type ? tef(p.type) : '—'}
            </ThemedText>
            <ThemedText style={styles.meta}>
              {t('processes.inOut', {
                inputs: count(p.data?.inputs),
                outputs: count(p.data?.outputs),
              })}
              {p.workflow_execution_uuid ? ` · ${t('processes.fromWorkflow')}` : ''}
            </ThemedText>
            {!!p.notes && (
              <ThemedText style={styles.notes} numberOfLines={1}>
                {p.notes}
              </ThemedText>
            )}
          </View>
          <ThemedText style={styles.when}>
            {p.created_at ? formatNumericDate(new Date(p.created_at)) : ''}
          </ThemedText>
        </TouchableOpacity>
      )}
    />
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  rowLeft: { flex: 1 },
  type: { fontSize: 15, fontWeight: '600', color: '#1f2937' },
  meta: { fontSize: 12, opacity: 0.6, marginTop: 2 },
  notes: { fontSize: 11, opacity: 0.5, marginTop: 2 },
  when: { fontSize: 11, opacity: 0.5 },
});
