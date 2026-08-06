import React, { useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/ThemedText';
import { ModuleListScreen } from '@/components/ModuleListScreen';
import { BottomNavigation } from '@/components/layout/BottomNavigation';
import { ServiceAreaCard, ServiceAreaRow } from '@/components/ServiceAreaCard';
import { ServiceAreasMap } from '@/components/ServiceAreasMap';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { useHasEndpoint } from '@/hooks/useModuleAccess';

type View2 = 'list' | 'map';

/**
 * Service areas — the polygons the business delivers into.
 *
 * TWO VIEWS OF ONE SET OF RECORDS, as tabs rather than as two routes. They answer
 * different questions: the list answers "which areas exist and how big are they", the
 * map answers "where are they and do they overlap" — and this corpus contains
 * overlapping and nested pairs that no table can reveal. Keeping both inside the one
 * scaffold means they share the same back chevron, record count and create button
 * instead of two screens reproducing all three and drifting apart.
 *
 * The tab is deep-linkable as `?view=map`, which is not only for convenience: it is the
 * only way to reach the map view without a tap, so the map can be opened directly from
 * a notification or a test.
 *
 * THE `+` IS DOUBLE-GATED, on the endpoint grant AND on admin, which is stricter than
 * the rest of the app. The endpoint check alone is nearly right — a driver holds only
 * `service_area: read` — but a hand-edited permission checklist can grant a non-admin
 * `create`, and the route refuses them regardless: POST, PUT and DELETE are
 * admin-or-superuser at the decorator. A button whose only possible outcome is a 403 is
 * worse than no button.
 */
export default function ServiceAreasScreen() {
  const router = useRouter();
  const { view } = useLocalSearchParams<{ view?: string }>();
  const { t } = useLanguage();
  const { isAdmin } = useAuth();
  const insets = useSafeAreaInsets();
  const canCreate = useHasEndpoint('service_area', 'create') && isAdmin;

  const [mode, setMode] = useState<View2>(view === 'map' ? 'map' : 'list');
  const tabs = (
    <View style={styles.tabs}>
      {(
        [
          ['list', t('serviceAreas.tabList')],
          ['map', t('serviceAreas.tabMap')],
        ] as const
      ).map(([id, label]) => (
        <TouchableOpacity
          key={id}
          style={[styles.tab, mode === id && styles.tabOn]}
          onPress={() => setMode(id)}
          testID={`sa-tab-${id}`}
        >
          <ThemedText style={[styles.tabText, mode === id && styles.tabTextOn]}>
            {label}
          </ThemedText>
        </TouchableOpacity>
      ))}
    </View>
  );

  return (
    <View style={styles.screen}>
      <ModuleListScreen<ServiceAreaRow>
        module="service-areas"
        title={t('menu.serviceAreas')}
        endpoint="/service-area/"
        itemsKey="items"
        searchParam="name"
        searchPlaceholder={t('serviceAreas.searchPlaceholder')}
        keyExtractor={(a) => a.uuid}
        onCreate={canCreate ? () => router.push('/service-areas/create') : undefined}
        tabs={tabs}
        // the map owns the whole body in map mode; the list's fetch still runs so the
        // header count stays truthful and the search survives a trip through the map
        body={
          mode === 'map' ? <ServiceAreasMap footerOffset={78 + insets.bottom} /> : undefined
        }
        renderItem={(a) => (
          <ServiceAreaCard area={a} onPress={() => router.push(`/service-areas/${a.uuid}`)} />
        )}
      />
      <BottomNavigation activeTab="menu" onTabPress={() => router.replace('/(tabs)?tab=menu')} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  // a segmented control rather than two chips: these are mutually exclusive views of
  // the same records, and chips in this app mean additive filters
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#E5E7EB',
    borderRadius: 10,
    padding: 3,
    marginHorizontal: 20,
    marginBottom: 12,
  },
  tab: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  tabOn: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  tabText: { fontSize: 13, fontWeight: '600', color: '#6B7280' },
  tabTextOn: { color: '#111827' },
});
