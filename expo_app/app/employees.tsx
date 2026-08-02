import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ThemedText } from '@/components/ThemedText';
import { ModuleListScreen } from '@/components/ModuleListScreen';
import { BottomNavigation } from '@/components/layout/BottomNavigation';
import { useLanguage } from '@/contexts/LanguageContext';

interface Employee {
  uuid: string;
  full_name: string;
  role?: string | null;
  phone_number?: string | null;
  email_address?: string | null;
}

/**
 * Staff records. Distinct from app users: an employee is a person the business
 * employs, a user is a login. The two are separate resources with separate
 * permissions, which is why this screen cannot resolve who created what.
 */
export default function EmployeesScreen() {
  const router = useRouter();
  const { t, tef } = useLanguage();

  return (
    <View style={styles.root}>
      <ModuleListScreen<Employee>
        module="employees"
        title={t('menu.employees')}
        endpoint="/employee/"
        itemsKey="employees"
        searchParam="full_name"
        searchPlaceholder={t('employees.searchPlaceholder')}
        filters={[
          { id: 'driver', label: tef('driver'), params: { role: 'driver' } },
          { id: 'sales', label: tef('sales'), params: { role: 'sales' } },
          { id: 'accountant', label: tef('accountant'), params: { role: 'accountant' } },
          { id: 'manager', label: tef('manager'), params: { role: 'manager' } },
        ]}
        keyExtractor={(x) => x.uuid}
        renderItem={(x) => (
          <TouchableOpacity
            style={styles.card}
            activeOpacity={0.7}
            onPress={() => router.push(`/employees/${x.uuid}`)}
            testID={`employees-${x.uuid}`}
          >
            <View style={styles.cardTop}>
              <ThemedText style={styles.title} numberOfLines={1}>
                {x.full_name}
              </ThemedText>
            </View>
            <View style={styles.cardBottom}>
              <ThemedText style={styles.subtitle} numberOfLines={1}>
                {x.phone_number || x.email_address || '—'}
              </ThemedText>
              {!!x.role && <ThemedText style={styles.badge}>{tef(x.role)}</ThemedText>}
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
