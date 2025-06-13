
import React, { useMemo, useState, useEffect, useRef } from 'react';
import { View, ScrollView, StyleSheet, Platform, TouchableOpacity, Animated } from 'react-native';
import { BottomNavigation } from '@/components/layout/BottomNavigation';
import { WelcomeContent } from '@/components/content/WelcomeContent';
import { ModuleContent } from '@/components/content/ModuleContent';
import { ThemedText } from '@/components/ThemedText';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface MenuItem {
  id: number;
  title: string;
  description: string;
  icon: string;
  section: string;
  color: string;
}

interface MobileNativeLayoutProps {
  menuItems: MenuItem[];
  activeSection: string | null;
  onSectionPress: (section: string) => void;
  onBackToHome: () => void;
  onLogout?: () => void;
}

export const MobileNativeLayout: React.FC<MobileNativeLayoutProps> = React.memo(({
  menuItems,
  activeSection: externalActiveSection,
  onSectionPress: externalOnSectionPress,
  onBackToHome,
  onLogout,
}) => {
  const insets = useSafeAreaInsets();
  const [currentSection, setCurrentSection] = useState<string | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  
  // Use internal state for all navigation to avoid external route changes
  const activeSection = currentSection;
  
  const animateTransition = (callback: () => void) => {
    Animated.sequence([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start();
    
    // Execute the callback after fade out starts
    setTimeout(callback, 150);
  };
  
  const handleSectionPress = (section: string) => {
    animateTransition(() => {
      if (section === 'home') {
        setCurrentSection(null);
        setShowMenu(false);
      } else {
        setCurrentSection(section);
        setShowMenu(false);
      }
    });
  };

  const handleMenuPress = () => {
    animateTransition(() => {
      setShowMenu(true);
      setCurrentSection(null);
    });
  };
  
  // Memoize expensive calculations
  const activeItem = useMemo(() => 
    menuItems.find(item => item.section === activeSection), 
    [menuItems, activeSection]
  );
  
  const bottomPadding = useMemo(() => 
    Platform.OS === 'ios' 
      ? 60 + Math.max(insets.bottom, 8)
      : 68,
    [insets.bottom]
  );

  const contentStyle = useMemo(() => [
    styles.content, 
    { paddingBottom: bottomPadding }
  ], [bottomPadding]);

  const handleBackToHome = () => {
    animateTransition(() => {
      setCurrentSection(null);
      setShowMenu(false);
    });
  };

  // Render menu content
  const renderMenuContent = () => (
    <ScrollView style={styles.menuContainer} showsVerticalScrollIndicator={false}>
      <View style={styles.menuSection}>
        <View style={styles.menuHeader}>
          <ThemedText style={styles.menuTitle}>Modules</ThemedText>
        </View>

        <View style={styles.menuGrid}>
          {menuItems.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={styles.menuItem}
              onPress={() => handleSectionPress(item.section)}
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
      <View style={styles.menuSection}>
        <View style={styles.menuHeader}>
          <ThemedText style={styles.menuTitle}>Account</ThemedText>
        </View>

        <View style={styles.accountItems}>
          <TouchableOpacity
            style={styles.accountItem}
            onPress={onLogout}
            activeOpacity={0.7}
          >
            <View style={styles.accountContent}>
              <ThemedText style={styles.logoutTitle}>Logout</ThemedText>
            </View>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
        <ScrollView 
          style={contentStyle} 
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews={false}
          scrollEventThrottle={1}
        >
          {showMenu ? (
            renderMenuContent()
          ) : activeSection && activeItem ? (
            <ModuleContent 
              item={activeItem} 
              variant="mobile" 
              onBack={handleBackToHome}
            />
          ) : (
            <WelcomeContent variant="mobile" />
          )}
        </ScrollView>
      </Animated.View>

      <BottomNavigation 
        menuItems={menuItems}
        activeSection={showMenu ? 'menu' : activeSection}
        onSectionPress={handleSectionPress}
        onMenuPress={handleMenuPress}
        currentRoute="home"
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f1f5f9',
    position: 'relative',
    width: '100%',
    height: '100%',
  },
  content: {
    flex: 1,
    backgroundColor: '#f1f5f9',
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
