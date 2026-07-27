import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { NativeHeader } from '@/components/layout/NativeHeader';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiCall } from '@/utils/api';

const CURRENCIES = ['SYP', 'USD'];

interface TripRow {
  uuid: string;
  vehicle_plate?: string | null;
  assigned_username?: string | null;
}

/**
 * Book a cost against the trip this execution is running — fuel, tolls, a meal
 * on the road.
 *
 * The trip is resolved from the execution rather than passed in, so the driver
 * cannot land the cost on the wrong run. It is always recorded as paid: the
 * money left the driver's pocket before they opened this screen.
 */
export default function TripExpenseScreen() {
  const router = useRouter();
  const { t, te } = useLanguage();
  const { executionUuid } = useLocalSearchParams<{ executionUuid?: string }>();

  const [trip, setTrip] = useState<TripRow | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('SYP');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (!executionUuid) {
        setLoading(false);
        return;
      }
      const [tripRes, catRes] = await Promise.all([
        apiCall<{ items?: TripRow[] }>(
          `/trip/?workflow_execution_uuid=${executionUuid}&per_page=1`
        ),
        apiCall<string[]>('/expense/categories'),
      ]);
      setTrip((tripRes.data?.items || [])[0] || null);
      setCategories(catRes.data || []);
      setLoading(false);
    })();
  }, [executionUuid]);

  const amountNumber = Number(amount);
  const canSubmit = useMemo(
    () =>
      !submitting &&
      !!trip &&
      !!category &&
      amount !== '' &&
      Number.isFinite(amountNumber) &&
      amountNumber > 0,
    [submitting, trip, category, amount, amountNumber]
  );

  const submit = useCallback(async () => {
    if (!canSubmit || !trip) return;
    setSubmitting(true);
    try {
      const res = await apiCall<{ uuid?: string }>('/expense/', {
        method: 'POST',
        body: JSON.stringify({
          amount: amountNumber,
          currency,
          category,
          trip_uuid: trip.uuid,
          ...(description ? { description } : {}),
          // always paid: this is money already spent on the road
          should_pay: true,
        }),
      });
      if (res.status !== 201 && res.status !== 200) {
        throw new Error(res.error || t('tripExpense.failed'));
      }
      Alert.alert(t('tripExpense.recorded'), `${amountNumber} ${currency} · ${te(category)}`);
      router.back();
    } catch (e: any) {
      Alert.alert(t('tripExpense.failed'), e?.message || '');
    } finally {
      setSubmitting(false);
    }
  }, [canSubmit, trip, amountNumber, currency, category, description, router, t, te]);

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <Stack.Screen options={{ headerShown: false }} />
        <NativeHeader title={t('tripExpense.title')} onBack={() => router.back()} />
        <View style={styles.centered}>
          <ActivityIndicator color="#5469D4" />
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <NativeHeader title={t('tripExpense.title')} onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* which run this lands on — not editable, it comes from the trip */}
        <View style={styles.tripCard}>
          <ThemedText style={styles.label}>{t('tripExpense.forTrip')}</ThemedText>
          <ThemedText style={styles.tripText} testID="expense-trip">
            {trip
              ? `${trip.vehicle_plate || trip.uuid.slice(0, 8)}${
                  trip.assigned_username ? ` · ${trip.assigned_username}` : ''
                }`
              : t('tripExpense.noTrip')}
          </ThemedText>
        </View>

        <ThemedText style={styles.label}>{t('tripExpense.amount')} *</ThemedText>
        <TextInput
          style={styles.input}
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          placeholder="0.00"
          placeholderTextColor="#9CA3AF"
          testID="expense-amount"
        />

        <ThemedText style={styles.label}>{t('tripExpense.currency')} *</ThemedText>
        <View style={styles.chipRow}>
          {CURRENCIES.map((c) => (
            <TouchableOpacity
              key={c}
              style={[styles.chip, currency === c && styles.chipActive]}
              onPress={() => setCurrency(c)}
              testID={`expense-currency-${c}`}
            >
              <ThemedText style={[styles.chipText, currency === c && styles.chipTextActive]}>
                {te(c)}
              </ThemedText>
            </TouchableOpacity>
          ))}
        </View>

        <ThemedText style={styles.label}>{t('tripExpense.category')} *</ThemedText>
        <View style={styles.chipWrap}>
          {categories.map((c) => (
            <TouchableOpacity
              key={c}
              style={[styles.chip, category === c && styles.chipActive]}
              onPress={() => setCategory(c)}
              testID={`expense-category-${c}`}
            >
              <ThemedText style={[styles.chipText, category === c && styles.chipTextActive]}>
                {te(c)}
              </ThemedText>
            </TouchableOpacity>
          ))}
        </View>

        <ThemedText style={styles.label}>{t('tripExpense.notes')}</ThemedText>
        <TextInput
          style={[styles.input, styles.multiline]}
          value={description}
          onChangeText={setDescription}
          placeholder={t('tripExpense.notesPlaceholder')}
          placeholderTextColor="#9CA3AF"
          multiline
          testID="expense-notes"
        />

        <ThemedText style={styles.paidNote}>{t('tripExpense.alwaysPaid')}</ThemedText>

        <TouchableOpacity
          style={[styles.submit, !canSubmit && styles.submitDisabled]}
          onPress={submit}
          disabled={!canSubmit}
          testID="expense-submit"
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <ThemedText style={styles.submitText}>{t('tripExpense.save')}</ThemedText>
          )}
        </TouchableOpacity>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, paddingBottom: 48 },
  tripCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    backgroundColor: 'rgba(0,0,0,0.03)',
    padding: 12,
    marginBottom: 16,
  },
  tripText: { fontSize: 15, fontWeight: '600' },
  label: { fontSize: 13, fontWeight: '600', opacity: 0.7, marginBottom: 6, marginTop: 12 },
  input: {
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.12)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  multiline: { minHeight: 72, textAlignVertical: 'top' },
  chipRow: { flexDirection: 'row', gap: 8 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.12)',
    backgroundColor: '#fff',
  },
  chipActive: { backgroundColor: '#5469D4', borderColor: '#5469D4' },
  chipText: { fontSize: 13, fontWeight: '600' },
  chipTextActive: { color: '#fff' },
  paidNote: { fontSize: 12, opacity: 0.6, marginTop: 14 },
  submit: {
    marginTop: 20,
    backgroundColor: '#5469D4',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  submitDisabled: { opacity: 0.4 },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
