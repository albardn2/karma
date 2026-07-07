import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  TouchableOpacity,
  View,
} from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { NativeHeader } from '@/components/layout/NativeHeader';
import { apiCall } from '@/utils/api';

export default function OrderActionsScreen() {
  const router = useRouter();
  const { orderUuid, tripStopUuid } = useLocalSearchParams<{ orderUuid?: string; tripStopUuid?: string }>();

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [doFulfill, setDoFulfill] = useState(true);
  const [doPay, setDoPay] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    setLoading(true);
    const res = await apiCall<any>(`/customer-order/with-items-and-invoice/${orderUuid}`);
    setData(res.data || null);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderUuid]);

  const order = data?.customer_order;
  const invoice = data?.invoices?.[0];
  const items = (order?.customer_order_items || []).filter((i: any) => !i.is_deleted);
  const unfulfilled = items.filter((i: any) => !i.is_fulfilled);
  const amountDue = invoice?.net_amount_due ?? order?.net_amount_due ?? 0;
  const currency = order?.currency || '';
  const canFulfill = unfulfilled.length > 0;
  const canPay = amountDue > 0;

  const submit = async () => {
    if (!(doFulfill && canFulfill) && !(doPay && canPay)) return;
    setSubmitting(true);
    try {
      if (doFulfill && canFulfill) {
        const r = await apiCall('/customer-order-item/fulfill-items', {
          method: 'POST',
          body: JSON.stringify({
            items: unfulfilled.map((i: any) => ({ customer_order_item_uuid: i.uuid })),
            trip_stop_uuid: tripStopUuid || null,
          }),
        });
        if (r.status !== 200 && r.status !== 201) throw new Error(r.error || 'Failed to fulfill');
      }
      if (doPay && canPay) {
        const r = await apiCall('/payment/', {
          method: 'POST',
          body: JSON.stringify({
            invoice_uuid: invoice.uuid,
            financial_account_uuid: null,
            amount: amountDue,
            currency,
            payment_method: 'cash',
            trip_stop_uuid: tripStopUuid || null,
          }),
        });
        if (r.status !== 200 && r.status !== 201) throw new Error(r.error || 'Failed to record payment');
      }
      router.back();
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not update the order');
    } finally {
      setSubmitting(false);
    }
  };

  const nothingSelected = !(doFulfill && canFulfill) && !(doPay && canPay);

  const fmtDate = (s?: string) => {
    if (!s) return '';
    const d = new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(s) ? s : s + 'Z');
    return isNaN(d.getTime()) ? s : d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <NativeHeader
        title="Order"
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/distribution'))}
      />

      {loading || !order ? (
        <View style={styles.centered}><ActivityIndicator size="large" color="#5469D4" /></View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {/* header */}
          <View style={styles.headerRow}>
            <ThemedText style={styles.date}>{fmtDate(order.created_at)}</ThemedText>
            <View style={styles.badges}>
              <View style={[styles.badge, order.is_paid ? styles.badgeGreen : styles.badgeRed]}>
                <ThemedText style={styles.badgeText}>{order.is_paid ? 'Paid' : 'Unpaid'}</ThemedText>
              </View>
              <View style={[styles.badge, order.is_fulfilled ? styles.badgeGreen : styles.badgeGray]}>
                <ThemedText style={styles.badgeText}>{order.is_fulfilled ? 'Fulfilled' : 'Unfulfilled'}</ThemedText>
              </View>
            </View>
          </View>

          {/* items */}
          <View style={styles.itemsBox}>
            {items.map((i: any) => (
              <View key={i.uuid} style={styles.itemRow}>
                <ThemedText style={styles.itemName}>{i.material_name} × {i.quantity} {i.unit || ''}</ThemedText>
                <ThemedText style={[styles.itemTag, i.is_fulfilled ? styles.tagGreen : styles.tagGray]}>
                  {i.is_fulfilled ? 'fulfilled' : 'pending'}
                </ThemedText>
              </View>
            ))}
          </View>

          {/* totals */}
          <View style={styles.totals}>
            <View style={styles.totalLine}><ThemedText style={styles.totalKey}>Total</ThemedText><ThemedText>{invoice?.total_amount ?? order.total_adjusted_amount ?? 0} {currency}</ThemedText></View>
            <View style={styles.totalLine}><ThemedText style={styles.totalKey}>Paid</ThemedText><ThemedText>{invoice?.net_amount_paid ?? order.net_amount_paid ?? 0} {currency}</ThemedText></View>
            <View style={styles.totalLine}><ThemedText style={styles.totalKeyBold}>Due</ThemedText><ThemedText style={styles.totalKeyBold}>{amountDue} {currency}</ThemedText></View>
          </View>

          {/* actions */}
          {(canFulfill || canPay) ? (
            <View style={styles.actions}>
              {canFulfill && (
                <View style={styles.toggleRow}>
                  <ThemedText style={styles.toggleLabel}>Mark fulfilled ({unfulfilled.length} item{unfulfilled.length > 1 ? 's' : ''})</ThemedText>
                  <Switch value={doFulfill} onValueChange={setDoFulfill} trackColor={{ true: '#5469D4' }} testID="toggle-fulfill" />
                </View>
              )}
              {canPay && (
                <View style={styles.toggleRow}>
                  <ThemedText style={styles.toggleLabel}>Mark paid ({amountDue} {currency})</ThemedText>
                  <Switch value={doPay} onValueChange={setDoPay} trackColor={{ true: '#5469D4' }} testID="toggle-pay" />
                </View>
              )}
              <TouchableOpacity
                style={[styles.submit, (nothingSelected || submitting) && styles.submitDisabled]}
                onPress={submit}
                disabled={nothingSelected || submitting}
                testID="button-submit-order-actions"
              >
                {submitting ? <ActivityIndicator color="#fff" /> : <ThemedText style={styles.submitText}>Submit</ThemedText>}
              </TouchableOpacity>
            </View>
          ) : (
            <ThemedText style={styles.settled}>This order is fully paid and fulfilled.</ThemedText>
          )}
        </ScrollView>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  content: { padding: 16, paddingBottom: 40 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  date: { fontSize: 13, opacity: 0.6 },
  badges: { flexDirection: 'row', gap: 8 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  badgeGreen: { backgroundColor: '#D1FAE5' },
  badgeRed: { backgroundColor: '#FEE2E2' },
  badgeGray: { backgroundColor: '#E5E7EB' },
  badgeText: { fontSize: 12, fontWeight: '600', color: '#374151' },
  itemsBox: { borderWidth: 1, borderColor: 'rgba(0,0,0,0.1)', borderRadius: 10, marginBottom: 16 },
  itemRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(0,0,0,0.08)',
  },
  itemName: { fontSize: 14, flex: 1, marginRight: 8 },
  itemTag: { fontSize: 11, fontWeight: '600', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, overflow: 'hidden' },
  tagGreen: { backgroundColor: '#D1FAE5', color: '#047857' },
  tagGray: { backgroundColor: '#E5E7EB', color: '#4B5563' },
  totals: { marginBottom: 16 },
  totalLine: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  totalKey: { opacity: 0.6 },
  totalKeyBold: { fontWeight: '700' },
  actions: { borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.1)', paddingTop: 12 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  toggleLabel: { fontSize: 15 },
  submit: { marginTop: 12, backgroundColor: '#5469D4', borderRadius: 12, paddingVertical: 15, alignItems: 'center' },
  submitDisabled: { opacity: 0.5 },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  settled: { textAlign: 'center', opacity: 0.6, paddingVertical: 16 },
});
