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

interface MenuItem {
  id: number;
  titleKey: string;
  icon: string;
  section: string;
  color: string;
  adminOnly?: boolean;
}

const ALL_MENU_ITEMS: MenuItem[] = [
  { id: 1, titleKey: 'menu.customers', icon: '👥', section: 'customers', color: '#5469D4' },
  { id: 2, titleKey: 'menu.customerOrders', icon: '📋', section: 'customer_orders', color: '#e74c3c' },
  { id: 3, titleKey: 'menu.distribution', icon: '🚚', section: 'distribution', color: '#16a34a' },
  { id: 4, titleKey: 'menu.trips', icon: '🗺️', section: 'trips', color: '#d97706', adminOnly: true },
];

const LANGS: Lang[] = ['en', 'ar'];

// field crews (sales/drivers with no other role) only work the trip flow —
// their menu shows Distribution alone
const FIELD_ROLES = new Set(['sales', 'driver']);

export default function HomeScreen() {
  const { user, logout } = useAuth();
  const { t, lang, setLang } = useLanguage();
  const router = useRouter();
  // modules navigate back here with ?tab=menu so the menu view is restored
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  const [activeTab, setActiveTab] = useState<'home' | 'menu'>(tab === 'menu' ? 'menu' : 'home');
  const insets = useSafeAreaInsets();

  const menuItems: MenuItem[] = useMemo(() => {
    const scopes: string[] = (user?.permission_scope || '')
      .split(',')
      .map((s: string) => s.trim())
      .filter(Boolean);
    const fieldOnly = scopes.length > 0 && scopes.every((s) => FIELD_ROLES.has(s));
    const isAdmin = scopes.includes('admin') || scopes.includes('superuser');
    if (fieldOnly) return ALL_MENU_ITEMS.filter((i) => i.section === 'distribution');
    return ALL_MENU_ITEMS.filter((i) => !i.adminOnly || isAdmin);
  }, [user?.permission_scope]);

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

  const handleMenuPress = (item: MenuItem) => {
    if (item.section === 'customers') {
      router.push('/customers');
    } else if (item.section === 'distribution') {
      router.push('/distribution');
    } else if (item.section === 'trips') {
      router.push('/trips');
    } else if (item.section === 'customer_orders') {
      Alert.alert(t('menu.comingSoon'), t('menu.comingSoonMsg'));
    }
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
