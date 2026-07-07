import React, { useEffect, useMemo, useState } from 'react';
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
import { apiCall } from '@/utils/api';

interface CustomerRow {
  uuid: string;
  company_name?: string;
  full_name?: string;
  phone_number?: string;
}

export default function AddStopScreen() {
  const router = useRouter();
  const { executionUuid } = useLocalSearchParams<{ executionUuid?: string }>();

  const [mode, setMode] = useState<'existing' | 'new'>('existing');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [customerUuid, setCustomerUuid] = useState('');
  const [coords, setCoords] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [newCustomer, setNewCustomer] = useState({ company_name: '', full_name: '', phone_number: '', category: '', full_address: '' });
  const [submitting, setSubmitting] = useState(false);

  // capture device location once (web + native)
  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setCoords(`${pos.coords.latitude.toFixed(6)},${pos.coords.longitude.toFixed(6)}`),
        () => {},
        { enableHighAccuracy: true, timeout: 6000 }
      );
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (mode !== 'existing') return;
    (async () => {
      const q = debounced ? `&company_name=${encodeURIComponent(debounced)}` : '';
      const res = await apiCall<{ customers: CustomerRow[] }>(`/customer/?page=1&per_page=50${q}`);
      setCustomers(res.data?.customers || []);
    })();
  }, [mode, debounced]);

  useEffect(() => {
    if (mode !== 'new' || categories.length) return;
    (async () => {
      const res = await apiCall<string[]>('/customer/categories');
      setCategories(res.data || []);
    })();
  }, [mode, categories.length]);

  const captureLocation = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      Alert.alert('Location unavailable', 'Geolocation is not supported here.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => setCoords(`${pos.coords.latitude.toFixed(6)},${pos.coords.longitude.toFixed(6)}`),
      (e) => Alert.alert('Location error', e.message),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const canSubmit = useMemo(() => {
    if (submitting) return false;
    return mode === 'existing'
      ? !!customerUuid
      : !!(newCustomer.company_name && newCustomer.full_name && newCustomer.phone_number && newCustomer.category);
  }, [mode, customerUuid, newCustomer, submitting]);

  const submit = async () => {
    if (!canSubmit || !executionUuid) return;
    setSubmitting(true);
    try {
      const body: any = { coordinates: coords || null };
      if (mode === 'existing') {
        body.customer_uuid = customerUuid;
      } else {
        body.customer = {
          company_name: newCustomer.company_name,
          full_name: newCustomer.full_name,
          phone_number: newCustomer.phone_number,
          category: newCustomer.category,
          full_address: newCustomer.full_address || newCustomer.company_name,
          coordinates: coords || null,
        };
      }
      const res = await apiCall(`/workflow-execution/${executionUuid}/manual-stop`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      if (res.status !== 201 && res.status !== 200) throw new Error(res.error || 'Failed to add the stop');
      router.back();
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not add the stop');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <NativeHeader
        title="Add Stop"
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/distribution'))}
      />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* mode toggle */}
        <View style={styles.modeRow}>
          <TouchableOpacity
            style={[styles.modeBtn, mode === 'existing' && styles.modeBtnActive]}
            onPress={() => setMode('existing')}
            testID="mode-existing"
          >
            <ThemedText style={[styles.modeText, mode === 'existing' && styles.modeTextActive]}>Existing customer</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeBtn, mode === 'new' && styles.modeBtnActive]}
            onPress={() => setMode('new')}
            testID="mode-new"
          >
            <ThemedText style={[styles.modeText, mode === 'new' && styles.modeTextActive]}>New customer</ThemedText>
          </TouchableOpacity>
        </View>

        {mode === 'existing' ? (
          <View>
            <TextInput
              style={styles.input}
              placeholder="Search customers…"
              placeholderTextColor="#9ca3af"
              value={search}
              onChangeText={setSearch}
              testID="input-search"
            />
            <View style={styles.list}>
              {customers.length === 0 ? (
                <ThemedText style={styles.empty}>No customers match.</ThemedText>
              ) : (
                customers.map((c) => (
                  <TouchableOpacity
                    key={c.uuid}
                    style={[styles.listItem, customerUuid === c.uuid && styles.listItemActive]}
                    onPress={() => setCustomerUuid(c.uuid)}
                    testID={`customer-${c.uuid}`}
                  >
                    <ThemedText style={styles.listName}>{c.company_name || c.full_name}</ThemedText>
                    <ThemedText style={styles.listSub}>{c.full_name}{c.phone_number ? ` · ${c.phone_number}` : ''}</ThemedText>
                  </TouchableOpacity>
                ))
              )}
            </View>
          </View>
        ) : (
          <View>
            <TextInput style={styles.input} placeholder="Company / shop name *" placeholderTextColor="#9ca3af"
              value={newCustomer.company_name} onChangeText={(t) => setNewCustomer((p) => ({ ...p, company_name: t }))} testID="input-company" />
            <TextInput style={styles.input} placeholder="Contact full name *" placeholderTextColor="#9ca3af"
              value={newCustomer.full_name} onChangeText={(t) => setNewCustomer((p) => ({ ...p, full_name: t }))} testID="input-fullname" />
            <TextInput style={styles.input} placeholder="Phone number *" placeholderTextColor="#9ca3af" keyboardType="phone-pad"
              value={newCustomer.phone_number} onChangeText={(t) => setNewCustomer((p) => ({ ...p, phone_number: t }))} testID="input-phone" />
            <ThemedText style={styles.fieldLabel}>Category *</ThemedText>
            <View style={styles.chipWrap}>
              {categories.map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[styles.chip, newCustomer.category === c && styles.chipActive]}
                  onPress={() => setNewCustomer((p) => ({ ...p, category: c }))}
                  testID={`category-${c}`}
                >
                  <ThemedText style={[styles.chipText, newCustomer.category === c && styles.chipTextActive]}>{c}</ThemedText>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput style={styles.input} placeholder="Address (optional)" placeholderTextColor="#9ca3af"
              value={newCustomer.full_address} onChangeText={(t) => setNewCustomer((p) => ({ ...p, full_address: t }))} testID="input-address" />
          </View>
        )}

        {/* location */}
        <ThemedText style={styles.fieldLabel}>Location (lat,lon) — used if the customer has no saved location</ThemedText>
        <View style={styles.coordRow}>
          <TextInput
            style={[styles.input, styles.coordInput]}
            placeholder="e.g. 33.5138,36.2765"
            placeholderTextColor="#9ca3af"
            value={coords}
            onChangeText={setCoords}
            testID="input-coords"
          />
          <TouchableOpacity style={styles.locBtn} onPress={captureLocation} testID="button-locate">
            <ThemedText style={styles.locBtnText}>📍</ThemedText>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.submit, !canSubmit && styles.submitDisabled]}
          onPress={submit}
          disabled={!canSubmit}
          testID="button-submit-add-stop"
        >
          {submitting ? <ActivityIndicator color="#fff" /> : <ThemedText style={styles.submitText}>Add Stop</ThemedText>}
        </TouchableOpacity>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  modeRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  modeBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(84,105,212,0.4)', alignItems: 'center' },
  modeBtnActive: { backgroundColor: '#5469D4', borderColor: '#5469D4' },
  modeText: { fontSize: 14, color: '#5469D4', fontWeight: '600' },
  modeTextActive: { color: '#fff' },
  input: {
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.15)', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 11, fontSize: 15, backgroundColor: '#fff', color: '#111827', marginBottom: 10,
  },
  list: { borderWidth: 1, borderColor: 'rgba(0,0,0,0.1)', borderRadius: 10, overflow: 'hidden' },
  empty: { padding: 14, opacity: 0.6 },
  listItem: { paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(0,0,0,0.06)' },
  listItemActive: { backgroundColor: 'rgba(84,105,212,0.1)' },
  listName: { fontSize: 14, fontWeight: '600' },
  listSub: { fontSize: 12, opacity: 0.6, marginTop: 2 },
  fieldLabel: { fontSize: 13, fontWeight: '600', marginTop: 6, marginBottom: 8 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(0,0,0,0.12)' },
  chipActive: { backgroundColor: '#5469D4', borderColor: '#5469D4' },
  chipText: { fontSize: 13, color: '#374151' },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  coordRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  coordInput: { flex: 1 },
  locBtn: { borderWidth: 1, borderColor: 'rgba(0,0,0,0.15)', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, backgroundColor: '#fff' },
  locBtnText: { fontSize: 18 },
  submit: { marginTop: 16, backgroundColor: '#5469D4', borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  submitDisabled: { opacity: 0.5 },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
