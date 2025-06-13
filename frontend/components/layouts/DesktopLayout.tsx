import React, { useEffect } from 'react';
import { View, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ThemedText } from '@/components/ThemedText';
import { WelcomeContent } from '@/components/content/WelcomeContent';
import { ModuleContent } from '@/components/content/ModuleContent';
import { useRouter, usePathname } from 'expo-router';

interface MenuItem {
  id: number;
  title: string;
  description: string;
  icon: string;
  section: string;
  color: string;
}

interface User {
  first_name?: string;
  last_name?: string;
  username?: string;
  permission_scope?: string;
}

interface DesktopLayoutProps {
  menuItems: any[];
  activeSection: string | null;
  user: any;
  onMenuPress: (section: string) => void;
  onLogoPress: () => void;
  onLogout: () => void;
}

const SidebarMenuItem: React.FC<{
  title: string;
  description: string;
  icon: string;
  onPress: () => void;
  isActive?: boolean;
}> = ({ title, description, icon, onPress, isActive }) => (
  <TouchableOpacity 
    style={[styles.sidebarItem, isActive && styles.sidebarItemActive]} 
    onPress={onPress} 
    activeOpacity={0.7}
  >
    {isActive && <View style={styles.activeIndicator} />}
    <View style={styles.sidebarItemContent}>
      <View style={[styles.iconContainer, isActive && styles.iconContainerActive]}>
        <ThemedText style={[styles.sidebarIcon, isActive && styles.sidebarIconActive]}>{icon}</ThemedText>
      </View>
      <View style={styles.sidebarTextContainer}>
        <ThemedText style={[styles.sidebarTitle, isActive && styles.sidebarTitleActive]}>{title}</ThemedText>
      </View>
      {isActive && <View style={styles.activeArrow}><ThemedText style={styles.activeArrowText}>→</ThemedText></View>}
    </View>
  </TouchableOpacity>
);

export const DesktopLayout: React.FC<DesktopLayoutProps> = ({
  menuItems,
  activeSection,
  user,
  onMenuPress,
  onLogoPress,
  onLogout,
}) => {
  const activeItem = menuItems.find(item => item.section === activeSection);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (activeSection) {
        const url = new URL(window.location.href);
        url.searchParams.set('section', activeSection);
        window.history.replaceState({}, '', url.toString());
      } else {
        // Remove the section parameter when going back to home
        const url = new URL(window.location.href);
        url.searchParams.delete('section');
        window.history.replaceState({}, '', url.toString());
      }
    }
  }, [activeSection]);

  const handleNavigation = (section: string) => {
    onMenuPress(section);
  };

  const handleLogoClick = () => {
    onLogoPress();
  };


  return (
    <View style={styles.container}>
      {/* Sidebar */}
      <View style={styles.sidebar}>
        <LinearGradient
          colors={['#5469D4', '#6B73E0']}
          locations={[0, 1]}
          style={styles.sidebarGradient}
        >
          {/* Logo */}
          <View style={styles.sidebarHeader}>
            <TouchableOpacity 
            style={styles.logoContainer} 
            onPress={handleLogoClick}
            activeOpacity={0.8}
          >
              <ThemedText style={styles.logoIcon}>🏭</ThemedText>
            </TouchableOpacity>
          </View>

          {/* Navigation Menu */}
          <ScrollView style={styles.sidebarMenu} showsVerticalScrollIndicator={false}>
            <ThemedText style={styles.menuSectionTitle}>NAVIGATION</ThemedText>
            {menuItems.map((item, index) => (
              <SidebarMenuItem
                key={index}
                title={item.title}
                description={item.description}
                icon={item.icon}
                isActive={activeSection === item.section}
                onPress={() => onMenuPress(item.section)}
              />
            ))}
          </ScrollView>

          {/* User Info & Logout */}
          <View style={styles.sidebarFooter}>
            <View style={styles.userInfo}>
              <View style={styles.userAvatar}>
                <ThemedText style={styles.userAvatarText}>
                  {user?.first_name ? user.first_name.charAt(0).toUpperCase() : '👤'}
                </ThemedText>
              </View>
              <ThemedText style={styles.userName}>
                {user && user.first_name && user.last_name
                  ? `${user.first_name} ${user.last_name}`
                  : user && user.username
                    ? user.username
                    : 'Welcome User'
                }
              </ThemedText>
              <ThemedText style={styles.userScope}>
                {user && user.permission_scope
                  ? user.permission_scope
                  : 'User Access'}
              </ThemedText>
            </View>
            <TouchableOpacity style={styles.sidebarLogoutButton} onPress={onLogout}>
              <ThemedText style={styles.sidebarLogoutIcon}>🚪</ThemedText>
              <ThemedText style={styles.sidebarLogoutText}>Logout</ThemedText>
            </TouchableOpacity>
          </View>
        </LinearGradient>
      </View>

      {/* Main Content */}
      <View style={styles.mainContent}>
        <View style={styles.contentArea}>
          {activeSection && activeItem ? (
            <ModuleContent item={activeItem} variant="desktop" />
          ) : (
            <WelcomeContent variant="desktop" />
          )}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#f8faff',
  },

  // Sidebar styles
  sidebar: {
    width: 280,
    backgroundColor: '#5469D4',
    shadowColor: 'rgba(0, 0, 0, 0.1)',
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 20,
    elevation: 10,
    zIndex: 10,
  },
  sidebarGradient: {
    flex: 1,
    paddingVertical: 24,
  },
  sidebarHeader: {
    paddingHorizontal: 24,
    paddingBottom: 24,
    alignItems: 'center',
  },
  logoContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  logoIcon: {
    fontSize: 20,
    color: '#ffffff',
  },

  // User info styles
  userInfo: {
    alignItems: 'center',
    marginBottom: 16,
  },
  userAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  userAvatarText: {
    fontSize: 16,
    color: '#ffffff',
  },
  userName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 2,
  },
  userScope: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.7)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Sidebar menu styles
  sidebarMenu: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  menuSectionTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.7)',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  sidebarItem: {
    marginBottom: 6,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  sidebarItemActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: 'rgba(0, 0, 0, 0.1)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 4,
  },
  activeIndicator: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: '#ffffff',
    borderTopRightRadius: 2,
    borderBottomRightRadius: 2,
    shadowColor: '#ffffff',
    shadowOffset: { width: 2, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  sidebarItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    paddingLeft: 16,
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  iconContainerActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  sidebarIcon: {
    fontSize: 16,
    textAlign: 'center',
    color: 'rgba(255, 255, 255, 0.7)',
  },
  sidebarIconActive: {
    color: '#ffffff',
  },
  activeArrow: {
    marginLeft: 'auto',
  },
  activeArrowText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  sidebarTextContainer: {
    flex: 1,
  },
  sidebarTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.9)',
    marginBottom: 2,
  },
  sidebarTitleActive: {
    color: '#ffffff',
    fontWeight: '600',
  },

  // Sidebar footer styles
  sidebarFooter: {
    paddingHorizontal: 24,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.2)',
  },
  sidebarLogoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  sidebarLogoutIcon: {
    fontSize: 16,
    marginRight: 12,
    color: '#ffffff',
  },
  sidebarLogoutText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },

  // Main content styles
  mainContent: {
    flex: 1,
    backgroundColor: '#f8faff',
  },
  contentArea: {
    flex: 1,
    padding: 32,
  },
});