import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { ModuleGuard } from '@/components/ModuleGuard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiCall, isOk } from '@/utils/api';

interface Preset {
  modules?: string[];
  /** resource -> list of actions */
  endpoints?: Record<string, string[]>;
}

interface RolePreset {
  role: string;
  is_overridden: boolean;
  /** how many users currently carry this role */
  following: number;
  permissions: Preset;
  baseline: Preset;
}

const grants = (p?: Preset) =>
  Object.values(p?.endpoints ?? {}).reduce((n, a) => n + (a?.length ?? 0), 0);

/**
 * What each role gets by default, and a way to put it back.
 *
 * Deliberately NOT an editor. The web panel renders the full matrix — 38 resources by 4
 * actions, plus 29 module toggles, plus row- and column-wide select-alls: getting on for
 * two hundred tap targets for ONE role, and there are eight. That is not a phone screen,
 * and the danger is not just fiddliness: a mis-tapped column select-all grants delete on
 * every resource at once, and nothing on a phone-sized view would show you the diff you
 * just made. The matrix stays on the web.
 *
 * What does fit is the part an operator actually needs away from a desk: which roles have
 * been changed from the generated baseline, how many people are on each, how wide each
 * one is — and the one safe corrective action, resetting a role back to that baseline.
 *
 * The baseline itself is GENERATED from the @scopes_required decorators on the routes, so
 * "reset" is not "clear" — it restores what the code says the role should have, which is
 * why offering it without offering the editor is coherent rather than half a feature.
 *
 * The list is not paginated (it returns all eight roles), so this is a plain screen
 * rather than a ModuleListScreen pretending otherwise.
 */
export default function RolePresetsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t, tef } = useLanguage();
  const [roles, setRoles] = useState<RolePreset[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    setFailed(false);
    const res = await apiCall<{ roles: RolePreset[] }>('/super-admin/settings/role-presets');
    if (isOk(res.status)) setRoles(res.data?.roles ?? []);
    else setFailed(true);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const reset = async (role: string) => {
    setBusy(role);
    const res = await apiCall(`/super-admin/settings/role-presets/${role}`, { method: 'DELETE' });
    setBusy(null);
    // the response carries the resolved presets, but a refetch is cheaper to reason about
    // than trusting one payload to be the whole truth after a cache invalidation
    if (isOk(res.status)) load(true);
    else Alert.alert(t('roles.resetFailed'), String(res.error ?? '').slice(0, 300));
  };

  const confirmReset = (role: string) =>
    Alert.alert(t('roles.reset'), t('roles.resetConfirm', { role: tef(role) }), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('roles.reset'), style: 'destructive', onPress: () => reset(role) },
    ]);

  return (
    <ModuleGuard requireScope="superuser">
      <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
        <Stack.Screen options={{ headerShown: false }} />

        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12} testID="roles-back">
            <ThemedText style={styles.back}>‹</ThemedText>
          </TouchableOpacity>
          <ThemedText style={styles.topTitle} numberOfLines={1}>
            {t('superAdmin.tabRoles')}
          </ThemedText>
          <View style={styles.backSpacer} />
        </View>

        {loading ? (
          <View style={styles.centre}>
            <ActivityIndicator size="large" color="#5469D4" />
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={[styles.body, { paddingBottom: 32 + insets.bottom }]}
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
            {failed ? (
              <View style={styles.centre}>
                <ThemedText style={styles.stateText} testID="roles-error">
                  {t('moduleList.failed')}
                </ThemedText>
                <TouchableOpacity style={styles.retry} onPress={() => load()}>
                  <ThemedText style={styles.retryText}>{t('moduleList.retry')}</ThemedText>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <ThemedText style={styles.note}>{t('roles.note')}</ThemedText>
                {(roles ?? []).map((r) => (
                  <View key={r.role} style={styles.card} testID={`role-${r.role}`}>
                    <View style={styles.cardHead}>
                      <ThemedText style={styles.role} numberOfLines={1}>
                        {tef(r.role)}
                      </ThemedText>
                      {r.is_overridden ? (
                        <ThemedText style={styles.changed}>{t('roles.changed')}</ThemedText>
                      ) : (
                        <ThemedText style={styles.default}>{t('roles.default')}</ThemedText>
                      )}
                    </View>
                    <ThemedText style={styles.meta}>
                      {t('roles.breadth', {
                        modules: r.permissions?.modules?.length ?? 0,
                        grants: grants(r.permissions),
                      })}
                      {' · '}
                      {t('roles.following', { n: r.following ?? 0 })}
                    </ThemedText>
                    {r.is_overridden && (
                      <TouchableOpacity
                        style={styles.resetBtn}
                        onPress={() => confirmReset(r.role)}
                        disabled={busy === r.role}
                        testID={`role-reset-${r.role}`}
                      >
                        <ThemedText style={styles.resetText}>
                          {busy === r.role ? t('roles.resetting') : t('roles.reset')}
                        </ThemedText>
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
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
  body: { paddingHorizontal: 20, paddingTop: 4, gap: 10 },
  note: { fontSize: 12, opacity: 0.6, lineHeight: 18, marginBottom: 4 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, gap: 6 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  role: { flex: 1, fontSize: 15, fontWeight: '700', color: '#1f2937' },
  changed: {
    fontSize: 11,
    fontWeight: '700',
    color: '#92400e',
    backgroundColor: '#fef3c7',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
    overflow: 'hidden',
  },
  default: { fontSize: 11, opacity: 0.5 },
  meta: { fontSize: 12, opacity: 0.6 },
  resetBtn: {
    alignSelf: 'flex-start',
    marginTop: 2,
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  resetText: { fontSize: 12, fontWeight: '700', color: '#dc2626' },
  centre: { alignItems: 'center', justifyContent: 'center', padding: 40, gap: 10 },
  stateText: { fontSize: 14, opacity: 0.6, textAlign: 'center' },
  retry: {
    backgroundColor: '#5469D4',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },
  retryText: { color: '#fff', fontWeight: '600' },
});
