import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ThemedText } from '@/components/ThemedText';
import { ModuleListScreen } from '@/components/ModuleListScreen';
import { BottomNavigation } from '@/components/layout/BottomNavigation';
import { useLanguage } from '@/contexts/LanguageContext';

interface Vendor {
  uuid: string;
  company_name: string;
  full_name?: string | null;
  phone_number?: string | null;
  category?: string | null;
  email_address?: string | null;
  full_address?: string | null;
}

/**
 * Suppliers.
 *
 * company_name is the row title and the search field — the only free-text filter
 * this endpoint offers is a per-column ILIKE, so search maps to that one column
 * rather than pretending to be a general search.
 */
export default function VendorsScreen() {
  const router = useRouter();
  const { t, tef } = useLanguage();

  return (
    <View style={styles.root}>
      <ModuleListScreen<Vendor>
        module="vendors"
        title={t('menu.vendors')}
        endpoint="/vendor/"
        itemsKey="vendors"
        searchParam="company_name"
        searchPlaceholder={t('vendors.searchPlaceholder')}
        filters={[
          { id: 'raw', label: tef('raw_materials'), params: { category: 'raw_materials' } },
          { id: 'equipment', label: tef('equipment'), params: { category: 'equipment' } },
          { id: 'services', label: tef('services'), params: { category: 'services' } },
          { id: 'other', label: tef('other'), params: { category: 'other' } },
        ]}
        keyExtractor={(x) => x.uuid}
        renderItem={(x) => (
          <TouchableOpacity
            style={styles.card}
            activeOpacity={0.7}
            onPress={() => router.push(`/vendors/${x.uuid}`)}
            testID={`vendors-${x.uuid}`}
          >
            <View style={styles.cardTop}>
              <ThemedText style={styles.title} numberOfLines={1}>
                {x.company_name}
              </ThemedText>
            </View>
            <View style={styles.cardBottom}>
              <ThemedText style={styles.subtitle} numberOfLines={1}>
                {x.full_name || x.phone_number || '—'}
              </ThemedText>
              {!!x.category && <ThemedText style={styles.badge}>{tef(x.category)}</ThemedText>}
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
