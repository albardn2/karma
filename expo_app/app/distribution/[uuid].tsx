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
import * as Location from 'expo-location';
import { apiCall } from '@/utils/api';
import { useLanguage } from '@/contexts/LanguageContext';
import { TripMap, TripMapArea, TripMapStop } from '@/components/TripMap';
import { TripTrackingMap } from '@/components/TripTrackingMap';
import { useAuth } from '@/contexts/AuthContext';
import { StopsSheet } from '@/components/StopsSheet';
import { parseWktPolygons } from '@/utils/wkt';
import { formatMonthDayTime } from '@/utils/date';

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
  /** the run's own name; falls back to 'Trip · date' when unset */
  trip_name?: string | null;
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
// values are translation keys; wrap with t(...) at render time
const OPERATOR_LABEL: Record<string, string> = {
  start_trip_operator: 'trip.setup',
  trip_route_operator: 'trip.routeCalculation',
  trip_create_operator: 'trip.createTrip',
  trip_operator: 'trip.trip',
  trip_finish_operator: 'trip.finishTrip',
};
// label holds a translation key; wrap with t(...) at render time
const STATUS_STYLES: Record<string, { bg: string; fg: string; label: string }> = {
  in_progress: { bg: '#FEF3C7', fg: '#B45309', label: 'trip.statusInProgress' },
  completed: { bg: '#D1FAE5', fg: '#047857', label: 'trip.statusCompleted' },
  cancelled: { bg: '#FEE2E2', fg: '#B91C1C', label: 'trip.statusCancelled' },
  failed: { bg: '#FEE2E2', fg: '#B91C1C', label: 'trip.statusFailed' },
  not_started: { bg: '#E5E7EB', fg: '#4B5563', label: 'trip.statusNotStarted' },
};

const toDate = (s?: string | null) => {
  if (!s) return null;
  const d = new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(s) ? s : s + 'Z');
  return isNaN(d.getTime()) ? null : d;
};
const fmt = (s?: string | null) => {
  const d = toDate(s);
  return d ? formatMonthDayTime(d) : '—';
};
const taskLabel = (te: TaskExecution, t: (key: string, vars?: Record<string, string | number>) => string) => {
  if (te.operator === 'trip_stop_operator') {
    const raw = (te.name || '').replace(/^trip_stop_/, '');
    const customer = raw.split(':')[0];
    return customer ? t('trip.stopWithCustomer', { customer }) : t('trip.tripStop');
  }
  const key = OPERATOR_LABEL[te.operator || ''];
  return key ? t(key) : te.name || t('trip.task');
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

/** apiCall hands back the raw response body, so a 400 would otherwise be shown
 *  as literal JSON. Pull the message out when it is the API's {"error": "..."}
 *  shape, and fall back to a plain sentence for anything else. */
function errorMessage(raw: string | undefined | null, fallback: string): string {
  const text = (raw || '').trim();
  if (!text) return fallback;
  try {
    const parsed = JSON.parse(text);
    const message = parsed?.error || parsed?.msg;
    if (typeof message === 'string' && message.trim()) return message;
  } catch {
    // not JSON — a bare string body is fine to show as-is
    if (!text.startsWith('{') && !text.startsWith('[')) return text;
  }
  return fallback;
}

// Topologically order task executions by their depends_on chain (names → uuids),
// ties broken by created_at. Returns a { taskExecutionUuid: position } map so
// trip stops render in true visit order (done → current → upcoming), including
// ad-hoc stops spliced into the chain.
const chainRank = (tasks: TaskExecution[]): Record<string, number> => {
  const byUuid = new Map(tasks.map((t) => [t.uuid, t]));
  const uuidsByName = new Map<string, string[]>();
  tasks.forEach((t) => {
    const n = t.name || t.uuid;
    if (!uuidsByName.has(n)) uuidsByName.set(n, []);
    uuidsByName.get(n)!.push(t.uuid);
  });
  const indeg = new Map(tasks.map((t) => [t.uuid, 0]));
  const deps = new Map(tasks.map((t) => [t.uuid, new Set<string>()]));
  tasks.forEach((t) => {
    (t.depends_on || []).forEach((dn) => {
      (uuidsByName.get(dn) || []).forEach((du) => {
        deps.get(du)!.add(t.uuid);
        indeg.set(t.uuid, (indeg.get(t.uuid) || 0) + 1);
      });
    });
  });
  const createdAt = (u: string) => new Date(byUuid.get(u)?.created_at || 0).getTime();
  const avail = tasks.filter((t) => indeg.get(t.uuid) === 0).map((t) => t.uuid);
  const order: string[] = [];
  while (avail.length) {
    avail.sort((a, b) => createdAt(a) - createdAt(b));
    const c = avail.shift() as string;
    order.push(c);
    deps.get(c)!.forEach((n) => {
      const d = (indeg.get(n) || 0) - 1;
      indeg.set(n, d);
      if (d === 0) avail.push(n);
    });
  }
  tasks.forEach((t) => { if (!order.includes(t.uuid)) order.push(t.uuid); });
  const rank: Record<string, number> = {};
  order.forEach((u, i) => (rank[u] = i));
  return rank;
};

export default function ExecutionDetailScreen() {
  const router = useRouter();
  const { t } = useLanguage();
  const { uuid } = useLocalSearchParams<{ uuid: string }>();

  const { isAdmin } = useAuth();
  const [trackingOn, setTrackingOn] = useState(false);
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
  // shared "Set current" armed selection (map pin tap or list long-press);
  // lifted here so a tap elsewhere on either surface dismisses it.
  const [armedStopUuid, setArmedStopUuid] = useState<string | null>(null);
  const [resorting, setResorting] = useState(false);
  // service areas picked in the trip setup, drawn on the map as boundaries
  const [serviceAreas, setServiceAreas] = useState<TripMapArea[]>([]);

  useFocusEffect(React.useCallback(() => { setRefreshKey((k) => k + 1); }, []));

  const fetchExecution = async (spinner = true) => {
    if (spinner) setLoading(true);
    const res = await apiCall<WorkflowExecution>(`/workflow-execution/${uuid}`);
    if (res.data) { setExecution(res.data); setError(null); }
    else setError(res.error || t('trip.failedToLoadTrip'));
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

  // who the trip is assigned to (username or uuid, from the setup result)
  const assignedValue = useMemo(() => {
    const setup = (execution?.task_executions || []).find((t) => t.operator === 'start_trip_operator');
    const v = setup?.result?.assigned_user_uuid;
    return typeof v === 'string' && v ? v : null;
  }, [execution]);

  // service areas picked in the start_trip setup (names from its result)
  const pickedAreaNames = useMemo(() => {
    const setup = (execution?.task_executions || []).find((t) => t.operator === 'start_trip_operator');
    const names = setup?.result?.service_areas;
    return Array.isArray(names) ? (names as string[]).filter(Boolean) : [];
  }, [execution]);
  const pickedAreaSignature = pickedAreaNames.join('|');

  // load the picked areas' geometries once the map view is active
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!tripPhase || pickedAreaNames.length === 0) { setServiceAreas([]); return; }
      const res = await apiCall<{ items: { uuid: string; name: string; geometry?: string | null }[] }>(
        '/service-area/?per_page=100'
      );
      if (cancelled) return;
      const wanted = new Set(pickedAreaNames);
      const areas = (res.data?.items || [])
        .filter((sa) => wanted.has(sa.name))
        .map((sa) => ({ uuid: sa.uuid, name: sa.name, polygons: parseWktPolygons(sa.geometry || '') }))
        .filter((a) => a.polygons.length > 0);
      setServiceAreas(areas);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripPhase, pickedAreaSignature]);

  // stop tasks + a stable signature so the per-stop fetch only re-runs when the
  // set of stops or their statuses actually change (not on every focus refresh)
  const stopTasks = useMemo(
    () => (execution?.task_executions || []).filter((t) => t.operator === 'trip_stop_operator'),
    [execution]
  );
  // uuid + status + CHAIN: a re-sort can leave every status untouched and only
  // rewire depends_on (you are already next to the current stop, the tail
  // reorders behind it). Without the chain in here the rebuild effect would not
  // re-run and the sheet would keep showing the old order.
  const stopSignature = useMemo(
    () =>
      stopTasks
        .map((t) => `${t.uuid}:${t.status}:${(t.depends_on || []).join('>')}`)
        .join('|'),
    [stopTasks]
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
      if (!tripPhase || stopTasks.length === 0) { setTripStops([]); return; }
      setStopsLoading(true);
      const built = (
        await Promise.all(
          stopTasks.map(async (te) => {
            const res = await apiCall<any>(`/task/${te.task_uuid}`);
            const data = res.data?.task_inputs?.data;
            // drop stops whose task fetch failed rather than emitting undefined ids
            if (!res.data || !data || !data.trip_stop_uuid) return null;
            const customer = data.customer || {};
            const { lat, lng } = parseLatLng(customer.coordinates);
            return {
              taskExecutionUuid: te.uuid,
              taskUuid: te.task_uuid,
              tripStopUuid: data.trip_stop_uuid,
              customerUuid: customer.uuid,
              customerName: customer.company_name || customer.full_name || t('trip.customer'),
              status: te.status,
              lat,
              lng,
              index: 0,
              _createdAt: te.created_at,
            } as TripStop & { _createdAt: string };
          })
        )
      ).filter(Boolean) as (TripStop & { _createdAt: string })[];
      // order by the actual visit sequence (dependency chain), so done stops
      // stay in place at the top, the current stop follows, then upcoming — and
      // an ad-hoc stop lands where it was spliced in (as current), not last.
      const rank = chainRank(execution?.task_executions || []);
      built.sort((a, b) => {
        const ra = rank[a.taskExecutionUuid] ?? 0;
        const rb = rank[b.taskExecutionUuid] ?? 0;
        if (ra !== rb) return ra - rb;
        return new Date(a._createdAt).getTime() - new Date(b._createdAt).getTime();
      });
      built.forEach((s, i) => (s.index = i));
      setTripStops(built);
      setStopsLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopSignature, tripPhase]);

  // The road path the last re-sort planned. It lives on the route step's result,
  // which /resort-stops rewrites, so it is the path through the stops as they
  // are ordered NOW — empty until something has been planned, in which case the
  // map shows pins only.
  const routePath = useMemo(() => {
    const routeTe = (execution?.task_executions || []).find(
      (te) => te.operator === 'trip_route_operator'
    );
    const coords = (routeTe?.result as any)?.route_coordinates;
    return Array.isArray(coords) ? coords : [];
  }, [execution]);

  // A manual trip has NO stops until the driver adds them, and a finished one
  // has none left — in both cases there is nothing to re-sort, so the button
  // hides and the automatic pass after the trip step stays quiet instead of
  // asking for GPS and reporting a failure the driver cannot act on.
  const pendingStopCount = useMemo(
    () => tripStops.filter((s) => s.status === 'not_started' || s.status === 'in_progress').length,
    [tripStops]
  );

  const currentStopUuid = useMemo(
    () => tripStops.find((s) => s.status === 'in_progress')?.tripStopUuid || null,
    [tripStops]
  );

  // drop the armed "Set current" selection once it's no longer an upcoming stop
  useEffect(() => {
    if (!armedStopUuid) return;
    const s = tripStops.find((t) => t.taskExecutionUuid === armedStopUuid);
    if (!s || s.status !== 'not_started' || s.tripStopUuid === currentStopUuid) setArmedStopUuid(null);
  }, [tripStops, armedStopUuid, currentStopUuid]);

  const progress = useMemo(() => {
    const total = orderedTasks.length;
    const done = orderedTasks.filter((t) => t.status === 'completed').length;
    return { done, total };
  }, [orderedTasks]);

  const goToStop = (s: { taskExecutionUuid: string; tripStopUuid: string }) => {
    const stop = tripStops.find((t) => t.taskExecutionUuid === s.taskExecutionUuid);
    if (!stop || !stop.tripStopUuid || !stop.customerUuid) return;
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

  const setCurrentStop = async (s: { taskExecutionUuid: string }) => {
    if (!execution) return;
    setArmedStopUuid(null);
    const res = await apiCall(`/workflow-execution/${execution.uuid}/set-current-stop`, {
      method: 'POST',
      body: JSON.stringify({ task_execution_uuid: s.taskExecutionUuid }),
    });
    if (res.status !== 200) {
      Alert.alert(t('trip.error'), res.error || t('trip.couldNotSetCurrentStop'));
      return;
    }
    await fetchExecution(false);
  };

  // Reorder the remaining stops nearest-first from where the driver is now.
  // The position comes from this device on purpose: the server's location feed
  // is opt-in and arrives on a cadence, so the phone in the van is the only
  // dependable answer to "where are we".
  const resortStops = async (opts?: { silent?: boolean }): Promise<boolean> => {
    if (!execution) return false;
    // nothing pending → nothing to sort; do not prompt for location either
    if (pendingStopCount === 0) return false;
    setResorting(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        if (!opts?.silent) Alert.alert(t('trip.resortTitle'), t('trip.resortNeedsLocation'));
        return false;
      }
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const res = await apiCall(`/workflow-execution/${execution.uuid}/resort-stops`, {
        method: 'POST',
        body: JSON.stringify({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        }),
      });
      if (res.status !== 200) {
        if (!opts?.silent) Alert.alert(t('trip.error'), errorMessage(res.error, t('trip.couldNotResort')));
        return false;
      }
      await fetchExecution(false);
      return true;
    } catch (e: any) {
      if (!opts?.silent) Alert.alert(t('trip.error'), t('trip.couldNotResort'));
      return false;
    } finally {
      setResorting(false);
    }
  };

  const finishTrip = () => {
    if (!finishTask) return;
    Alert.alert(t('trip.finishTrip'), t('trip.finishTripConfirm'), [
      { text: t('trip.cancel'), style: 'cancel' },
      {
        text: t('trip.finish'),
        style: 'destructive',
        onPress: async () => {
          const res = await apiCall('/task-execution/complete', {
            method: 'POST',
            body: JSON.stringify({ uuid: finishTask.uuid, result: {} }),
          });
          if (res.status !== 200) Alert.alert(t('trip.error'), res.error || t('trip.couldNotFinishTrip'));
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
      if (res.status !== 200) throw new Error(res.error || t('trip.failedToCompleteTask'));
      // Completing the TRIP step is the moment the driver actually sets off,
      // so the plan is re-sorted around where they are standing rather than
      // around wherever it was computed at setup. Best-effort: resortStops
      // reports its own failure and the trip continues in its planned order.
      const wasTripStep = activeTask.operator === 'trip_operator';
      await fetchExecution(false);
      if (wasTripStep) await resortStops({ silent: true });
    } catch (e: any) {
      Alert.alert(t('trip.error'), e?.message || t('trip.couldNotCompleteTask'));
    } finally {
      setSubmitting(false);
    }
  };

  const statusBadge = (status: string) => {
    const s = STATUS_STYLES[status];
    return (
      <View style={[styles.badge, { backgroundColor: s?.bg || '#E5E7EB' }]}>
        <ThemedText style={[styles.badgeText, { color: s?.fg || '#4B5563' }]}>{s ? t(s.label) : status}</ThemedText>
      </View>
    );
  };

  // ---------------- render ----------------
  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <Stack.Screen options={{ headerShown: false }} />
        <NativeHeader title={t('trip.trip')} onBack={() => (router.canGoBack() ? router.back() : router.replace('/distribution'))} />
        <View style={styles.centered}><ActivityIndicator size="large" color="#5469D4" /></View>
      </ThemedView>
    );
  }
  if (error || !execution) {
    return (
      <ThemedView style={styles.container}>
        <Stack.Screen options={{ headerShown: false }} />
        <NativeHeader title={t('trip.trip')} onBack={() => (router.canGoBack() ? router.back() : router.replace('/distribution'))} />
        <View style={styles.centered}>
          <ThemedText style={styles.errorTitle}>{t('trip.couldNotLoadTrip')}</ThemedText>
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
        <NativeHeader title={t('trip.trip')} onBack={() => (router.canGoBack() ? router.back() : router.replace('/distribution'))} />
        <View style={styles.mapArea}>
          {trackingOn && isAdmin ? (
            <TripTrackingMap
              executionUuid={execution.uuid}
              assignedValue={assignedValue}
              stops={tripStops}
              onClose={() => setTrackingOn(false)}
            />
          ) : (
          <>
          <TripMap
            stops={tripStops}
            currentStopUuid={currentStopUuid}
            onStopPress={goToStop}
            armedStopUuid={armedStopUuid}
            onArm={setArmedStopUuid}
            onSetCurrent={setCurrentStop}
            areas={serviceAreas}
            routePath={routePath}
          />
          {isAdmin && (
            <TouchableOpacity
              style={styles.trackingBtn}
              onPress={() => setTrackingOn(true)}
              testID="button-open-tracking"
            >
              <ThemedText style={styles.trackingBtnText}>{t('tracking.button')}</ThemedText>
            </TouchableOpacity>
          )}
          {/* Trip cost (fuel, tolls) — top-LEFT because the tracking button
              already owns the top-right corner, and centre is the loader. */}
          <TouchableOpacity
            style={styles.expenseBtn}
            onPress={() => router.push({ pathname: '/distribution/expense', params: { executionUuid: execution.uuid } })}
            testID="button-trip-expense"
          >
            <ThemedText style={styles.expenseBtnText}>{t('tripExpense.button')}</ThemedText>
          </TouchableOpacity>
          {stopsLoading && (
            <View style={styles.stopsLoading}><ActivityIndicator color="#5469D4" /></View>
          )}
          <StopsSheet
            stops={tripStops}
            currentStopUuid={currentStopUuid}
            onStopPress={goToStop}
            onAddStop={() => router.push({ pathname: '/distribution/add-stop', params: { executionUuid: execution.uuid } })}
            onAddExpense={() => router.push({ pathname: '/distribution/expense', params: { executionUuid: execution.uuid } })}
            onSetCurrent={setCurrentStop}
            onResort={pendingStopCount > 0 ? resortStops : undefined}
            resorting={resorting}
            armedStopUuid={armedStopUuid}
            onArm={setArmedStopUuid}
            finishAction={finishActive ? { label: t('trip.finishTripButton'), onPress: finishTrip } : null}
          />
          </>
          )}
        </View>
      </ThemedView>
    );
  }

  // LIST VIEW — pre-trip steps (setup/route/create/trip) and completed/cancelled trips
  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <NativeHeader title={t('trip.trip')} onBack={() => (router.canGoBack() ? router.back() : router.replace('/distribution'))} />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchExecution(false); }} />}
      >
        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <ThemedText style={styles.summaryTitle}>{execution.trip_name
              ? execution.trip_name
              : t('trip.summaryTitle', { date: fmt(execution.start_time || execution.created_at) })}</ThemedText>
            {statusBadge(execution.status)}
          </View>
          <ThemedText style={styles.summaryMeta}>{t('trip.tasksDone', { done: progress.done, total: progress.total })}</ThemedText>
        </View>

        {activeTask ? (
          <View style={styles.actionCard}>
            <ThemedText style={styles.actionHeading}>{t('trip.currentStep')}</ThemedText>
            <ThemedText style={styles.actionTaskName}>{taskLabel(activeTask, t)}</ThemedText>
            {activeFields.length > 0 && (
              <ThemedText style={styles.actionHint}>{t('trip.stepHasInputs')}</ThemedText>
            )}
            <TouchableOpacity
              style={[styles.actionButton, (submitting || activeFields.length > 0) && styles.actionButtonDisabled]}
              onPress={completeActive}
              disabled={submitting || activeFields.length > 0}
              testID="button-complete-active"
            >
              {submitting ? <ActivityIndicator color="#fff" /> : (
                <ThemedText style={styles.actionButtonText}>
                  {/* the 4th step is not "completing a task", it is setting off:
                      it flips the trip from planned to under way (and starts
                      per-trip location tracking), so it says so */}
                  {activeTask.operator === 'trip_operator'
                    ? t('trip.startTripButton')
                    : t('trip.completeTask', { task: taskLabel(activeTask, t) })}
                </ThemedText>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.actionCard}>
            <ThemedText style={styles.doneText}>
              {execution.status === 'completed' ? t('trip.tripCompleted') : t('trip.noStepToActOn')}
            </ThemedText>
          </View>
        )}

        <ThemedText style={styles.sectionTitle}>{t('trip.progress')}</ThemedText>
        <View style={styles.taskList}>
          {orderedTasks.map((task) => {
            const dot = statusDot(task.status);
            const isActive = activeTask?.uuid === task.uuid;
            return (
              <View key={task.uuid} style={[styles.taskRow, isActive && styles.taskRowActive]}>
                <ThemedText style={[styles.taskDot, { color: dot.color }]}>{dot.icon}</ThemedText>
                <ThemedText style={styles.taskName}>{taskLabel(task, t)}</ThemedText>
                <ThemedText style={[styles.taskStatus, { color: dot.color }]}>{STATUS_STYLES[task.status] ? t(STATUS_STYLES[task.status].label) : task.status}</ThemedText>
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
  expenseBtn: {
    position: 'absolute', top: 12, left: 12, backgroundColor: '#fff', borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)',
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 6,
  },
  expenseBtnText: { color: '#111827', fontSize: 13, fontWeight: '700' },
  trackingBtn: {
    position: 'absolute', top: 12, right: 12, backgroundColor: '#111827', borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 8,
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 6,
  },
  trackingBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
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
