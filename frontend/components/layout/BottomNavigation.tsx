import React, { useMemo } from 'react';
import { View, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { useRouter } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface MenuItem {
  id: number;
  title: string;
  icon: string;
  section: string;
  color: string;
}

interface BottomNavigationProps {
  menuItems: MenuItem[];
  activeSection: string | null;
  onSectionPress: (section: string) => void;
  onMenuPress?: () => void;
  currentRoute?: string;
}

// SVG Icon Components
const HomeIcon: React.FC<{ color: string; size: number }> = ({ color, size }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Path
      d="M9 22V12h6v10"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

const MenuIcon: React.FC<{ color: string; size: number }> = ({ color, size }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M3 12h18M3 6h18M3 18h18"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

const brandColor = '#5469D4';

export const BottomNavigation: React.FC<BottomNavigationProps> = React.memo(({
  menuItems,
  activeSection,
  onSectionPress,
  onMenuPress,
  currentRoute
}) => {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const isHomeActive = currentRoute === 'home' && !activeSection;
  const isMenuActive = activeSection === 'menu' || currentRoute === 'menu' || (activeSection && activeSection !== 'home');

  const dynamicStyle = useMemo(() => [
    styles.bottomNavigation,
    { 
      paddingBottom: Platform.OS === 'ios' ? Math.max(insets.bottom, 8) : 8 
    }
  ], [insets.bottom]);

  return (
    <View style={dynamicStyle}>
      <TouchableOpacity
        style={[
          styles.bottomNavItem,
          isHomeActive && styles.bottomNavItemActive
        ]}
        onPress={() => {
          onSectionPress('home');
        }}
        activeOpacity={0.6}
        delayPressIn={0}
        delayPressOut={0}
      >
        <View style={styles.bottomNavIconContainer}>
          <HomeIcon color={isHomeActive ? brandColor : '#9ca3af'} size={20} />
        </View>
        <ThemedText style={[
          styles.bottomNavText,
          { color: isHomeActive ? brandColor : '#9ca3af' }
        ]}>Home</ThemedText>
      </TouchableOpacity>

      <TouchableOpacity
        style={[
          styles.bottomNavItem,
          isMenuActive && styles.bottomNavItemActive
        ]}
        onPress={() => {
          if (onMenuPress) {
            // Native: Use internal menu handler
            onMenuPress();
          } else {
            // Web: Navigate to dedicated menu page
            router.push('/menu');
          }
        }}
        activeOpacity={0.6}
        delayPressIn={0}
        delayPressOut={0}
      >
        <View style={styles.bottomNavIconContainer}>
          <MenuIcon color={isMenuActive ? brandColor : '#9ca3af'} size={20} />
        </View>
        <ThemedText style={[
          styles.bottomNavText,
          { color: isMenuActive ? brandColor : '#9ca3af' }
        ]}>Menu</ThemedText>
      </TouchableOpacity>
    </View>
  );
});

const styles = StyleSheet.create({
  bottomNavigation: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    paddingTop: 6,
    zIndex: 1000,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 10,
  },
  bottomNavItem: {
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 12,
    minWidth: 60,
    flex: 1,
  },
  bottomNavItemActive: {
    backgroundColor: 'rgba(84, 105, 212, 0.1)',
    borderRadius: 8,
  },
  bottomNavIconContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 2,
    paddingVertical: 2,
  },
  bottomNavText: {
    fontSize: 10,
    fontWeight: '500',
    marginTop: 1,
  },
});