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
import * as Location from 'expo-location';

function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6371; // km
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLon = ((bLon - aLon) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

interface CustomerRow {
  uuid: string;
  company_name?: string;
  full_name?: string;
  phone_number?: string;
  coordinates?: string | null; // "lat,lon"
}

export default function AddStopScreen() {
  const router = useRouter();
  const { t } = useLanguage();
  const { executionUuid } = useLocalSearchParams<{ executionUuid?: string }>();

  const [mode, setMode] = useState<'existing' | 'new'>('existing');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [customerUuid, setCustomerUuid] = useState('');
  const [coords, setCoords] = useState('');
  const [userLoc, setUserLoc] = useState<{ lat: number; lon: number } | null>(null);
  const [locDenied, setLocDenied] = useState(false);
  const [categories, setCategories] = useState<string[]>([]);
  const [newCustomer, setNewCustomer] = useState({ company_name: '', full_name: '', phone_number: '', category: '', full_address: '' });
  const [submitting, setSubmitting] = useState(false);

  // Capture device location via expo-location (navigator.geolocation is not
  // available on native). Seeds the stop coordinates AND drives the
  // nearest-first customer sort.
  const fetchDeviceLocation = useCallback(async (opts?: { prompt?: boolean }) => {
    try {
      let granted = (await Location.getForegroundPermissionsAsync()).status === 'granted';
      if (!granted && opts?.prompt) {
        granted = (await Location.requestForegroundPermissionsAsync()).status === 'granted';
      }
      if (!granted) {
        setLocDenied(true);
        return;
      }
      setLocDenied(false);
      // Bound the GPS fix: a cold fix can hang for a long time (notably on the
      // simulator). Race against a timeout and fall back to the last known
      // position so the nearest-customers list still populates.
      const pos =
        (await Promise.race([
          Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 6000)),
        ])) || (await Location.getLastKnownPositionAsync());
      if (!pos) {
        // Permission granted but no fix available → fall back to recent list.
        setLocDenied(true);
        return;
      }
      const { latitude, longitude } = pos.coords;
      setUserLoc({ lat: latitude, lon: longitude });
      setCoords(`${latitude.toFixed(6)},${longitude.toFixed(6)}`);
    } catch {
      setLocDenied(true);
    }
  }, []);

  useEffect(() => {
    fetchDeviceLocation({ prompt: true });
  }, [fetchDeviceLocation]);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (mode !== 'existing') return;
    let cancelled = false;
    (async () => {
      let url: string;
      if (debounced) {
        // Search takes precedence: match any customer by name.
        url = `/customer/?page=1&per_page=50&company_name=${encodeURIComponent(debounced)}`;
      } else if (userLoc) {
        // No search → the 5 customers nearest the driver's current location.
        url = `/customer/?page=1&per_page=5&near=${encodeURIComponent(`${userLoc.lat},${userLoc.lon}`)}`;
      } else {
        // No search and no location yet → fall back to the 5 most recent.
        url = `/customer/?page=1&per_page=5`;
      }
      const res = await apiCall<{ customers: CustomerRow[] }>(url);
      if (!cancelled) setCustomers(res.data?.customers || []);
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, debounced, userLoc]);

  useEffect(() => {
    if (mode !== 'new' || categories.length) return;
    (async () => {
      const res = await apiCall<string[]>('/customer/categories');
      setCategories(res.data || []);
    })();
  }, [mode, categories.length]);

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
      const res = await apiCall<{ status?: string }>(`/workflow-execution/${executionUuid}/manual-stop`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      if (res.status !== 201 && res.status !== 200) throw new Error(res.error || t('addstop.failedToAddStop'));
      // when the customer was already on the route the backend promotes the
      // existing stop instead of adding a duplicate — let the driver know.
      const outcome = res.data?.status;
      if (outcome === 'promoted' || outcome === 'already_current') {
        Alert.alert(
          t('addstop.alreadyOnRouteTitle'),
          outcome === 'already_current'
            ? t('addstop.alreadyCurrentStop')
            : t('addstop.promotedToCurrentStop'),
          [{ text: t('addstop.ok'), onPress: () => router.back() }]
        );
      } else {
        router.back();
      }
    } catch (e: any) {
      Alert.alert(t('addstop.errorTitle'), e?.message || t('addstop.couldNotAddStop'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <NativeHeader
        title={t('addstop.title')}
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
            <ThemedText style={[styles.modeText, mode === 'existing' && styles.modeTextActive]}>{t('addstop.existingCustomer')}</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeBtn, mode === 'new' && styles.modeBtnActive]}
            onPress={() => setMode('new')}
            testID="mode-new"
          >
            <ThemedText style={[styles.modeText, mode === 'new' && styles.modeTextActive]}>{t('addstop.newCustomer')}</ThemedText>
          </TouchableOpacity>
        </View>

        {mode === 'existing' ? (
          <View>
            <TextInput
              style={styles.input}
              placeholder={t('addstop.searchCustomersPlaceholder')}
              placeholderTextColor="#9ca3af"
              value={search}
              onChangeText={setSearch}
              testID="input-search"
            />
            <ThemedText style={styles.listLabel} testID="list-label">
              {debounced
                ? t('addstop.searchResults')
                : userLoc
                ? t('addstop.nearestCustomers')
                : locDenied
                ? t('addstop.recentCustomersEnableLocation')
                : t('addstop.recentCustomers')}
            </ThemedText>
            <View style={styles.list}>
              {customers.length === 0 ? (
                <ThemedText style={styles.empty}>
                  {debounced ? t('addstop.noCustomersMatch') : t('addstop.noCustomersToShow')}
                </ThemedText>
              ) : (
                customers.map((c) => {
                  let distLabel = '';
                  if (userLoc && c.coordinates) {
                    const [la, lo] = c.coordinates.split(',').map((x) => parseFloat(x));
                    if (Number.isFinite(la) && Number.isFinite(lo)) {
                      const km = haversineKm(userLoc.lat, userLoc.lon, la, lo);
                      distLabel = km < 1
                        ? ` · ${t('addstop.distanceMeters', { value: Math.round(km * 1000) })}`
                        : ` · ${t('addstop.distanceKilometers', { value: km.toFixed(1) })}`;
                    }
                  }
                  return (
                    <TouchableOpacity
                      key={c.uuid}
                      style={[styles.listItem, customerUuid === c.uuid && styles.listItemActive]}
                      onPress={() => setCustomerUuid(c.uuid)}
                      testID={`customer-${c.uuid}`}
                    >
                      <ThemedText style={styles.listName}>{c.company_name || c.full_name}</ThemedText>
                      <ThemedText style={styles.listSub}>{c.full_name}{c.phone_number ? ` · ${c.phone_number}` : ''}{distLabel}</ThemedText>
                    </TouchableOpacity>
                  );
                })
              )}
            </View>
          </View>
        ) : (
          <View>
            <TextInput style={styles.input} placeholder={t('addstop.companyNamePlaceholder')} placeholderTextColor="#9ca3af"
              value={newCustomer.company_name} onChangeText={(text) => setNewCustomer((p) => ({ ...p, company_name: text }))} testID="input-company" />
            <TextInput style={styles.input} placeholder={t('addstop.contactFullNamePlaceholder')} placeholderTextColor="#9ca3af"
              value={newCustomer.full_name} onChangeText={(text) => setNewCustomer((p) => ({ ...p, full_name: text }))} testID="input-fullname" />
            <TextInput style={styles.input} placeholder={t('addstop.phoneNumberPlaceholder')} placeholderTextColor="#9ca3af" keyboardType="phone-pad"
              value={newCustomer.phone_number} onChangeText={(text) => setNewCustomer((p) => ({ ...p, phone_number: text }))} testID="input-phone" />
            <ThemedText style={styles.fieldLabel}>{t('addstop.categoryLabel')}</ThemedText>
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
            <TextInput style={styles.input} placeholder={t('addstop.addressPlaceholder')} placeholderTextColor="#9ca3af"
              value={newCustomer.full_address} onChangeText={(text) => setNewCustomer((p) => ({ ...p, full_address: text }))} testID="input-address" />
          </View>
        )}

        <TouchableOpacity
          style={[styles.submit, !canSubmit && styles.submitDisabled]}
          onPress={submit}
          disabled={!canSubmit}
          testID="button-submit-add-stop"
        >
          {submitting ? <ActivityIndicator color="#fff" /> : <ThemedText style={styles.submitText}>{t('addstop.addStop')}</ThemedText>}
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
  listLabel: { fontSize: 12, fontWeight: '600', opacity: 0.55, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 },
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
  submit: { marginTop: 16, backgroundColor: '#5469D4', borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  submitDisabled: { opacity: 0.5 },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
