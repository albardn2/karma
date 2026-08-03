import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { ModuleGuard } from '@/components/ModuleGuard';
import { ModuleForm, FormField } from '@/components/ModuleForm';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiCall, isOk } from '@/utils/api';

interface Config {
  trip_cadence_seconds?: number | null;
  history_cadence_seconds?: number | null;
  history_retention_days?: number | null;
}

/**
 * How often driver positions are stored, and how long history is kept.
 *
 * Three numbers, and each one costs money or fidelity: a tighter cadence stores more
 * rows, a longer retention keeps them longer. That is the whole panel on the web too.
 *
 * WHOSE CONFIG THIS IS, which the web panel does not say and which matters: the route
 * resolves the config with `LocationTrackingConfig.account_uuid == uow.account_uuid`, so
 * it reads and writes THE CALLER'S OWN account. It cannot configure another tenant's
 * tracking — there is no per-account parameter and no route that takes one. In this
 * deployment every superuser sits inside the operator's own company, so in practice this
 * is that company's setting, and the screen says so rather than implying it is
 * platform-wide.
 *
 * The route is superuser-only on both verbs, so even a tenant admin is refused; the
 * screen is gated to match. A refusal can arrive with either of two messages depending on
 * which gate fires first, so nothing here reads the 403 body — any 403 means "not the
 * platform owner".
 *
 * The form is seeded from the current values because a PUT that omits a field leaves it
 * unchanged — showing empty inputs over live settings would invite someone to "fill in"
 * a number they never meant to change. That reasoning is why the GET failing has to be
 * its own state: treating a 403 or a 500 as "loaded, with nothing in it" would put empty
 * inputs over live settings, which is precisely what seeding avoids.
 *
 * The bounds are enforced client-side as well as stated in the labels. The server rejects
 * an out-of-range value rather than clamping it, and its 422 does not say which field was
 * at fault, so the same constraint has to exist on both sides to be reportable.
 */
export default function TrackingConfigScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const [config, setConfig] = useState<Config | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    const res = await apiCall<Config>('/location/config');
    if (isOk(res.status) && res.data) setConfig(res.data);
    else setFailed(true);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const fields: FormField[] = [
    {
      name: 'trip_cadence_seconds',
      label: t('tracking.tripCadence'),
      kind: 'number',
      integer: true,
      min: 1,
      max: 3600,
    },
    {
      name: 'history_cadence_seconds',
      label: t('tracking.historyCadence'),
      kind: 'number',
      integer: true,
      min: 1,
      max: 86400,
    },
    {
      name: 'history_retention_days',
      label: t('tracking.retention'),
      kind: 'number',
      integer: true,
      min: 1,
      max: 365,
    },
  ];

  // wait for the current values before mounting the form: ModuleForm seeds its state once,
  // from `initial`, so rendering it early would leave the inputs permanently blank
  if (loading || failed) {
    return (
      <ModuleGuard requireScope="superuser">
        <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
          <Stack.Screen options={{ headerShown: false }} />
          <View style={styles.topBar}>
            <TouchableOpacity onPress={() => router.back()} hitSlop={12} testID="tracking-back">
              <ThemedText style={styles.back}>‹</ThemedText>
            </TouchableOpacity>
            <ThemedText style={styles.topTitle} numberOfLines={1}>
              {t('superAdmin.tabTracking')}
            </ThemedText>
            <View style={styles.backSpacer} />
          </View>
          <View style={styles.centre}>
            {loading ? (
              <ActivityIndicator size="large" color="#5469D4" />
            ) : (
              <>
                <ThemedText style={styles.stateText} testID="tracking-error">
                  {t('tracking.loadFailed')}
                </ThemedText>
                <TouchableOpacity style={styles.retry} onPress={() => load()}>
                  <ThemedText style={styles.retryText}>{t('moduleList.retry')}</ThemedText>
                </TouchableOpacity>
              </>
            )}
          </View>
        </ThemedView>
      </ModuleGuard>
    );
  }

  return (
    <ModuleForm
      requireScope="superuser"
      title={t('superAdmin.tabTracking')}
      note={t('tracking.note')}
      fields={fields}
      initial={{
        trip_cadence_seconds: config?.trip_cadence_seconds ?? '',
        history_cadence_seconds: config?.history_cadence_seconds ?? '',
        history_retention_days: config?.history_retention_days ?? '',
      }}
      method="PUT"
      endpoint="/location/config"
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 },
  back: { fontSize: 30, lineHeight: 34, color: '#5469D4', fontWeight: '700' },
  backSpacer: { width: 24 },
  topTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '600' },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 12 },
  stateText: { fontSize: 14, opacity: 0.6, textAlign: 'center', lineHeight: 20 },
  retry: {
    backgroundColor: '#5469D4',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },
  retryText: { color: '#fff', fontWeight: '600' },
});
