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
import { useLanguage } from '@/contexts/LanguageContext';

interface Field {
  name: string;
  label: string;
  type: string;
  required?: boolean;
  options?: string[] | null;
  placeholder?: string | null;
}

const toDate = (s?: string | null) => {
  if (!s) return null;
  const d = new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(s) ? s : s + 'Z');
  return isNaN(d.getTime()) ? null : d;
};
const fmt = (s?: string | null) => {
  const d = toDate(s);
  return d ? d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
};

export default function StopDetailScreen() {
  const router = useRouter();
  const { t, te, tef } = useLanguage();
  const { taskExecutionUuid, taskUuid, tripStopUuid, customerUuid, customerName } =
    useLocalSearchParams<{
      taskExecutionUuid?: string;
      taskUuid?: string;
      tripStopUuid?: string;
      customerUuid?: string;
      customerName?: string;
    }>();

  const [fields, setFields] = useState<Field[]>([]);
  const [values, setValues] = useState<Record<string, any>>({});
  const [balance, setBalance] = useState<Record<string, number> | null>(null);
  const [recentOrders, setRecentOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pickerField, setPickerField] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useFocusEffect(React.useCallback(() => { setRefreshKey((k) => k + 1); }, []));

  useEffect(() => {
    (async () => {
      if (!taskUuid || !customerUuid) { setLoading(false); return; }
      const [taskRes, custRes, ordersRes] = await Promise.all([
        apiCall<any>(`/task/${taskUuid}`),
        apiCall<any>(`/customer/${customerUuid}`),
        apiCall<any>(`/customer-order/?customer_uuid=${customerUuid}&per_page=50`),
      ]);
      const f: Field[] = taskRes.data?.task_inputs?.fields || [];
      setFields(f);
      setValues((prev) => {
        // keep any in-progress edits across focus refreshes
        if (Object.keys(prev).length) return prev;
        const init: Record<string, any> = {};
        for (const x of f) init[x.name] = x.type === 'checklist' ? [] : '';
        return init;
      });
      setBalance(custRes.data?.balance_per_currency || {});

      const all: any[] = ordersRes.data?.orders || ordersRes.data?.customer_orders || [];
      const attention = (o: any) => o.is_paid === false || o.is_fulfilled === false;
      setRecentOrders(
        [...all].sort((a, b) => {
          const ap = attention(a) ? 0 : 1;
          const bp = attention(b) ? 0 : 1;
          if (ap !== bp) return ap - bp;
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        }).slice(0, 5)
      );
      setLoading(false);
      setRefreshing(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskUuid, customerUuid, refreshKey]);

  const setValue = (name: string, v: any) => setValues((p) => ({ ...p, [name]: v }));
  const toggleChecklist = (name: string, opt: string) =>
    setValues((p) => {
      const cur: string[] = p[name] || [];
      return { ...p, [name]: cur.includes(opt) ? cur.filter((o) => o !== opt) : [...cur, opt] };
    });

  const complete = async () => {
    for (const f of fields) {
      if (!f.required) continue;
      const v = values[f.name];
      const empty = f.type === 'checklist' ? !(v || []).length : !v;
      if (empty) { Alert.alert(t('stopdetail.missingInfo'), t('stopdetail.fieldRequired', { field: tef(f.label) })); return; }
    }
    const result: Record<string, any> = {};
    for (const f of fields) {
      const v = values[f.name];
      if (f.type === 'checklist') result[f.label] = v || [];
      else if (f.type === 'number') result[f.label] = v === '' || v == null ? null : Number(v);
      else result[f.label] = v === '' ? null : v;
    }
    setSubmitting(true);
    try {
      const res = await apiCall('/task-execution/complete', {
        method: 'POST',
        body: JSON.stringify({ uuid: taskExecutionUuid, result }),
      });
      if (res.status !== 200) throw new Error(res.error || t('stopdetail.failedToCompleteStop'));
      router.back();
    } catch (e: any) {
      Alert.alert(t('stopdetail.error'), e?.message || t('stopdetail.couldNotCompleteStop'));
    } finally {
      setSubmitting(false);
    }
  };

  const renderField = (f: Field) => {
    if (f.type === 'select') {
      const value = values[f.name];
      return (
        <View key={f.name} style={styles.fieldBlock}>
          <ThemedText style={styles.fieldLabel}>{tef(f.label)}{f.required ? ' *' : ''}</ThemedText>
          <TouchableOpacity style={styles.dropdown} onPress={() => setPickerField(f.name)} testID={`select-${f.name}`}>
            <ThemedText style={[styles.dropdownText, !value && styles.dropdownPlaceholder]} numberOfLines={1}>
              {value ? te(value) : (f.placeholder || t('stopdetail.selectPlaceholder'))}
            </ThemedText>
            <ThemedText style={styles.caret}>▾</ThemedText>
          </TouchableOpacity>
        </View>
      );
    }
    if (f.type === 'checklist') {
      const selected: string[] = values[f.name] || [];
      return (
        <View key={f.name} style={styles.fieldBlock}>
          <ThemedText style={styles.fieldLabel}>{tef(f.label)}{f.required ? ' *' : ''}</ThemedText>
          <View style={styles.chipWrap}>
            {(f.options || []).map((opt) => {
              const active = selected.includes(opt);
              return (
                <TouchableOpacity key={opt} style={[styles.chip, active && styles.chipActive]} onPress={() => toggleChecklist(f.name, opt)}>
                  <ThemedText style={[styles.chipText, active && styles.chipTextActive]}>{active ? '✓ ' : ''}{te(opt)}</ThemedText>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      );
    }
    return (
      <View key={f.name} style={styles.fieldBlock}>
        <ThemedText style={styles.fieldLabel}>{tef(f.label)}{f.required ? ' *' : ''}</ThemedText>
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

  const pickerOptions = fields.find((f) => f.name === pickerField)?.options || [];

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <NativeHeader
        title={(customerName as string) || t('stopdetail.stop')}
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/distribution'))}
      />

      {loading ? (
        <View style={styles.centered}><ActivityIndicator size="large" color="#5469D4" /></View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); setRefreshKey((k) => k + 1); }} />}
        >
          {/* balance */}
          {balance && (
            <View style={styles.balanceRow}>
              <ThemedText style={styles.balanceLabel}>{t('stopdetail.balance')}</ThemedText>
              {Object.keys(balance).length === 0 ? (
                <ThemedText style={styles.balanceNone}>—</ThemedText>
              ) : (
                Object.entries(balance).map(([cur, amt]) => (
                  <View key={cur} style={[styles.balanceBadge, Number(amt) > 0 ? styles.owed : styles.clear]}>
                    <ThemedText style={styles.balanceBadgeText}>{Number(amt).toFixed(2)} {te(cur)}</ThemedText>
                  </View>
                ))
              )}
            </View>
          )}

          {/* create order */}
          <TouchableOpacity
            style={styles.createOrderBtn}
            onPress={() => router.push({ pathname: '/distribution/create-order', params: { tripStopUuid, customerUuid, customerName } })}
            testID="button-create-order"
          >
            <ThemedText style={styles.createOrderText}>{t('stopdetail.createOrder')}</ThemedText>
          </TouchableOpacity>

          {/* recent orders */}
          {recentOrders.length > 0 && (
            <View style={styles.recentBox}>
              <ThemedText style={styles.recentTitle}>{t('stopdetail.recentOrders')}</ThemedText>
              {recentOrders.map((o) => (
                <TouchableOpacity
                  key={o.uuid}
                  style={styles.recentRow}
                  onPress={() => router.push({ pathname: '/distribution/order', params: { orderUuid: o.uuid, tripStopUuid } })}
                  testID={`recent-order-${o.uuid}`}
                >
                  <View style={styles.recentLeft}>
                    <ThemedText style={styles.recentDate}>{fmt(o.created_at)}</ThemedText>
                    <ThemedText style={styles.recentDue}>{t('stopdetail.amountDue', { amount: o.net_amount_due ?? o.total_adjusted_amount ?? 0, currency: o.currency || '' })}</ThemedText>
                  </View>
                  <View style={styles.recentBadges}>
                    <View style={[styles.miniBadge, o.is_paid ? styles.clear : styles.owed]}><ThemedText style={styles.miniBadgeText}>{o.is_paid ? t('stopdetail.paid') : t('stopdetail.unpaid')}</ThemedText></View>
                    <View style={[styles.miniBadge, o.is_fulfilled ? styles.clear : styles.gray]}><ThemedText style={styles.miniBadgeText}>{o.is_fulfilled ? t('stopdetail.fulfilled') : t('stopdetail.unfulfilled')}</ThemedText></View>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* outcome / notes */}
          <View style={styles.divider} />
          {fields.map(renderField)}

          <TouchableOpacity
            style={[styles.completeBtn, submitting && styles.completeDisabled]}
            onPress={complete}
            disabled={submitting}
            testID="button-complete-stop"
          >
            {submitting ? <ActivityIndicator color="#fff" /> : <ThemedText style={styles.completeText}>{t('stopdetail.completeStop')}</ThemedText>}
          </TouchableOpacity>
        </ScrollView>
      )}

      <Modal visible={pickerField !== null} transparent animationType="slide" onRequestClose={() => setPickerField(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <ThemedText style={styles.modalTitle}>{fields.find((f) => f.name === pickerField)?.label || t('stopdetail.select')}</ThemedText>
              <TouchableOpacity onPress={() => setPickerField(null)}><ThemedText style={styles.modalClose}>✕</ThemedText></TouchableOpacity>
            </View>
            <ScrollView style={styles.modalList}>
              {pickerOptions.map((opt) => {
                const active = pickerField ? values[pickerField] === opt : false;
                return (
                  <TouchableOpacity key={opt} style={styles.modalOption} onPress={() => { if (pickerField) setValue(pickerField, opt); setPickerField(null); }} testID={`picker-opt-${opt}`}>
                    <ThemedText style={[styles.modalOptionText, active && styles.modalOptionActive]}>{active ? '✓ ' : ''}{te(opt)}</ThemedText>
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
  content: { padding: 16, paddingBottom: 40 },
  balanceRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  balanceLabel: { fontSize: 13, opacity: 0.6 },
  balanceNone: { fontSize: 14, opacity: 0.4 },
  balanceBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  owed: { backgroundColor: '#FEE2E2' },
  clear: { backgroundColor: '#D1FAE5' },
  gray: { backgroundColor: '#E5E7EB' },
  balanceBadgeText: { fontSize: 12, fontWeight: '600', color: '#374151' },
  createOrderBtn: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#5469D4', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  createOrderText: { color: '#5469D4', fontWeight: '700', fontSize: 15 },
  recentBox: { marginTop: 16 },
  recentTitle: { fontSize: 12, fontWeight: '600', opacity: 0.6, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  recentRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(0,0,0,0.08)' },
  recentLeft: { flex: 1, marginRight: 8 },
  recentDate: { fontSize: 13, fontWeight: '600' },
  recentDue: { fontSize: 12, opacity: 0.6, marginTop: 1 },
  recentBadges: { flexDirection: 'row', gap: 6 },
  miniBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  miniBadgeText: { fontSize: 11, fontWeight: '600', color: '#374151' },
  divider: { height: 1, backgroundColor: 'rgba(0,0,0,0.1)', marginVertical: 18 },
  fieldBlock: { marginBottom: 16 },
  fieldLabel: { fontSize: 14, fontWeight: '600', marginBottom: 8 },
  dropdown: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: 'rgba(0,0,0,0.15)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, backgroundColor: '#fff' },
  dropdownText: { fontSize: 15, color: '#111827', flex: 1, marginRight: 8 },
  dropdownPlaceholder: { color: '#9ca3af' },
  caret: { fontSize: 12, color: '#6b7280' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(0,0,0,0.12)', backgroundColor: 'rgba(255,255,255,0.7)' },
  chipActive: { backgroundColor: '#5469D4', borderColor: '#5469D4' },
  chipText: { fontSize: 13, color: '#374151' },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  input: { borderWidth: 1, borderColor: 'rgba(0,0,0,0.15)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, backgroundColor: '#fff', color: '#111827' },
  completeBtn: { marginTop: 8, backgroundColor: '#5469D4', borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  completeDisabled: { opacity: 0.6 },
  completeText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' },
  modalSheet: { backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '70%', paddingBottom: 24 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(0,0,0,0.1)' },
  modalTitle: { fontSize: 16, fontWeight: '700' },
  modalClose: { fontSize: 18, color: '#6b7280' },
  modalList: { paddingHorizontal: 8 },
  modalOption: { paddingVertical: 14, paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(0,0,0,0.06)' },
  modalOptionText: { fontSize: 15, color: '#111827' },
  modalOptionActive: { fontWeight: '700', color: '#5469D4' },
});
