import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ThemedText } from '@/components/ThemedText';
import { ModuleListScreen } from '@/components/ModuleListScreen';
import { BottomNavigation } from '@/components/layout/BottomNavigation';
import { useLanguage } from '@/contexts/LanguageContext';

interface Vehicle {
  uuid: string;
  plate_number: string;
  status?: string | null;
  make?: string | null;
  model?: string | null;
  year?: number | null;
  color?: string | null;
}

/**
 * The fleet.
 *
 * Note the page key is `items`, not `vehicles` — this endpoint does not follow the
 * plural-resource convention every other list uses, and assuming otherwise yields
 * an empty list with a 200.
 */
export default function VehiclesScreen() {
  const router = useRouter();
  const { t, tef } = useLanguage();

  return (
    <View style={styles.root}>
      <ModuleListScreen<Vehicle>
        module="vehicles"
        title={t('menu.vehicles')}
        endpoint="/vehicle/"
        itemsKey="items"
        onCreate={() => router.push('/vehicles/create')}
        searchParam="plate_number"
        searchPlaceholder={t('vehicles.searchPlaceholder')}
        filters={[
          { id: 'active', label: tef('active'), params: { status: 'active' } },
          { id: 'maintenance', label: tef('maintenance'), params: { status: 'maintenance' } },
          { id: 'inactive', label: tef('inactive'), params: { status: 'inactive' } },
          // the remaining three VehicleStatus values — the enum has six and the list
          // offered three, so sold/retired/utilized vehicles were unreachable by filter
          { id: 'sold', label: tef('sold'), params: { status: 'sold' } },
          { id: 'retired', label: tef('retired'), params: { status: 'retired' } },
          { id: 'utilized', label: tef('utilized'), params: { status: 'utilized' } },
        ]}
        keyExtractor={(x) => x.uuid}
        renderItem={(x) => (
          <TouchableOpacity
            style={styles.card}
            activeOpacity={0.7}
            onPress={() => router.push(`/vehicles/${x.uuid}`)}
            testID={`vehicles-${x.uuid}`}
          >
            <View style={styles.cardTop}>
              <ThemedText style={styles.title} numberOfLines={1}>
                {x.plate_number}
              </ThemedText>
            </View>
            <View style={styles.cardBottom}>
              <ThemedText style={styles.subtitle} numberOfLines={1}>
                {[x.make, x.model, x.year].filter(Boolean).join(' ') || '—'}
              </ThemedText>
              {!!x.status && <ThemedText style={styles.badge}>{tef(x.status)}</ThemedText>}
            </View>
          </TouchableOpacity>
        )}
      />
      <BottomNavigation activeTab="menu" onTabPress={() => router.replace('/(tabs)?tab=menu')} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  title: { flex: 1, fontSize: 16, fontWeight: '600', color: '#1f2937' },
  value: { fontSize: 16, fontWeight: '700', color: '#1f2937' },
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  subtitle: { flex: 1, fontSize: 13, opacity: 0.55 },
  badge: {
    fontSize: 11,
    fontWeight: '600',
    color: '#4b5563',
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: 'hidden',
  },
});
