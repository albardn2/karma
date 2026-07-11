import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { Stack, useRouter } from 'expo-router';
import { NativeHeader } from '@/components/layout/NativeHeader';
import { apiCall } from '@/utils/api';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';

const TRIP_WORKFLOW_NAME = 'simple_trip_workflow';

// routing-only fields; hidden when manual_stops is on (backend validates per
// mode). service_areas intentionally NOT here: it also shows in manual mode
// (optional) so the trip map can draw the picked areas' boundaries.
const ROUTING_FIELDS = new Set([
  'start_warehouse_name',
  'end_warehouse_name',
  'start_point',
  'end_point',
  'customer_categories',
  'last_visit_threshold_days',
  'max_stops',
  'min_stops',
]);

interface Field {
  name: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'checklist' | string;
  required?: boolean;
  options?: string[] | null;
  placeholder?: string | null;
}

// prettier labels than the raw snake_case field names
const prettyLabel = (name: string) =>
  name
    .replace(/_/g, ' ')
    .replace(/\buuid\b/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\w/, (c) => c.toUpperCase());

export default function StartTripScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useLanguage();

  const [workflowUuid, setWorkflowUuid] = useState<string | null>(null);
  const [fields, setFields] = useState<Field[]>([]);
  const [values, setValues] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // load the workflow + its setup form fields
  useEffect(() => {
    (async () => {
      const wf = await apiCall<{ workflows: { uuid: string }[] }>(
        `/workflow/?name=${TRIP_WORKFLOW_NAME}&per_page=1`
      );
      const found = wf.data?.workflows?.[0];
      if (!found) {
        setLoadError(wf.error || t('start.workflowNotFound', { name: TRIP_WORKFLOW_NAME }));
        setLoading(false);
        return;
      }
      setWorkflowUuid(found.uuid);

      const tasksRes = await apiCall<{ tasks: any[] }>(
        `/task/?workflow_uuid=${found.uuid}&per_page=20`
      );
      const setup = (tasksRes.data?.tasks || []).find(
        (t) => t.operator === 'start_trip_operator'
      );
      const setupFields: Field[] = setup?.task_inputs?.fields || [];
      setFields(setupFields);

      // seed defaults; pre-select the current user as assignee if available
      const initial: Record<string, any> = {};
      for (const f of setupFields) {
        if (f.type === 'checklist') initial[f.name] = [];
        else initial[f.name] = '';
      }
      const myUsername = user?.username;
      if (myUsername && setupFields.find((f) => f.name === 'assigned_user_uuid')?.options?.includes(myUsername)) {
        initial['assigned_user_uuid'] = myUsername;
      }
      setValues(initial);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const manualStops = useMemo(() => {
    const v = values['manual_stops'];
    return Array.isArray(v) ? v.length > 0 : !!v;
  }, [values]);

  const visibleFields = useMemo(
    () =>
      fields.filter((f) => {
        if (f.name === 'manual_stops') return false; // rendered as a dedicated toggle
        if (manualStops && ROUTING_FIELDS.has(f.name)) return false;
        return true;
      }),
    [fields, manualStops]
  );

  const setValue = (name: string, value: any) =>
    setValues((prev) => ({ ...prev, [name]: value }));

  const toggleChecklist = (name: string, option: string) =>
    setValues((prev) => {
      const cur: string[] = prev[name] || [];
      return {
        ...prev,
        [name]: cur.includes(option) ? cur.filter((o) => o !== option) : [...cur, option],
      };
    });

  // client-side gate mirroring the backend's per-mode requirements
  const validate = (): string | null => {
    if (!values['vehicle_plate']) return t('start.selectVehicle');
    if (manualStops) {
      if (!values['assigned_user_uuid']) return t('start.selectAssignedUser');
    } else {
      if (!(values['service_areas'] || []).length) return t('start.selectServiceArea');
      if (!values['start_warehouse_name']) return t('start.selectStartWarehouse');
      if (!values['end_warehouse_name']) return t('start.selectEndWarehouse');
      if (!values['last_visit_threshold_days']) return t('start.setLastVisitThreshold');
    }
    return null;
  };

  const buildResult = () => {
    const result: Record<string, any> = { manual_stops: manualStops };
    for (const f of fields) {
      if (f.name === 'manual_stops') continue;
      if (manualStops && ROUTING_FIELDS.has(f.name)) continue;
      const v = values[f.name];
      if (f.type === 'checklist') {
        result[f.name] = v || [];
      } else if (f.type === 'number') {
        result[f.name] = v === '' || v == null ? null : Number(v);
      } else {
        result[f.name] = v === '' ? null : v;
      }
    }
    return result;
  };

  const handleStart = async () => {
    const err = validate();
    if (err) {
      Alert.alert(t('start.missingInfo'), err);
      return;
    }
    if (!workflowUuid) return;

    setSubmitting(true);
    let createdUuid: string | null = null;
    try {
      // 1. create the execution (also creates its task executions)
      const created = await apiCall<any>('/workflow-execution/', {
        method: 'POST',
        body: JSON.stringify({ workflow_uuid: workflowUuid }),
      });
      if (created.status !== 201 || !created.data) {
        throw new Error(created.error || t('start.failedCreateExecution'));
      }
      createdUuid = created.data.uuid;
      const setupExe = (created.data.task_executions || []).find(
        (te: any) => te.operator === 'start_trip_operator'
      );
      if (!setupExe) throw new Error(t('start.setupTaskNotFound'));

      // 2. complete the setup task with the form values
      const completed = await apiCall('/task-execution/complete', {
        method: 'POST',
        body: JSON.stringify({ uuid: setupExe.uuid, result: buildResult() }),
      });
      if (completed.status !== 200) {
        throw new Error(completed.error || t('start.failedStartTrip'));
      }

      // drop into the running trip so the driver can continue the flow
      router.replace(`/distribution/${createdUuid}`);
    } catch (e: any) {
      // roll back the dangling execution so the list stays clean
      if (createdUuid) {
        await apiCall(`/workflow-execution/cancel/${createdUuid}`, { method: 'POST' }).catch(() => {});
      }
      Alert.alert(t('start.error'), e?.message || t('start.couldNotStartTrip'));
    } finally {
      setSubmitting(false);
    }
  };

  const renderField = (f: Field) => {
    if (f.type === 'select') {
      return (
        <View key={f.name} style={styles.fieldBlock}>
          <ThemedText style={styles.fieldLabel}>
            {prettyLabel(f.name)}
          </ThemedText>
          <View style={styles.chipWrap}>
            {(f.options || []).map((opt) => {
              const active = values[f.name] === opt;
              return (
                <TouchableOpacity
                  key={opt}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => setValue(f.name, active ? '' : opt)}
                  testID={`opt-${f.name}-${opt}`}
                >
                  <ThemedText style={[styles.chipText, active && styles.chipTextActive]}>
                    {opt}
                  </ThemedText>
                </TouchableOpacity>
              );
            })}
            {(f.options || []).length === 0 && (
              <ThemedText style={styles.emptyOpts}>{t('start.noOptionsAvailable')}</ThemedText>
            )}
          </View>
        </View>
      );
    }
    if (f.type === 'checklist') {
      const selected: string[] = values[f.name] || [];
      return (
        <View key={f.name} style={styles.fieldBlock}>
          <ThemedText style={styles.fieldLabel}>{prettyLabel(f.name)}</ThemedText>
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
    // text / number
    return (
      <View key={f.name} style={styles.fieldBlock}>
        <ThemedText style={styles.fieldLabel}>{prettyLabel(f.name)}</ThemedText>
        <TextInput
          style={styles.input}
          value={String(values[f.name] ?? '')}
          onChangeText={(t) => setValue(f.name, t)}
          keyboardType={f.type === 'number' ? 'numeric' : 'default'}
          placeholder={f.placeholder || ''}
          placeholderTextColor="#9ca3af"
          testID={`input-${f.name}`}
        />
      </View>
    );
  };

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <NativeHeader
        title={t('start.startTrip')}
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/distribution'))}
      />

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#5469D4" />
        </View>
      ) : loadError ? (
        <View style={styles.centered}>
          <ThemedText style={styles.errorTitle}>{t('start.couldNotLoadForm')}</ThemedText>
          <ThemedText style={styles.errorText}>{loadError}</ThemedText>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
          {/* manual stops toggle */}
          <View style={styles.toggleRow}>
            <View style={styles.toggleTextWrap}>
              <ThemedText style={styles.toggleTitle}>{t('start.manualStops')}</ThemedText>
              <ThemedText style={styles.toggleHint}>
                {t('start.manualStopsHint')}
              </ThemedText>
            </View>
            <Switch
              value={manualStops}
              onValueChange={(on) => setValue('manual_stops', on ? ['yes'] : [])}
              trackColor={{ true: '#5469D4' }}
              testID="toggle-manual-stops"
            />
          </View>

          {visibleFields.map(renderField)}

          <TouchableOpacity
            style={[styles.startButton, submitting && styles.startButtonDisabled]}
            onPress={handleStart}
            disabled={submitting}
            testID="button-submit-start-trip"
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <ThemedText style={styles.startButtonText}>{t('start.startTrip')}</ThemedText>
            )}
          </TouchableOpacity>
        </ScrollView>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorTitle: { fontSize: 16, fontWeight: '600', marginBottom: 4, textAlign: 'center' },
  errorText: { fontSize: 14, opacity: 0.6, textAlign: 'center' },
  form: { padding: 16, paddingBottom: 40 },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(84,105,212,0.25)',
    backgroundColor: 'rgba(84,105,212,0.06)',
    marginBottom: 20,
  },
  toggleTextWrap: { flex: 1, marginRight: 12 },
  toggleTitle: { fontSize: 15, fontWeight: '600' },
  toggleHint: { fontSize: 12, opacity: 0.6, marginTop: 2 },
  fieldBlock: { marginBottom: 18 },
  fieldLabel: { fontSize: 14, fontWeight: '600', marginBottom: 8 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.12)',
    backgroundColor: 'rgba(255,255,255,0.6)',
  },
  chipActive: { backgroundColor: '#5469D4', borderColor: '#5469D4' },
  chipText: { fontSize: 13, color: '#374151' },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  emptyOpts: { fontSize: 13, opacity: 0.5 },
  input: {
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.15)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    backgroundColor: '#fff',
    color: '#111827',
  },
  startButton: {
    marginTop: 12,
    backgroundColor: '#5469D4',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  startButtonDisabled: { opacity: 0.6 },
  startButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
