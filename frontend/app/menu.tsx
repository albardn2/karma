import React from 'react';
import { StyleSheet, TouchableOpacity, ScrollView, View, Alert, Platform, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'expo-router';
import { BottomNavigation } from '@/components/layout/BottomNavigation';

export default function MenuScreen() {
  const { logout } = useAuth();
  const router = useRouter();
  const [screenData, setScreenData] = React.useState(Dimensions.get('window'));

  React.useEffect(() => {
    const onChange = (result: any) => {
      setScreenData(result.window);
    };
    const subscription = Dimensions.addEventListener('change', onChange);
    return () => subscription?.remove();
  }, []);

  // Platform detection
  const isWeb = Platform.OS === 'web';
  const isNative = Platform.OS === 'ios' || Platform.OS === 'android';
  const isMobileWeb = isWeb && screenData.width < 768;
  const showBottomNav = isMobileWeb || isNative;

  const handleLogout = () => {
    logout().catch(error => {
      console.error('Logout failed:', error);
    });
  };

  const handleModulePress = (section: string, title: string) => {
    // Navigate back to home with the selected section
    router.replace({
      pathname: '/(tabs)',
      params: { section: section }
    });
  };

  const handleSectionPress = (section: string) => {
    if (section === 'home') {
      // Navigate directly to home without any section parameter
      router.replace('/(tabs)');
      return;
    }
    handleModulePress(section, '');
  };

  const moduleItems = [
    {
      id: 1,
      title: "Customers",
      description: "Manage customer information and relationships",
      icon: "👥",
      section: "customers",
      color: "#3498db",
    },
    {
      id: 2,
      title: "Customer Orders",
      description: "Track and manage customer orders",
      icon: "📋",
      section: "customer_orders",
      color: "#e74c3c",
    },
    {
      id: 3,
      title: "Vendors",
      description: "Manage vendor relationships and information",
      icon: "🏪",
      section: "vendors",
      color: "#9b59b6",
    },
    {
      id: 4,
      title: "Purchase Orders",
      description: "Create and track purchase orders",
      icon: "🛒",
      section: "purchase_orders",
      color: "#f39c12",
    },
    {
      id: 5,
      title: "Payments",
      description: "Track incoming payments and receipts",
      icon: "💰",
      section: "payments",
      color: "#2ecc71",
    },
    {
      id: 6,
      title: "Payouts",
      description: "Manage outgoing payments and expenses",
      icon: "💸",
      section: "payouts",
      color: "#1abc9c",
    },
    {
      id: 7,
      title: "Expenses",
      description: "Track business expenses and costs",
      icon: "📊",
      section: "expenses",
      color: "#34495e",
    },
    {
      id: 8,
      title: "Fixed Assets",
      description: "Manage company assets and equipment",
      icon: "🏭",
      section: "fixed_assets",
      color: "#7f8c8d",
    },
    {
      id: 9,
      title: "Vehicles",
      description: "Track company vehicles and fleet",
      icon: "🚛",
      section: "vehicles",
      color: "#8e44ad",
    },
    {
      id: 10,
      title: "Employees",
      description: "Manage employee information and records",
      icon: "👨‍💼",
      section: "employees",
      color: "#c0392b",
    },
    {
      id: 11,
      title: "Users",
      description: "Manage users and permissions",
      icon: "👤",
      section: "users",
      color: "#27ae60",
    }
  ];

  return (
    <View style={styles.container}>
      <ScrollView 
        style={[styles.contentFullScreen, showBottomNav && { paddingBottom: 120 }]} 
        showsVerticalScrollIndicator={false}
      >
        {/* Modules Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <ThemedText style={styles.sectionTitle}>Modules</ThemedText>
          </View>

          <View style={styles.itemsGrid}>
            {moduleItems.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={styles.moduleItem}
                onPress={() => handleModulePress(item.section, item.title)}
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

        {/* Account Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <ThemedText style={styles.sectionTitle}>Account</ThemedText>
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
      </ScrollView>

      {showBottomNav && (
        <BottomNavigation 
          menuItems={moduleItems}
          activeSection={null}
          onSectionPress={handleSectionPress}
          currentRoute="menu"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f1f5f9',
    paddingTop: 0,
    position: 'relative',
  },
  contentFullScreen: {
    flex: 1,
    padding: 20,
    paddingTop: 20,
    backgroundColor: '#f1f5f9',
  },
  section: {
    marginBottom: 32,
  },
  sectionHeader: {
    alignItems: 'flex-start',
    marginBottom: 24,
    paddingHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1f2937',
    textAlign: 'left',
  },
  itemsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  moduleItem: {
    width: '48%',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
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
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  moduleIconText: {
    fontSize: 24,
  },
  moduleTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 4,
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
  accountIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  accountIconText: {
    fontSize: 18,
    color: '#ffffff',
  },
  accountIconNoBackground: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  accountIconNoBackgroundText: {
    fontSize: 20,
  },
  accountContent: {
    flex: 1,
  },
  accountTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 2,
  },
  logoutTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ef4444',
    textAlign: 'center',
  },
  accountDescription: {
    fontSize: 14,
    color: '#6b7280',
  },
  accountArrow: {
    fontSize: 18,
    color: '#9ca3af',
    fontWeight: '600',
  },
});