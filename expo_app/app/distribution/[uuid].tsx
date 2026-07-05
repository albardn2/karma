import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { NativeHeader } from '@/components/layout/NativeHeader';
import { apiCall } from '@/utils/api';

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

// linear order of the trip flow; stops are ordered among themselves by created_at
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

export default function ExecutionDetailScreen() {
  const router = useRouter();
  const { uuid } = useLocalSearchParams<{ uuid: string }>();

  const [execution, setExecution] = useState<WorkflowExecution | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [activeFields, setActiveFields] = useState<Field[]>([]);
  const [fieldValues, setFieldValues] = useState<Record<string, any>>({});
  const [submitting, setSubmitting] = useState(false);
  // trip-stop customer context (for the Create Order flow)
  const [stopContext, setStopContext] = useState<{ customerUuid: string; customerName: string; tripStopUuid: string } | null>(null);
  const [balance, setBalance] = useState<Record<string, number> | null>(null);
  const [recentOrders, setRecentOrders] = useState<any[]>([]);
  const [pickerField, setPickerField] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // refresh when returning from create-order / order / add-stop screens
  useFocusEffect(React.useCallback(() => { setRefreshKey((k) => k + 1); }, []));

  const fetchExecution = async (spinner = true) => {
    if (spinner) setLoading(true);
    const res = await apiCall<WorkflowExecution>(`/workflow-execution/${uuid}`);
    if (res.data) {
      setExecution(res.data);
      setError(null);
    } else {
      setError(res.error || 'Failed to load the trip');
    }
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

  // the task the user can act on now
  const activeTask = useMemo(
    () => orderedTasks.find((t) => t.status === 'in_progress') || null,
    [orderedTasks]
  );

  // load the active task's form fields (outcome/notes for stops, none for route/create/trip)
  // and, for a trip stop, its customer context + balance for the order flow
  useEffect(() => {
    (async () => {
      setActiveFields([]);
      setFieldValues({});
      setStopContext(null);
      setBalance(null);
      if (!activeTask?.task_uuid) return;
      const res = await apiCall<any>(`/task/${activeTask.task_uuid}`);
      const fields: Field[] = res.data?.task_inputs?.fields || [];
      setActiveFields(fields);
      const initial: Record<string, any> = {};
      for (const f of fields) initial[f.name] = f.type === 'checklist' ? [] : '';
      setFieldValues(initial);

      if (activeTask.operator === 'trip_stop_operator') {
        const data = res.data?.task_inputs?.data || {};
        const customer = data.customer;
        if (customer?.uuid) {
          setStopContext({
            customerUuid: customer.uuid,
            customerName: customer.company_name || customer.full_name || 'Customer',
            tripStopUuid: data.trip_stop_uuid,
          });
          const cust = await apiCall<any>(`/customer/${customer.uuid}`);
          setBalance(cust.data?.balance_per_currency || {});

          // recent orders: unpaid/unfulfilled first, then most recent; top 5
          const ordersRes = await apiCall<any>(`/customer-order/?customer_uuid=${customer.uuid}&per_page=50`);
          const all: any[] = ordersRes.data?.orders || ordersRes.data?.customer_orders || [];
          const needsAttention = (o: any) => o.is_paid === false || o.is_fulfilled === false;
          const sorted = [...all].sort((a, b) => {
            const ap = needsAttention(a) ? 0 : 1;
            const bp = needsAttention(b) ? 0 : 1;
            if (ap !== bp) return ap - bp;
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
          });
          setRecentOrders(sorted.slice(0, 5));
        }
      }
    })();
  }, [activeTask?.uuid, refreshKey]);

  const progress = useMemo(() => {
    const total = orderedTasks.length;
    const done = orderedTasks.filter((t) => t.status === 'completed').length;
    return { done, total };
  }, [orderedTasks]);

  const setValue = (name: string, v: any) => setFieldValues((p) => ({ ...p, [name]: v }));
  const toggleChecklist = (name: string, opt: string) =>
    setFieldValues((p) => {
      const cur: string[] = p[name] || [];
      return { ...p, [name]: cur.includes(opt) ? cur.filter((o) => o !== opt) : [...cur, opt] };
    });

  const completeActive = async () => {
    if (!activeTask) return;
    // required-field check
    for (const f of activeFields) {
      if (!f.required) continue;
      const v = fieldValues[f.name];
      const empty = f.type === 'checklist' ? !(v || []).length : !v;
      if (empty) {
        Alert.alert('Missing info', `${f.label} is required.`);
        return;
      }
    }
    // result is keyed by field LABEL (operator schemas expect the plain label)
    const result: Record<string, any> = {};
    for (const f of activeFields) {
      const v = fieldValues[f.name];
      if (f.type === 'checklist') result[f.label] = v || [];
      else if (f.type === 'number') result[f.label] = v === '' || v == null ? null : Number(v);
      else result[f.label] = v === '' ? null : v;
    }

    setSubmitting(true);
    try {
      const res = await apiCall('/task-execution/complete', {
        method: 'POST',
        body: JSON.stringify({ uuid: activeTask.uuid, result }),
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

  const renderField = (f: Field) => {
    if (f.type === 'select') {
      const value = fieldValues[f.name];
      return (
        <View key={f.name} style={styles.fieldBlock}>
          <ThemedText style={styles.fieldLabel}>{f.label}{f.required ? ' *' : ''}</ThemedText>
          <TouchableOpacity
            style={styles.dropdown}
            onPress={() => setPickerField(f.name)}
            testID={`select-${f.name}`}
          >
            <ThemedText style={[styles.dropdownText, !value && styles.dropdownPlaceholder]} numberOfLines={1}>
              {value || f.placeholder || 'Select…'}
            </ThemedText>
            <ThemedText style={styles.dropdownCaret}>▾</ThemedText>
          </TouchableOpacity>
        </View>
      );
    }
    if (f.type === 'checklist') {
      const selected: string[] = fieldValues[f.name] || [];
      return (
        <View key={f.name} style={styles.fieldBlock}>
          <ThemedText style={styles.fieldLabel}>{f.label}{f.required ? ' *' : ''}</ThemedText>
          <View style={styles.chipWrap}>
            {(f.options || []).map((opt) => {
              const active = selected.includes(opt);
              return (
                <TouchableOpacity
                  key={opt}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => toggleChecklist(f.name, opt)}
                  testID={`opt-${f.name}-${opt}`}
                >
                  <ThemedText style={[styles.chipText, active && styles.chipTextActive]}>
                    {active ? '✓ ' : ''}{opt}
                  </ThemedText>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      );
    }
    return (
      <View key={f.name} style={styles.fieldBlock}>
        <ThemedText style={styles.fieldLabel}>{f.label}{f.required ? ' *' : ''}</ThemedText>
        <TextInput
          style={styles.input}
          value={String(fieldValues[f.name] ?? '')}
          onChangeText={(t) => setValue(f.name, t)}
          keyboardType={f.type === 'number' ? 'numeric' : 'default'}
          placeholder={f.placeholder || ''}
          placeholderTextColor="#9ca3af"
          testID={`input-${f.name}`}
        />
      </View>
    );
  };

  const actionLabel = activeTask
    ? activeTask.operator === 'trip_finish_operator'
      ? 'Finish Trip'
      : `Complete ${taskLabel(activeTask)}`
    : '';

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <NativeHeader
        title="Trip"
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/distribution'))}
      />

      {loading ? (
        <View style={styles.centered}><ActivityIndicator size="large" color="#5469D4" /></View>
      ) : error ? (
        <View style={styles.centered}>
          <ThemedText style={styles.errorTitle}>Could not load the trip</ThemedText>
          <ThemedText style={styles.errorText}>{error}</ThemedText>
        </View>
      ) : execution ? (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchExecution(false); }} />}
        >
          {/* Summary */}
          <View style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <ThemedText style={styles.summaryTitle}>Trip · {fmt(execution.start_time || execution.created_at)}</ThemedText>
              {statusBadge(execution.status)}
            </View>
            <ThemedText style={styles.summaryMeta}>{progress.done}/{progress.total} tasks done</ThemedText>
          </View>

          {/* Add an ad-hoc stop while the trip is underway */}
          {execution.status === 'in_progress' && (
            <TouchableOpacity
              style={styles.addStopBtn}
              onPress={() => router.push({ pathname: '/distribution/add-stop', params: { executionUuid: execution.uuid } })}
              testID="button-add-stop"
            >
              <ThemedText style={styles.addStopText}>＋ Add Stop</ThemedText>
            </TouchableOpacity>
          )}

          {/* Active task action */}
          {activeTask ? (
            <View style={styles.actionCard}>
              <ThemedText style={styles.actionHeading}>Current step</ThemedText>
              <ThemedText style={styles.actionTaskName}>{taskLabel(activeTask)}</ThemedText>

              {/* trip-stop customer: balance + create order */}
              {stopContext && (
                <View style={styles.stopPanel}>
                  {balance && (
                    <View style={styles.balanceRow}>
                      <ThemedText style={styles.balanceLabel}>Balance</ThemedText>
                      {Object.keys(balance).length === 0 ? (
                        <ThemedText style={styles.balanceNone}>—</ThemedText>
                      ) : (
                        Object.entries(balance).map(([cur, amt]) => (
                          <View
                            key={cur}
                            style={[styles.balanceBadge, Number(amt) > 0 ? styles.balanceOwed : styles.balanceClear]}
                          >
                            <ThemedText style={styles.balanceBadgeText}>{Number(amt).toFixed(2)} {cur}</ThemedText>
                          </View>
                        ))
                      )}
                    </View>
                  )}
                  <TouchableOpacity
                    style={styles.createOrderBtn}
                    onPress={() =>
                      router.push({
                        pathname: '/distribution/create-order',
                        params: {
                          tripStopUuid: stopContext.tripStopUuid,
                          customerUuid: stopContext.customerUuid,
                          customerName: stopContext.customerName,
                        },
                      })
                    }
                    testID="button-create-order"
                  >
                    <ThemedText style={styles.createOrderText}>+ Create Order</ThemedText>
                  </TouchableOpacity>

                  {/* recent orders (tap to pay / fulfill) */}
                  {recentOrders.length > 0 && (
                    <View style={styles.recentBox}>
                      <ThemedText style={styles.recentTitle}>Recent orders</ThemedText>
                      {recentOrders.map((o) => (
                        <TouchableOpacity
                          key={o.uuid}
                          style={styles.recentRow}
                          onPress={() =>
                            router.push({
                              pathname: '/distribution/order',
                              params: { orderUuid: o.uuid, tripStopUuid: stopContext.tripStopUuid },
                            })
                          }
                          testID={`recent-order-${o.uuid}`}
                        >
                          <View style={styles.recentLeft}>
                            <ThemedText style={styles.recentDate}>{fmt(o.created_at)}</ThemedText>
                            <ThemedText style={styles.recentDue}>
                              {(o.net_amount_due ?? o.total_adjusted_amount ?? 0)} {o.currency || ''} due
                            </ThemedText>
                          </View>
                          <View style={styles.recentBadges}>
                            <View style={[styles.miniBadge, o.is_paid ? styles.balanceClear : styles.balanceOwed]}>
                              <ThemedText style={styles.miniBadgeText}>{o.is_paid ? 'Paid' : 'Unpaid'}</ThemedText>
                            </View>
                            <View style={[styles.miniBadge, o.is_fulfilled ? styles.balanceClear : styles.miniGray]}>
                              <ThemedText style={styles.miniBadgeText}>{o.is_fulfilled ? 'Fulfilled' : 'Unfulfilled'}</ThemedText>
                            </View>
                          </View>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
              )}

              {activeFields.map(renderField)}
              <TouchableOpacity
                style={[styles.actionButton, submitting && styles.actionButtonDisabled]}
                onPress={completeActive}
                disabled={submitting}
                testID="button-complete-active"
              >
                {submitting ? <ActivityIndicator color="#fff" /> : <ThemedText style={styles.actionButtonText}>{actionLabel}</ThemedText>}
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.actionCard}>
              <ThemedText style={styles.doneText}>
                {execution.status === 'completed' ? '✓ Trip completed' : 'No step to act on right now.'}
              </ThemedText>
            </View>
          )}

          {/* Task list */}
          <ThemedText style={styles.sectionTitle}>Progress</ThemedText>
          <View style={styles.taskList}>
            {orderedTasks.map((t) => {
              const dot = statusDot(t.status);
              const isActive = activeTask?.uuid === t.uuid;
              return (
                <View key={t.uuid} style={[styles.taskRow, isActive && styles.taskRowActive]}>
                  <ThemedText style={[styles.taskDot, { color: dot.color }]}>{dot.icon}</ThemedText>
                  <ThemedText style={styles.taskName}>{taskLabel(t)}</ThemedText>
                  <ThemedText style={[styles.taskStatus, { color: dot.color }]}>
                    {(STATUS_STYLES[t.status]?.label) || t.status}
                  </ThemedText>
                </View>
              );
            })}
          </View>
        </ScrollView>
      ) : null}

      {/* dropdown picker for select fields (e.g. outcome) */}
      <Modal visible={pickerField !== null} transparent animationType="slide" onRequestClose={() => setPickerField(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <ThemedText style={styles.modalTitle}>
                {activeFields.find((f) => f.name === pickerField)?.label || 'Select'}
              </ThemedText>
              <TouchableOpacity onPress={() => setPickerField(null)}><ThemedText style={styles.modalClose}>✕</ThemedText></TouchableOpacity>
            </View>
            <ScrollView style={styles.modalList}>
              {(activeFields.find((f) => f.name === pickerField)?.options || []).map((opt) => {
                const active = pickerField ? fieldValues[pickerField] === opt : false;
                return (
                  <TouchableOpacity
                    key={opt}
                    style={styles.modalOption}
                    onPress={() => { if (pickerField) setValue(pickerField, opt); setPickerField(null); }}
                    testID={`picker-opt-${opt}`}
                  >
                    <ThemedText style={[styles.modalOptionText, active && styles.modalOptionActive]}>
                      {active ? '✓ ' : ''}{opt}
                    </ThemedText>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorTitle: { fontSize: 16, fontWeight: '600', marginBottom: 4, textAlign: 'center' },
  errorText: { fontSize: 14, opacity: 0.6, textAlign: 'center' },
  content: { padding: 16, paddingBottom: 40 },
  summaryCard: {
    borderRadius: 12, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)',
    backgroundColor: 'rgba(255,255,255,0.6)', padding: 14, marginBottom: 16,
  },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  badgeText: { fontSize: 12, fontWeight: '600' },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  summaryTitle: { fontSize: 15, fontWeight: '600', flexShrink: 1, marginRight: 8 },
  summaryMeta: { fontSize: 13, opacity: 0.6 },
  actionCard: {
    borderRadius: 12, borderWidth: 1, borderColor: 'rgba(84,105,212,0.25)',
    backgroundColor: 'rgba(84,105,212,0.06)', padding: 16, marginBottom: 20,
  },
  actionHeading: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', opacity: 0.6, letterSpacing: 0.5 },
  actionTaskName: { fontSize: 18, fontWeight: '700', marginTop: 4, marginBottom: 12 },
  doneText: { fontSize: 15, fontWeight: '600', textAlign: 'center', paddingVertical: 8 },
  stopPanel: {
    marginBottom: 16, paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(0,0,0,0.12)',
  },
  balanceRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  balanceLabel: { fontSize: 13, opacity: 0.6 },
  balanceNone: { fontSize: 14, opacity: 0.4 },
  balanceBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  balanceOwed: { backgroundColor: '#FEE2E2' },
  balanceClear: { backgroundColor: '#D1FAE5' },
  balanceBadgeText: { fontSize: 12, fontWeight: '600', color: '#374151' },
  createOrderBtn: {
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#5469D4', borderRadius: 10,
    paddingVertical: 12, alignItems: 'center',
  },
  createOrderText: { color: '#5469D4', fontWeight: '700', fontSize: 15 },
  recentBox: { marginTop: 14 },
  recentTitle: { fontSize: 12, fontWeight: '600', opacity: 0.6, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  recentRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(0,0,0,0.08)',
  },
  recentLeft: { flex: 1, marginRight: 8 },
  recentDate: { fontSize: 13, fontWeight: '600' },
  recentDue: { fontSize: 12, opacity: 0.6, marginTop: 1 },
  recentBadges: { flexDirection: 'row', gap: 6 },
  miniBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  miniGray: { backgroundColor: '#E5E7EB' },
  miniBadgeText: { fontSize: 11, fontWeight: '600', color: '#374151' },
  addStopBtn: {
    borderWidth: 1, borderColor: '#5469D4', borderRadius: 10, paddingVertical: 11,
    alignItems: 'center', marginBottom: 16, backgroundColor: '#fff',
  },
  addStopText: { color: '#5469D4', fontWeight: '700', fontSize: 15 },
  fieldBlock: { marginBottom: 16 },
  fieldLabel: { fontSize: 14, fontWeight: '600', marginBottom: 8 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18, borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.12)', backgroundColor: 'rgba(255,255,255,0.7)',
  },
  chipActive: { backgroundColor: '#5469D4', borderColor: '#5469D4' },
  chipText: { fontSize: 13, color: '#374151' },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  input: {
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.15)', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, backgroundColor: '#fff', color: '#111827',
  },
  dropdown: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.15)', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 12, backgroundColor: '#fff',
  },
  dropdownText: { fontSize: 15, color: '#111827', flex: 1, marginRight: 8 },
  dropdownPlaceholder: { color: '#9ca3af' },
  dropdownCaret: { fontSize: 12, color: '#6b7280' },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' },
  modalSheet: { backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '70%', paddingBottom: 24 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(0,0,0,0.1)' },
  modalTitle: { fontSize: 16, fontWeight: '700' },
  modalClose: { fontSize: 18, color: '#6b7280' },
  modalList: { paddingHorizontal: 8 },
  modalOption: { paddingVertical: 14, paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(0,0,0,0.06)' },
  modalOptionText: { fontSize: 15, color: '#111827' },
  modalOptionActive: { fontWeight: '700', color: '#5469D4' },
  actionButton: { marginTop: 4, backgroundColor: '#5469D4', borderRadius: 12, paddingVertical: 15, alignItems: 'center' },
  actionButtonDisabled: { opacity: 0.6 },
  actionButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  sectionTitle: { fontSize: 13, fontWeight: '600', opacity: 0.6, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  taskList: {
    borderRadius: 12, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)',
    backgroundColor: 'rgba(255,255,255,0.4)', overflow: 'hidden',
  },
  taskRow: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(0,0,0,0.08)',
  },
  taskRowActive: { backgroundColor: 'rgba(84,105,212,0.08)' },
  taskDot: { width: 20, fontSize: 15, fontWeight: '700' },
  taskName: { flex: 1, fontSize: 14 },
  taskStatus: { fontSize: 12, fontWeight: '600' },
});
