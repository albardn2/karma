import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
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

// The 2026-08 setup form is six fields (service areas, assignee, assigned date,
// desired stops, strategy, vehicle). The screen renders whatever descriptors the
// task serves, so it needs no per-field special-casing — only the single-pick
// checklist behaviour (assigned_date) and the validation gate below know
// field names.

interface Field {
  name: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'checklist' | string;
  required?: boolean;
  options?: string[] | null;
  placeholder?: string | null;
  /** false on a checklist means exactly one option may be picked */
  multiple?: boolean;
}


export default function StartTripScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { t, te, tef } = useLanguage();

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
      // the trip is usually for today, and manual is the only strategy until
      // the routing revamp lands more — sensible defaults, both changeable
      const dateField = setupFields.find((f) => f.name === 'assigned_date');
      if (dateField?.options?.length) initial['assigned_date'] = [dateField.options[0]];
      const strategyField = setupFields.find((f) => f.name === 'strategy');
      if (strategyField?.options?.includes('manual')) initial['strategy'] = 'manual';
      setValues(initial);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visibleFields = fields;

  const setValue = (name: string, value: any) =>
    setValues((prev) => ({ ...prev, [name]: value }));

  const toggleChecklist = (name: string, option: string, single = false) =>
    setValues((prev) => {
      const cur: string[] = prev[name] || [];
      if (cur.includes(option)) {
        return { ...prev, [name]: cur.filter((o) => o !== option) };
      }
      // a single-pick checklist (multiple=false, e.g. the trip's assigned date)
      // replaces the selection — appending would submit two and be refused
      return { ...prev, [name]: single ? [option] : [...cur, option] };
    });

  // client-side gate mirroring the backend schema's requirements
  const validate = (): string | null => {
    if (!values['vehicle_plate']) return t('start.selectVehicle');
    if (!values['assigned_user_uuid']) return t('start.selectAssignedUser');
    if (!(values['assigned_date'] || []).length) return t('start.selectAssignedDate');
    return null;
  };

  const buildResult = () => {
    const result: Record<string, any> = {};
    for (const f of fields) {
      const v = values[f.name];
      if (f.type === 'checklist') {
        result[f.name] = v || [];
      } else if (f.type === 'number') {
        // the schema bounds desired_stops but treats absent as "not specified";
        // an empty input must therefore be omitted, not sent as null-ish 0
        if (v !== '' && v != null) result[f.name] = Number(v);
      } else if (v !== '' && v != null) {
        result[f.name] = v;
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
            {tef(f.name)}
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
                    {f.name === 'customer_categories' || f.name === 'strategy' ? te(opt) : opt}
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
      const single = f.multiple === false;
      return (
        <View key={f.name} style={styles.fieldBlock}>
          <ThemedText style={styles.fieldLabel}>{tef(f.name)}</ThemedText>
          <View style={styles.chipWrap}>
            {(f.options || []).map((opt) => {
              const active = selected.includes(opt);
              return (
                <TouchableOpacity
                  key={opt}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => toggleChecklist(f.name, opt, single)}
                  testID={`opt-${f.name}-${opt}`}
                >
                  <ThemedText style={[styles.chipText, active && styles.chipTextActive]}>
                    {active ? '✓ ' : ''}{f.name === 'customer_categories' ? te(opt) : opt}
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
        <ThemedText style={styles.fieldLabel}>{tef(f.name)}</ThemedText>
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
