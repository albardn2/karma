import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ThemedText } from '@/components/ThemedText';
import { ModuleListScreen } from '@/components/ModuleListScreen';
import { BottomNavigation } from '@/components/layout/BottomNavigation';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { useHasEndpoint } from '@/hooks/useModuleAccess';
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
 * A process MOVES REAL STOCK — it draws inputs from FIFO lots and creates output
 * inventory — and this screen used to be read-only for that reason. The reasoning
 * assumed the form needed lot pickers and had no on-hand to check against; that was
 * wrong about the API. The client sends only a material and an amount, the server picks
 * the lots, and on-hand is one request per chosen material. So creating is offered, with
 * the shortfall shown while the amount is typed and the consequences stated before the
 * write. See app/processes/create.tsx.
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
  const { user } = useAuth();
  const canCreate = useHasEndpoint('process', 'create');
  const [types, setTypes] = useState<string[]>([]);

  useEffect(() => {
    // the closed enum, straight from the server rather than duplicated here
    apiCall<string[]>('/process/types').then((res) => {
      if (isOk(res.status) && Array.isArray(res.data)) setTypes(res.data);
    });
  }, []);

  /**
   * Only params ProcessListParams actually declares: type, start_date, end_date,
   * created_by_uuid, uuid, page, per_page. It is extra="forbid", so an invented filter
   * would 422 the whole request rather than being ignored — which is why there is still
   * no text search here.
   *
   * Dates are naive: a Z suffix or an offset is not what this backend parses.
   */
  const filters = useMemo(() => {
    const since = (days: number) => {
      const d = new Date();
      d.setDate(d.getDate() - days);
      return d.toISOString().replace(/\.\d+Z$/, '').replace(/Z$/, '');
    };
    const out: Array<{ id: string; label: string; params: Record<string, string> }> = [
      { id: '__30d', label: t('processes.filter30d'), params: { start_date: since(30) } },
      { id: '__90d', label: t('processes.filter90d'), params: { start_date: since(90) } },
    ];
    if (user?.uuid) {
      out.push({ id: '__mine', label: t('processes.filterMine'), params: { created_by_uuid: user.uuid } });
    }
    return [...out, ...types.map((ty) => ({ id: ty, label: tef(ty), params: { type: ty } }))];
  }, [types, tef, t, user?.uuid]);

  const count = (a?: unknown[] | null) => (Array.isArray(a) ? a.length : 0);

  return (
    <View style={styles.screen}>
      <ModuleListScreen<ProcessRow>
        module="processes"
        title={t('menu.processes')}
        endpoint="/process/"
        itemsKey="items"
        filters={filters}
        onCreate={canCreate ? () => router.push('/processes/create') : undefined}
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
      <BottomNavigation activeTab="menu" onTabPress={() => router.replace('/(tabs)?tab=menu')} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  rowLeft: { flex: 1 },
  type: { fontSize: 15, fontWeight: '600', color: '#1f2937' },
  meta: { fontSize: 12, opacity: 0.6, marginTop: 2 },
  notes: { fontSize: 11, opacity: 0.5, marginTop: 2 },
  when: { fontSize: 11, opacity: 0.5 },
});
