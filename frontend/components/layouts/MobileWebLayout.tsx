import React, { useState } from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { BottomNavigation } from '@/components/layout/BottomNavigation';
import { WelcomeContent } from '@/components/content/WelcomeContent';
import { ModuleContent } from '@/components/content/ModuleContent';

interface MenuItem {
  id: number;
  title: string;
  description: string;
  icon: string;
  section: string;
  color: string;
}

interface MobileWebLayoutProps {
  menuItems: MenuItem[];
  activeSection: string | null;
  onSectionPress: (section: string) => void;
  onBackToHome: () => void;
}

export const MobileWebLayout: React.FC<MobileWebLayoutProps> = ({
  menuItems,
  activeSection: externalActiveSection,
  onSectionPress: externalOnSectionPress,
  onBackToHome,
}) => {
  const [internalActiveSection, setInternalActiveSection] = useState<string | null>(null);

  // Use internal state for immediate UI updates
  const activeSection = internalActiveSection || externalActiveSection;
  const activeItem = menuItems.find(item => item.section === activeSection);

  const handleSectionPress = (section: string) => {
    if (section === 'home') {
      setInternalActiveSection(null);
      onBackToHome();
    } else {
      setInternalActiveSection(section);
      // Don't call external handler to avoid navigation
    }
  };

  const handleBackToHome = () => {
    setInternalActiveSection(null);
    onBackToHome();
  };

  return (
    <View style={styles.container}>
      <ScrollView 
        style={styles.content} 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {activeSection && activeItem ? (
          <ModuleContent 
            item={activeItem} 
            variant="mobile" 
            onBack={handleBackToHome}
          />
        ) : (
          <WelcomeContent variant="mobile" />
        )}
      </ScrollView>

      <BottomNavigation 
        menuItems={menuItems}
        activeSection={activeSection}
        onSectionPress={handleSectionPress}
        currentRoute="home"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f1f5f9',
    position: 'relative',
    minHeight: '100vh',
    width: '100%',
    height: '100vh',
    overflow: 'hidden',
  },
  content: {
    flex: 1,
    backgroundColor: '#f1f5f9',
    paddingBottom: 80, // Add space for fixed bottom navigation
    minHeight: '100vh',
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 0,
  }
});