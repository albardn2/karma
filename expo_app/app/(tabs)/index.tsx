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

interface MenuItem {
  id: number;
  title: string;
  description: string;
  icon: string;
  section: string;
  color: string;
}

const ALL_MENU_ITEMS: MenuItem[] = [
  {
    id: 1,
    title: 'Customers',
    description: 'Manage customer information and relationships',
    icon: '👥',
    section: 'customers',
    color: '#5469D4',
  },
  {
    id: 2,
    title: 'Customer Orders',
    description: 'Track and manage customer orders',
    icon: '📋',
    section: 'customer_orders',
    color: '#e74c3c',
  },
  {
    id: 3,
    title: 'Distribution',
    description: 'Trip executions and deliveries',
    icon: '🚚',
    section: 'distribution',
    color: '#16a34a',
  },
];

// field crews (sales/drivers with no other role) only work the trip flow —
// their menu shows Distribution alone
const FIELD_ROLES = new Set(['sales', 'driver']);

export default function HomeScreen() {
  const { user, logout } = useAuth();
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
    return fieldOnly
      ? ALL_MENU_ITEMS.filter((i) => i.section === 'distribution')
      : ALL_MENU_ITEMS;
  }, [user?.permission_scope]);

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Logout', 
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
    } else if (item.section === 'customer_orders') {
      Alert.alert('Coming Soon', 'Customer Orders module will be available soon');
    } else {
      Alert.alert(item.title, `You tapped on ${item.title}`);
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
                <ThemedText style={styles.menuTitle}>Modules</ThemedText>
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
                    <ThemedText style={styles.moduleTitle}>{item.title}</ThemedText>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.menuSection}>
              <View style={styles.menuHeader}>
                <ThemedText style={styles.menuTitle}>Account</ThemedText>
              </View>

              <View style={styles.accountItems}>
                <TouchableOpacity
                  style={styles.accountItem}
                  onPress={handleLogout}
                  activeOpacity={0.7}
                >
                  <View style={styles.accountContent}>
                    <ThemedText style={styles.logoutTitle}>Logout</ThemedText>
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
});
