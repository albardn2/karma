import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ThemedText } from '@/components/ThemedText';
import { ModuleListScreen } from '@/components/ModuleListScreen';
import { BottomNavigation } from '@/components/layout/BottomNavigation';
import { useLanguage } from '@/contexts/LanguageContext';

interface User {
  uuid: string;
  username: string;
  first_name?: string | null;
  last_name?: string | null;
  phone_number?: string | null;
  permission_scope?: string | null;
  is_active?: boolean | null;
}

/**
 * The logins. Distinct from employees: an employee is a person on the payroll, a user is
 * a credential that can sign in — separate tables, separate permissions, and a person can
 * have one without the other.
 *
 * Admin-only, gated with requireAdmin rather than a module. The `users` module id exists in
 * the backend MODULES registry but nothing can ever grant it: RESOURCES deliberately has no
 * `auth` entry, with a comment saying user management stays admin-only. So the id is tickable
 * in the web permission editor and buys nobody access — a client gating on it would render a
 * screen whose every request 403s. The web sidebar has that bug; this does not port it.
 *
 * NO SEARCH BOX, deliberately. Every string filter on this endpoint is an exact,
 * case-sensitive match — `?username=drv` finds nothing when the row is `drv_test` — and there
 * is no LIKE, `search` or `q` param. Worse, the list DTO forbids unknown params, so inventing
 * one 422s the whole request. A search box wired to `username=` would return nothing for
 * every partial word and read as a broken screen.
 */
export default function UsersScreen() {
  const router = useRouter();
  const { t, tef } = useLanguage();

  return (
    <View style={styles.root}>
      <ModuleListScreen<User>
        requireAdmin
        title={t('menu.users')}
        endpoint="/auth/users"
        itemsKey="users"
        header={<ThemedText style={styles.note}>{t('users.filterNote')}</ThemedText>}
        filters={[
          // Field roles only. There is deliberately no "Admins" chip: the filter matches
          // permission_scope exactly, and a third of the admins here hold the composite
          // value "superuser,admin", which `permission_scope=admin` does not return. A
          // chip that silently omits a third of its own category is worse than no chip.
          { id: 'driver', label: tef('driver'), params: { permission_scope: 'driver' } },
          { id: 'sales', label: tef('sales'), params: { permission_scope: 'sales' } },
          { id: 'accountant', label: tef('accountant'), params: { permission_scope: 'accountant' } },
          { id: 'inactive', label: t('users.deactivated'), params: { is_active: 'false' } },
        ]}
        keyExtractor={(u) => u.uuid}
        renderItem={(u) => {
          const name = `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim();
          // one person can hold several roles as a comma-joined string, and tef() has no
          // entry for the joined form — split so each part gets its own translation
          const roles = String(u.permission_scope ?? '')
            .split(',')
            .map((s) => tef(s.trim()))
            .filter(Boolean)
            .join(' · ');
          return (
            <TouchableOpacity
              style={styles.card}
              activeOpacity={0.7}
              onPress={() => router.push(`/users/${u.uuid}`)}
              testID={`users-${u.uuid}`}
            >
              <View style={styles.cardTop}>
                <ThemedText style={styles.title} numberOfLines={1}>
                  {name || u.username}
                </ThemedText>
                {u.is_active === false && (
                  <ThemedText style={styles.off}>{t('users.deactivated')}</ThemedText>
                )}
              </View>
              <View style={styles.cardBottom}>
                <ThemedText style={styles.subtitle} numberOfLines={1}>
                  {`@${u.username}`}
                  {u.phone_number ? ` · ${u.phone_number}` : ''}
                </ThemedText>
                {!!roles && <ThemedText style={styles.badge}>{roles}</ThemedText>}
              </View>
            </TouchableOpacity>
          );
        }}
      />
      <BottomNavigation activeTab="menu" onTabPress={() => router.replace('/(tabs)?tab=menu')} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  note: { fontSize: 12, opacity: 0.6, lineHeight: 18, marginBottom: 12 },
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
  off: {
    fontSize: 11,
    fontWeight: '700',
    color: '#dc2626',
    backgroundColor: '#fee2e2',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: 'hidden',
  },
});
