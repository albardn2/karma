import React, { useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ThemedText } from '@/components/ThemedText';
import { ModuleListScreen } from '@/components/ModuleListScreen';
import { BottomNavigation } from '@/components/layout/BottomNavigation';
import { useLanguage } from '@/contexts/LanguageContext';

interface Material {
  uuid: string;
  name: string;
  sku?: string | null;
  measure_unit?: string | null;
  type?: string | null;
  description?: string | null;
}

/**
 * The product and raw-material catalogue.
 *
 * The other module warehouse_keeper is granted, and the one that makes the
 * inventory screen legible — a lot reads "palm oil, 75 kg" only because a material
 * defines that name and unit.
 *
 * This is the first module with a real search box. Materials is one of the few list
 * endpoints that accepts a `name` filter; the ones built before it do not, and
 * guessing wrong 422s the request rather than being ignored, so the box is here
 * only because the API was checked.
 */
export default function MaterialsScreen() {
  const router = useRouter();
  const { t, tef } = useLanguage();
  // both are real, verified list-DTO filters (ilike-contains); the toggle decides
  // which one the search box feeds
  const [searchMode, setSearchMode] = useState<'name' | 'sku'>('name');

  return (
    <View style={styles.root}>
      <ModuleListScreen<Material>
        module="materials"
        title={t('menu.materials')}
        endpoint="/material/"
        itemsKey="materials"
        onCreate={() => router.push('/materials/create')}
        searchParam={searchMode}
        searchPlaceholder={
          searchMode === 'name'
            ? t('materials.searchPlaceholder')
            : t('materials.searchBySkuPlaceholder')
        }
        header={
          <View style={styles.modeRow}>
            {(['name', 'sku'] as const).map((m) => (
              <TouchableOpacity
                key={m}
                style={[styles.modeChip, searchMode === m && styles.modeChipOn]}
                onPress={() => setSearchMode(m)}
                testID={`material-search-${m}`}
              >
                <ThemedText style={[styles.modeText, searchMode === m && styles.modeTextOn]}>
                  {m === 'name' ? t('materials.name') : t('materials.sku')}
                </ThemedText>
              </TouchableOpacity>
            ))}
          </View>
        }
        filters={[
          // all five MaterialType values — the last two were missing, so machinery and
          // vehicles were reachable only by scrolling
          { id: 'product', label: t('materials.product'), params: { type: 'product' } },
          { id: 'raw', label: t('materials.rawMaterial'), params: { type: 'raw_material' } },
          { id: 'prepared', label: tef('prepared'), params: { type: 'prepared' } },
          {
            id: 'machinery',
            label: tef('machinery_and_equipment'),
            params: { type: 'machinery_and_equipment' },
          },
          { id: 'vehicle', label: tef('vehicle'), params: { type: 'vehicle' } },
        ]}
        keyExtractor={(m) => m.uuid}
        renderItem={(m) => (
          <TouchableOpacity
            style={styles.card}
            activeOpacity={0.7}
            onPress={() => router.push(`/materials/${m.uuid}`)}
            testID={`material-${m.uuid}`}
          >
            <View style={styles.cardTop}>
              <ThemedText style={styles.name} numberOfLines={1}>
                {m.name}
              </ThemedText>
              {!!m.measure_unit && (
                <ThemedText style={styles.unit}>{m.measure_unit}</ThemedText>
              )}
            </View>
            <View style={styles.cardBottom}>
              <ThemedText style={styles.sku} numberOfLines={1}>
                {m.sku || '—'}
              </ThemedText>
              {!!m.type && (
                <ThemedText
                  style={[
                    styles.badge,
                    m.type === 'product' ? styles.badgeProduct : styles.badgeRaw,
                  ]}
                >
                  {tef(m.type)}
                </ThemedText>
              )}
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
  modeRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  modeChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
  },
  modeChipOn: { backgroundColor: '#5469D4', borderColor: '#5469D4' },
  modeText: { fontSize: 12, fontWeight: '600', color: '#374151' },
  modeTextOn: { color: '#fff' },
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
  name: { flex: 1, fontSize: 16, fontWeight: '600', color: '#1f2937' },
  unit: { fontSize: 14, fontWeight: '600', opacity: 0.6 },
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  sku: { flex: 1, fontSize: 12, opacity: 0.5 },
  badge: {
    fontSize: 11,
    fontWeight: '600',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: 'hidden',
  },
  badgeProduct: { backgroundColor: '#dbeafe', color: '#1e40af' },
  badgeRaw: { backgroundColor: '#f3e8ff', color: '#6b21a8' },
});
