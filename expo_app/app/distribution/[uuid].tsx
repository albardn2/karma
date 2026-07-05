import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { NativeHeader } from '@/components/layout/NativeHeader';
import { apiCall } from '@/utils/api';
import { TripMap, TripMapStop } from '@/components/TripMap';
import { StopsSheet } from '@/components/StopsSheet';

interface TaskExecution {
  uuid: string;
  task_uuid: string;
  name?: string | null;
  operator?: string | null;
  status: string;
  depends_on?: string[] | null;
  created_at: string;
  result?: Record<string, any> | null;
}

interface WorkflowExecution {
  uuid: string;
  status: string;
  created_at: string;
  start_time?: string | null;
  end_time?: string | null;
  task_executions?: TaskExecution[];
}

interface Field {
  name: string;
  label: string;
  type: string;
  required?: boolean;
  options?: string[] | null;
  placeholder?: string | null;
}

interface TripStop extends TripMapStop {
  taskUuid: string;
  customerUuid: string;
}

const OPERATOR_ORDER: Record<string, number> = {
  start_trip_operator: 0,
  trip_route_operator: 1,
  trip_create_operator: 2,
  trip_operator: 3,
  trip_stop_operator: 4,
  trip_finish_operator: 5,
};
const OPERATOR_LABEL: Record<string, string> = {
  start_trip_operator: 'Setup',
  trip_route_operator: 'Route calculation',
  trip_create_operator: 'Create trip',
  trip_operator: 'Trip',
  trip_finish_operator: 'Finish trip',
};
const STATUS_STYLES: Record<string, { bg: string; fg: string; label: string }> = {
  in_progress: { bg: '#FEF3C7', fg: '#B45309', label: 'In Progress' },
  completed: { bg: '#D1FAE5', fg: '#047857', label: 'Completed' },
  cancelled: { bg: '#FEE2E2', fg: '#B91C1C', label: 'Cancelled' },
  failed: { bg: '#FEE2E2', fg: '#B91C1C', label: 'Failed' },
  not_started: { bg: '#E5E7EB', fg: '#4B5563', label: 'Not Started' },
};

const toDate = (s?: string | null) => {
  if (!s) return null;
  const d = new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(s) ? s : s + 'Z');
  return isNaN(d.getTime()) ? null : d;
};
const fmt = (s?: string | null) => {
  const d = toDate(s);
  return d ? d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
};
const taskLabel = (te: TaskExecution) => {
  if (te.operator === 'trip_stop_operator') {
    const raw = (te.name || '').replace(/^trip_stop_/, '');
    const customer = raw.split(':')[0];
    return customer ? `Stop: ${customer}` : 'Trip stop';
  }
  return OPERATOR_LABEL[te.operator || ''] || te.name || 'Task';
};
const statusDot = (status: string) => {
  if (status === 'completed') return { icon: '✓', color: '#16a34a' };
  if (status === 'in_progress') return { icon: '●', color: '#5469D4' };
  if (status === 'cancelled' || status === 'failed') return { icon: '✕', color: '#dc2626' };
  return { icon: '○', color: '#9ca3af' };
};
const parseLatLng = (s?: string | null): { lat: number | null; lng: number | null } => {
  if (!s) return { lat: null, lng: null };
  const [lat, lng] = s.split(',').map((p) => parseFloat(p.trim()));
  return { lat: isNaN(lat) ? null : lat, lng: isNaN(lng) ? null : lng };
};

export default function ExecutionDetailScreen() {
  const router = useRouter();
  const { uuid } = useLocalSearchParams<{ uuid: string }>();

  const [execution, setExecution] = useState<WorkflowExecution | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // list-mode (pre-trip: setup/route/create/trip) active-task completion
  const [activeFields, setActiveFields] = useState<Field[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // map-mode (trip phase) stops
  const [tripStops, setTripStops] = useState<TripStop[]>([]);
  const [stopsLoading, setStopsLoading] = useState(false);

  useFocusEffect(React.useCallback(() => { setRefreshKey((k) => k + 1); }, []));

  const fetchExecution = async (spinner = true) => {
    if (spinner) setLoading(true);
    const res = await apiCall<WorkflowExecution>(`/workflow-execution/${uuid}`);
    if (res.data) { setExecution(res.data); setError(null); }
    else setError(res.error || 'Failed to load the trip');
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => {
    fetchExecution(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uuid, refreshKey]);

  const orderedTasks = useMemo(() => {
    const tasks = [...(execution?.task_executions || [])];
    tasks.sort((a, b) => {
      const wa = OPERATOR_ORDER[a.operator || ''] ?? 99;
      const wb = OPERATOR_ORDER[b.operator || ''] ?? 99;
      if (wa !== wb) return wa - wb;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
    return tasks;
  }, [execution]);

  const activeTask = useMemo(() => orderedTasks.find((t) => t.status === 'in_progress') || null, [orderedTasks]);

  // trip phase: the trip has been created & is underway → show the map view.
  const tripPhase = useMemo(() => {
    if (!execution || execution.status !== 'in_progress') return false;
    return (execution.task_executions || []).some(
      (t) => t.operator === 'trip_operator' && t.status === 'completed'
    );
  }, [execution]);

  const finishTask = useMemo(
    () => (execution?.task_executions || []).find((t) => t.operator === 'trip_finish_operator') || null,
    [execution]
  );

  // load fields for the current non-stop task (list mode only)
  useEffect(() => {
    (async () => {
      setActiveFields([]);
      if (tripPhase || !activeTask?.task_uuid) return;
      const res = await apiCall<any>(`/task/${activeTask.task_uuid}`);
      setActiveFields(res.data?.task_inputs?.fields || []);
    })();
  }, [activeTask?.uuid, tripPhase]);

  // load all trip stops with coordinates (map mode)
  useEffect(() => {
    (async () => {
      if (!tripPhase || !execution) { setTripStops([]); return; }
      const stopTasks = (execution.task_executions || []).filter((t) => t.operator === 'trip_stop_operator');
      if (stopTasks.length === 0) { setTripStops([]); return; }
      setStopsLoading(true);
      const built = await Promise.all(
        stopTasks.map(async (te) => {
          const res = await apiCall<any>(`/task/${te.task_uuid}`);
          const data = res.data?.task_inputs?.data || {};
          const customer = data.customer || {};
          const { lat, lng } = parseLatLng(customer.coordinates);
          return {
            taskExecutionUuid: te.uuid,
            taskUuid: te.task_uuid,
            tripStopUuid: data.trip_stop_uuid,
            customerUuid: customer.uuid,
            customerName: customer.company_name || customer.full_name || 'Customer',
            status: te.status,
            lat,
            lng,
            index: 0,
          } as TripStop;
        })
      );
      built.sort((a, b) => {
        const ta = stopTasks.find((t) => t.uuid === a.taskExecutionUuid)?.created_at || '';
        const tb = stopTasks.find((t) => t.uuid === b.taskExecutionUuid)?.created_at || '';
        return new Date(ta).getTime() - new Date(tb).getTime();
      });
      built.forEach((s, i) => (s.index = i));
      setTripStops(built);
      setStopsLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [execution, tripPhase]);

  const currentStopUuid = useMemo(
    () => tripStops.find((s) => s.status === 'in_progress')?.tripStopUuid || null,
    [tripStops]
  );

  const progress = useMemo(() => {
    const total = orderedTasks.length;
    const done = orderedTasks.filter((t) => t.status === 'completed').length;
    return { done, total };
  }, [orderedTasks]);

  const goToStop = (s: { taskExecutionUuid: string; tripStopUuid: string }) => {
    const stop = tripStops.find((t) => t.taskExecutionUuid === s.taskExecutionUuid);
    if (!stop) return;
    router.push({
      pathname: '/distribution/stop/[taskExecutionUuid]',
      params: {
        taskExecutionUuid: stop.taskExecutionUuid,
        taskUuid: stop.taskUuid,
        tripStopUuid: stop.tripStopUuid,
        customerUuid: stop.customerUuid,
        customerName: stop.customerName,
      },
    });
  };

  const finishTrip = () => {
    if (!finishTask) return;
    Alert.alert('Finish trip', 'Complete the trip? All stops must be resolved.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Finish',
        style: 'destructive',
        onPress: async () => {
          const res = await apiCall('/task-execution/complete', {
            method: 'POST',
            body: JSON.stringify({ uuid: finishTask.uuid, result: {} }),
          });
          if (res.status !== 200) Alert.alert('Error', res.error || 'Could not finish the trip');
          else fetchExecution(false);
        },
      },
    ]);
  };

  const completeActive = async () => {
    if (!activeTask) return;
    setSubmitting(true);
    try {
      const res = await apiCall('/task-execution/complete', {
        method: 'POST',
        body: JSON.stringify({ uuid: activeTask.uuid, result: {} }),
      });
      if (res.status !== 200) throw new Error(res.error || 'Failed to complete the task');
      await fetchExecution(false);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not complete the task');
    } finally {
      setSubmitting(false);
    }
  };

  const statusBadge = (status: string) => {
    const s = STATUS_STYLES[status] || { bg: '#E5E7EB', fg: '#4B5563', label: status };
    return (
      <View style={[styles.badge, { backgroundColor: s.bg }]}>
        <ThemedText style={[styles.badgeText, { color: s.fg }]}>{s.label}</ThemedText>
      </View>
    );
  };

  // ---------------- render ----------------
  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <Stack.Screen options={{ headerShown: false }} />
        <NativeHeader title="Trip" onBack={() => (router.canGoBack() ? router.back() : router.replace('/distribution'))} />
        <View style={styles.centered}><ActivityIndicator size="large" color="#5469D4" /></View>
      </ThemedView>
    );
  }
  if (error || !execution) {
    return (
      <ThemedView style={styles.container}>
        <Stack.Screen options={{ headerShown: false }} />
        <NativeHeader title="Trip" onBack={() => (router.canGoBack() ? router.back() : router.replace('/distribution'))} />
        <View style={styles.centered}>
          <ThemedText style={styles.errorTitle}>Could not load the trip</ThemedText>
          <ThemedText style={styles.errorText}>{error}</ThemedText>
        </View>
      </ThemedView>
    );
  }

  // MAP VIEW — trip is underway
  if (tripPhase) {
    const finishActive = finishTask?.status === 'in_progress';
    return (
      <ThemedView style={styles.container}>
        <Stack.Screen options={{ headerShown: false }} />
        <NativeHeader title="Trip" onBack={() => (router.canGoBack() ? router.back() : router.replace('/distribution'))} />
        <View style={styles.mapArea}>
          <TripMap stops={tripStops} currentStopUuid={currentStopUuid} onStopPress={goToStop} />
          {stopsLoading && (
            <View style={styles.stopsLoading}><ActivityIndicator color="#5469D4" /></View>
          )}
          <StopsSheet
            stops={tripStops}
            currentStopUuid={currentStopUuid}
            onStopPress={goToStop}
            onAddStop={() => router.push({ pathname: '/distribution/add-stop', params: { executionUuid: execution.uuid } })}
            finishAction={finishActive ? { label: 'Finish Trip', onPress: finishTrip } : null}
          />
        </View>
      </ThemedView>
    );
  }

  // LIST VIEW — pre-trip steps (setup/route/create/trip) and completed/cancelled trips
  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <NativeHeader title="Trip" onBack={() => (router.canGoBack() ? router.back() : router.replace('/distribution'))} />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchExecution(false); }} />}
      >
        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <ThemedText style={styles.summaryTitle}>Trip · {fmt(execution.start_time || execution.created_at)}</ThemedText>
            {statusBadge(execution.status)}
          </View>
          <ThemedText style={styles.summaryMeta}>{progress.done}/{progress.total} tasks done</ThemedText>
        </View>

        {activeTask ? (
          <View style={styles.actionCard}>
            <ThemedText style={styles.actionHeading}>Current step</ThemedText>
            <ThemedText style={styles.actionTaskName}>{taskLabel(activeTask)}</ThemedText>
            {activeFields.length > 0 && (
              <ThemedText style={styles.actionHint}>This step has inputs — complete it in the full app.</ThemedText>
            )}
            <TouchableOpacity
              style={[styles.actionButton, submitting && styles.actionButtonDisabled]}
              onPress={completeActive}
              disabled={submitting}
              testID="button-complete-active"
            >
              {submitting ? <ActivityIndicator color="#fff" /> : <ThemedText style={styles.actionButtonText}>Complete {taskLabel(activeTask)}</ThemedText>}
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.actionCard}>
            <ThemedText style={styles.doneText}>
              {execution.status === 'completed' ? '✓ Trip completed' : 'No step to act on right now.'}
            </ThemedText>
          </View>
        )}

        <ThemedText style={styles.sectionTitle}>Progress</ThemedText>
        <View style={styles.taskList}>
          {orderedTasks.map((t) => {
            const dot = statusDot(t.status);
            const isActive = activeTask?.uuid === t.uuid;
            return (
              <View key={t.uuid} style={[styles.taskRow, isActive && styles.taskRowActive]}>
                <ThemedText style={[styles.taskDot, { color: dot.color }]}>{dot.icon}</ThemedText>
                <ThemedText style={styles.taskName}>{taskLabel(t)}</ThemedText>
                <ThemedText style={[styles.taskStatus, { color: dot.color }]}>{STATUS_STYLES[t.status]?.label || t.status}</ThemedText>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorTitle: { fontSize: 16, fontWeight: '600', marginBottom: 4, textAlign: 'center' },
  errorText: { fontSize: 14, opacity: 0.6, textAlign: 'center' },
  mapArea: { flex: 1 },
  stopsLoading: { position: 'absolute', top: 12, alignSelf: 'center', backgroundColor: '#fff', borderRadius: 20, padding: 8, elevation: 4 },
  content: { padding: 16, paddingBottom: 40 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  badgeText: { fontSize: 12, fontWeight: '600' },
  summaryCard: { borderRadius: 12, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', backgroundColor: 'rgba(255,255,255,0.6)', padding: 14, marginBottom: 16 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  summaryTitle: { fontSize: 15, fontWeight: '600', flexShrink: 1, marginRight: 8 },
  summaryMeta: { fontSize: 13, opacity: 0.6 },
  actionCard: { borderRadius: 12, borderWidth: 1, borderColor: 'rgba(84,105,212,0.25)', backgroundColor: 'rgba(84,105,212,0.06)', padding: 16, marginBottom: 20 },
  actionHeading: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', opacity: 0.6, letterSpacing: 0.5 },
  actionTaskName: { fontSize: 18, fontWeight: '700', marginTop: 4, marginBottom: 12 },
  actionHint: { fontSize: 13, opacity: 0.6, marginBottom: 12 },
  doneText: { fontSize: 15, fontWeight: '600', textAlign: 'center', paddingVertical: 8 },
  actionButton: { marginTop: 4, backgroundColor: '#5469D4', borderRadius: 12, paddingVertical: 15, alignItems: 'center' },
  actionButtonDisabled: { opacity: 0.6 },
  actionButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  sectionTitle: { fontSize: 13, fontWeight: '600', opacity: 0.6, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  taskList: { borderRadius: 12, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', backgroundColor: 'rgba(255,255,255,0.4)', overflow: 'hidden' },
  taskRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(0,0,0,0.08)' },
  taskRowActive: { backgroundColor: 'rgba(84,105,212,0.08)' },
  taskDot: { width: 20, fontSize: 15, fontWeight: '700' },
  taskName: { flex: 1, fontSize: 14 },
  taskStatus: { fontSize: 12, fontWeight: '600' },
});
