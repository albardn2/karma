import React, { useMemo } from 'react';
import { View, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { useRouter } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface BottomNavigationProps {
  activeTab: 'home' | 'menu';
  onTabPress: (tab: 'home' | 'menu') => void;
}

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

export const BottomNavigation: React.FC<BottomNavigationProps> = ({ 
  activeTab, 
  onTabPress 
}) => {
  const insets = useSafeAreaInsets();

  const dynamicStyle = useMemo(() => [
    styles.bottomNavigation,
    { 
      paddingBottom: Platform.OS === 'ios' ? Math.max(insets.bottom, 6) : 6 
    }
  ], [insets.bottom]);

  return (
    <View style={dynamicStyle}>
      <TouchableOpacity
        style={[
          styles.bottomNavItem,
          activeTab === 'home' && styles.bottomNavItemActive
        ]}
        onPress={() => onTabPress('home')}
        activeOpacity={0.6}
      >
        <View style={styles.bottomNavIconContainer}>
          <HomeIcon color={activeTab === 'home' ? brandColor : '#9ca3af'} size={18} />
        </View>
        <ThemedText style={[
          styles.bottomNavText,
          { color: activeTab === 'home' ? brandColor : '#9ca3af' }
        ]}>Home</ThemedText>
      </TouchableOpacity>

      <TouchableOpacity
        style={[
          styles.bottomNavItem,
          activeTab === 'menu' && styles.bottomNavItemActive
        ]}
        onPress={() => onTabPress('menu')}
        activeOpacity={0.6}
      >
        <View style={styles.bottomNavIconContainer}>
          <MenuIcon color={activeTab === 'menu' ? brandColor : '#9ca3af'} size={18} />
        </View>
        <ThemedText style={[
          styles.bottomNavText,
          { color: activeTab === 'menu' ? brandColor : '#9ca3af' }
        ]}>Menu</ThemedText>
      </TouchableOpacity>
    </View>
  );
};

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
    paddingTop: 4,
    zIndex: 1000,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 8,
  },
  bottomNavItem: {
    alignItems: 'center',
    paddingVertical: 3,
    paddingHorizontal: 8,
    minWidth: 50,
    flex: 1,
  },
  bottomNavItemActive: {
    backgroundColor: 'rgba(84, 105, 212, 0.1)',
    borderRadius: 6,
  },
  bottomNavIconContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 1,
    paddingVertical: 1,
  },
  bottomNavText: {
    fontSize: 9,
    fontWeight: '500',
    marginTop: 0,
  },
});
