import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { ModuleGuard } from '@/components/ModuleGuard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiCall, isOk } from '@/utils/api';
import { formatNumericDate } from '@/utils/date';

interface Payment {
  uuid: string;
  amount: number;
  currency?: string | null;
  payment_method?: string | null;
  created_at: string;
  notes?: string | null;
  invoice_uuid?: string | null;
  debit_note_item_uuid?: string | null;
  financial_account_uuid?: string | null;
}

/**
 * One payment, including who it came from.
 *
 * The payer takes two hops — payment carries invoice_uuid, the invoice carries
 * customer_uuid, and only the customer carries a name. Too expensive to do per row
 * in a list, affordable for a single record, and "who paid" is the first thing
 * anyone asks about a payment.
 *
 * Both hops are best-effort. A payment that is not against an invoice, or an
 * invoice whose customer cannot be read, still renders the payment — the amount is
 * the record, the name is context.
 */
export default function PaymentDetailScreen() {
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t, tef } = useLanguage();
  const [payment, setPayment] = useState<Payment | null>(null);
  const [payer, setPayer] = useState<string | null>(null);
  const [account, setAccount] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = useCallback(
    async (isRefresh = false) => {
      if (!isRefresh) setLoading(true);
      setFailed(false);
      setPayer(null);
      try {
        const res = await apiCall<Payment>(`/payment/${uuid}`);
        if (res.status !== 200 || !res.data) {
          setFailed(true);
          return;
        }
        setPayment(res.data);

        if (res.data.invoice_uuid) {
          const inv = await apiCall<any>(`/invoice/${res.data.invoice_uuid}`);
          const customerUuid = isOk(inv.status) ? inv.data?.customer_uuid : null;
          if (customerUuid) {
            const cust = await apiCall<any>(`/customer/${customerUuid}`);
            if (isOk(cust.status)) {
              setPayer(cust.data?.company_name || cust.data?.full_name || null);
            }
          }
        }
        if (res.data.financial_account_uuid) {
          const fa = await apiCall<any>(`/financial-account/${res.data.financial_account_uuid}`);
          setAccount(isOk(fa.status) ? (fa.data?.account_name ?? null) : null);
        }
      } catch {
        setFailed(true);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [uuid],
  );

  useEffect(() => {
    load();
  }, [load]);

  const rows: Array<[string, string]> = payment
    ? [
        [t('payments.payer'), payer ?? '—'],
        [t('payments.method'), payment.payment_method ? tef(payment.payment_method) : '—'],
        [t('payments.account'), account ?? '—'],
        [
          t('payments.appliedTo'),
          payment.invoice_uuid
            ? t('payments.againstInvoice')
            : payment.debit_note_item_uuid
              ? t('payments.againstDebitNote')
              : t('payments.unlinked'),
        ],
        [t('payments.received'), formatNumericDate(new Date(payment.created_at))],
      ]
    : [];

  return (
    <ModuleGuard module="payments">
      <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
        <Stack.Screen options={{ headerShown: false }} />

        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()} testID="payment-back" hitSlop={12}>
            <ThemedText style={styles.back}>‹</ThemedText>
          </TouchableOpacity>
          <ThemedText style={styles.topTitle} numberOfLines={1}>
            {t('menu.payments')}
          </ThemedText>
          <View style={styles.backSpacer} />
        </View>

        {loading ? (
          <View style={styles.centre}>
            <ActivityIndicator size="large" color="#5469D4" />
          </View>
        ) : failed || !payment ? (
          <View style={styles.centre}>
            <ThemedText style={styles.stateIcon}>⚠️</ThemedText>
            <ThemedText style={styles.stateText} testID="payment-error">
              {t('moduleList.failed')}
            </ThemedText>
            <TouchableOpacity style={styles.retry} onPress={() => load()}>
              <ThemedText style={styles.retryText}>{t('moduleList.retry')}</ThemedText>
            </TouchableOpacity>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={[styles.body, { paddingBottom: 40 + insets.bottom }]}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => {
                  setRefreshing(true);
                  load(true);
                }}
              />
            }
          >
            <ThemedText style={styles.amount} testID="payment-amount">
              {Number(payment.amount ?? 0).toFixed(2)}
              {payment.currency ? ` ${payment.currency}` : ''}
            </ThemedText>

            <View style={styles.card}>
              {rows.map(([label, value]) => (
                <View key={label} style={styles.row}>
                  <ThemedText style={styles.rowLabel}>{label}</ThemedText>
                  <ThemedText style={styles.rowValue} numberOfLines={2}>
                    {value}
                  </ThemedText>
                </View>
              ))}
            </View>

            {!!payment.notes && (
              <>
                <ThemedText style={styles.sectionTitle}>{t('payments.notes')}</ThemedText>
                <View style={styles.card}>
                  <ThemedText style={styles.notes}>{payment.notes}</ThemedText>
                </View>
              </>
            )}
          </ScrollView>
        )}
      </ThemedView>
    </ModuleGuard>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 },
  back: { fontSize: 30, lineHeight: 34, color: '#5469D4', fontWeight: '700' },
  backSpacer: { width: 24 },
  topTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '600' },
  body: { paddingHorizontal: 20, paddingTop: 6 },
  // lineHeight is not optional at this size: without it the ascender of a large
  // glyph is clipped by the container and the first line renders cut in half.
  amount: { fontSize: 30, lineHeight: 38, fontWeight: '700', color: '#166534' },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginTop: 16, gap: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  rowLabel: { flex: 1, fontSize: 14, opacity: 0.65 },
  rowValue: { flex: 1, fontSize: 14, fontWeight: '600', color: '#1f2937', textAlign: 'right' },
  sectionTitle: { fontSize: 15, fontWeight: '700', marginTop: 22, marginBottom: -6 },
  notes: { fontSize: 14, lineHeight: 20, opacity: 0.8 },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 },
  stateIcon: { fontSize: 34 },
  stateText: { fontSize: 15, opacity: 0.6, textAlign: 'center' },
  retry: {
    marginTop: 6,
    backgroundColor: '#5469D4',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },
  retryText: { color: '#fff', fontWeight: '600' },
});
