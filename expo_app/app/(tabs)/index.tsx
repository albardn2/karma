import React, { useState, useMemo } from 'react';
import { Platform } from 'react-native';
import { StyleSheet, ScrollView, TouchableOpacity, View, Alert } from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { WelcomeContent } from '@/components/WelcomeContent';
import { BottomNavigation } from '@/components/layout/BottomNavigation';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useLanguage } from '@/contexts/LanguageContext';
import { Lang, LANGUAGE_LABELS } from '@/i18n/translations';
import { useGrantedModules } from '@/hooks/useModuleAccess';

interface MenuItem {
  id: number;
  titleKey: string;
  icon: string;
  section: string;
  color: string;
  adminOnly?: boolean;
  /** Menu-module id this tile needs, matching the ids in the backend's MODULES. */
  module: string;
}

const ALL_MENU_ITEMS: MenuItem[] = [
  { id: 17, titleKey: 'menu.dashboard', icon: '📊', section: 'dashboard', color: '#334155', module: 'dashboard' },
  { id: 18, titleKey: 'menu.pricing', icon: '🏷️', section: 'pricing', color: '#7c2d12', module: 'pricing' },
  { id: 1, titleKey: 'menu.customers', icon: '👥', section: 'customers', color: '#5469D4', module: 'customers' },
  { id: 2, titleKey: 'menu.customerOrders', icon: '📋', section: 'customer_orders', color: '#e74c3c', module: 'customer-orders' },
  { id: 3, titleKey: 'menu.distribution', icon: '🚚', section: 'distribution', color: '#16a34a', module: 'workflow-execution' },
  { id: 4, titleKey: 'menu.trips', icon: '🗺️', section: 'trips', color: '#d97706', adminOnly: true, module: 'trips' },
  { id: 5, titleKey: 'menu.inventory', icon: '📦', section: 'inventory', color: '#0891b2', module: 'inventory' },
  { id: 6, titleKey: 'menu.materials', icon: '🧱', section: 'materials', color: '#7c3aed', module: 'materials' },
  { id: 7, titleKey: 'menu.payments', icon: '💵', section: 'payments', color: '#16a34a', module: 'payments' },
  { id: 8, titleKey: 'menu.inventoryEvents', icon: '🔄', section: 'inventory_events', color: '#0284c7', module: 'inventory-events' },
  { id: 9, titleKey: 'menu.vendors', icon: '🏭', section: 'vendors', color: '#b45309', module: 'vendors' },
  { id: 10, titleKey: 'menu.warehouses', icon: '🏬', section: 'warehouses', color: '#0f766e', module: 'warehouses' },
  { id: 11, titleKey: 'menu.employees', icon: '🧑‍🔧', section: 'employees', color: '#be185d', module: 'employees' },
  { id: 12, titleKey: 'menu.vehicles', icon: '🚐', section: 'vehicles', color: '#4338ca', module: 'vehicles' },
  { id: 13, titleKey: 'menu.financialAccounts', icon: '🏦', section: 'financial_accounts', color: '#065f46', module: 'financial-accounts' },
  { id: 14, titleKey: 'menu.expenses', icon: '🧾', section: 'expenses', color: '#c2410c', module: 'expenses' },
  { id: 15, titleKey: 'menu.payouts', icon: '💸', section: 'payouts', color: '#9f1239', module: 'payouts' },
  { id: 16, titleKey: 'menu.purchaseOrders', icon: '📥', section: 'purchase_orders', color: '#1d4ed8', module: 'purchase-orders' },
];

const LANGS: Lang[] = ['en', 'ar'];

// Field crews only work the trip flow, so their menu is capped at Distribution — capped,
// not fixed: it is still subject to the module filter below, so revoking Distribution
// from a driver empties their menu rather than being quietly ignored.
//
// sales_associate is here because a sales associate IS field crew — the rep visiting
// shops — and leaving it out would have handed them the full menu instead of the
// focused one `sales` gets.
//
// sales_manager is deliberately NOT here. A manager wants the wider menu, and that is
// the one place the two new sales roles genuinely differ: their API permissions are
// identical, their app menu is not.
//
// warehouse_keeper is not field crew either, and does not need to be listed: its
// preset grants none of the modules below, so the module filter leaves it with an
// empty menu — which is the honest answer, since the app is a distribution tool and
// its permissions deny customers, orders and trips outright.
const FIELD_ROLES = new Set(['sales', 'sales_associate', 'driver']);

export default function HomeScreen() {
  const { user, logout } = useAuth();
  const { t, lang, setLang } = useLanguage();
  const router = useRouter();
  // modules navigate back here with ?tab=menu so the menu view is restored
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  const [activeTab, setActiveTab] = useState<'home' | 'menu'>(tab === 'menu' ? 'menu' : 'home');
  const insets = useSafeAreaInsets();

  const granted = useGrantedModules();

  const menuItems: MenuItem[] = useMemo(() => {
    const scopes: string[] = (user?.permission_scope || '')
      .split(',')
      .map((s: string) => s.trim())
      .filter(Boolean);
    const fieldOnly = scopes.length > 0 && scopes.every((s) => FIELD_ROLES.has(s));
    const isAdmin = scopes.includes('admin') || scopes.includes('superuser');

    // Show only what this user's permissions will actually answer. The menu was
    // role-name-driven alone, so a role whose preset denies a resource was still
    // offered its tile: a warehouse keeper was shown Customers, and tapping it lands
    // on a screen whose every request 403s. Operator and operation_manager were being
    // offered Customer Orders on the same footing, which their presets also deny.
    //
    // Same rule as the web sidebar: the user's own grants intersected with the
    // account's feature cap, with null meaning unrestricted (admins, platform owner).
    return ALL_MENU_ITEMS.filter((i) => {
      // Field crew work the trip flow alone. This narrows the menu, it does not widen
      // it: an admin who revokes Distribution from a driver must actually lose the
      // tile. Returning early here instead — as this did — made the field menu an
      // override rather than an intersection, so a driver's menu was the one thing in
      // the app the console could never change.
      if (fieldOnly && i.section !== 'distribution') return false;
      if (i.adminOnly && !isAdmin) return false;
      return granted ? granted.includes(i.module) : true;
    });
  }, [user?.permission_scope, granted]);

  const handleLogout = () => {
    Alert.alert(
      t('menu.logout'),
      t('menu.logoutConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('menu.logout'),
          style: 'destructive',
          onPress: () => logout()
        },
      ]
    );
  };

  // Every tile's route is its section with underscores swapped for hyphens — verified
  // against all sixteen branches this replaced, which were mechanically identical. The
  // tile list is now the only place a module is declared, so a new one cannot be added
  // to the menu and then silently fail to navigate.
  const handleMenuPress = (item: MenuItem) => {
    router.push(`/${item.section.replace(/_/g, '-')}` as never);
  };

  const bottomPadding = useMemo(() => 
    Platform.OS === 'ios' 
      ? 60 + Math.max(insets.bottom, 8)
      : 68,
    [insets.bottom]
  );

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomPadding }]}
        showsVerticalScrollIndicator={false}
      >
        {activeTab === 'home' ? (
          <WelcomeContent />
        ) : (
          <View style={styles.menuContainer}>
            <View style={styles.menuSection}>
              <View style={styles.menuHeader}>
                <ThemedText style={styles.menuTitle}>{t('menu.modules')}</ThemedText>
              </View>

              <View style={styles.menuGrid}>
                {/* A role whose permissions cover none of the tiles above — a
                    warehouse keeper, say — would otherwise land on a blank screen
                    with no way to tell a missing grant from a broken app. */}
                {menuItems.length === 0 && (
                  <ThemedText style={styles.emptyMenu} testID="menu-empty">
                    {t('menu.nothingAvailable')}
                  </ThemedText>
                )}
                {menuItems.map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    style={styles.menuItem}
                    onPress={() => handleMenuPress(item)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.moduleIcon}>
                      <ThemedText style={styles.moduleIconText}>{item.icon}</ThemedText>
                    </View>
                    <ThemedText style={styles.moduleTitle}>{t(item.titleKey)}</ThemedText>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.menuSection}>
              <View style={styles.menuHeader}>
                <ThemedText style={styles.menuTitle}>{t('menu.account')}</ThemedText>
              </View>

              <View style={styles.accountItems}>
                {/* preferred language — persisted to the user profile */}
                <View style={styles.accountItem}>
                  <View style={styles.accountContent}>
                    <ThemedText style={styles.languageLabel}>{t('menu.language')}</ThemedText>
                    <View style={styles.langRow}>
                      {LANGS.map((l) => (
                        <TouchableOpacity
                          key={l}
                          style={[styles.langChip, lang === l && styles.langChipActive]}
                          onPress={() => setLang(l)}
                          testID={`lang-${l}`}
                        >
                          <ThemedText style={[styles.langChipText, lang === l && styles.langChipTextActive]}>
                            {LANGUAGE_LABELS[l]}
                          </ThemedText>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                </View>

                <TouchableOpacity
                  style={styles.accountItem}
                  onPress={handleLogout}
                  activeOpacity={0.7}
                >
                  <View style={styles.accountContent}>
                    <ThemedText style={styles.logoutTitle}>{t('menu.logout')}</ThemedText>
                  </View>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      </ScrollView>

      <BottomNavigation activeTab={activeTab} onTabPress={setActiveTab} />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f1f5f9',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  menuContainer: {
    flex: 1,
    backgroundColor: '#f1f5f9',
  },
  menuSection: {
    padding: 20,
  },
  menuHeader: {
    alignItems: 'flex-start',
    marginBottom: 24,
  },
  menuTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1f2937',
    textAlign: 'left',
  },
  menuGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  emptyMenu: {
    fontSize: 15,
    opacity: 0.6,
    textAlign: 'center',
    paddingHorizontal: 24,
    paddingVertical: 32,
    lineHeight: 22,
  },
  menuItem: {
    width: '47%',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  moduleIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#f3f4f6',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  moduleIconText: {
    fontSize: 20,
  },
  moduleTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
    textAlign: 'center',
  },
  accountItems: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  accountItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  accountContent: {
    flex: 1,
  },
  logoutTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ef4444',
    textAlign: 'center',
  },
  languageLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 10,
  },
  langRow: {
    flexDirection: 'row',
    gap: 10,
  },
  langChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.12)',
    alignItems: 'center',
  },
  langChipActive: {
    backgroundColor: '#5469D4',
    borderColor: '#5469D4',
  },
  langChipText: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '600',
  },
  langChipTextActive: {
    color: '#fff',
  },
});
