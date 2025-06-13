import React from 'react';
import { View, StyleSheet } from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import CustomersScreen from '@/app/customers';
import UsersScreen from '@/app/users';
import FinancialAccountsScreen from '@/app/financial-accounts';

interface MenuItem {
  id: number;
  title: string;
  description: string;
  icon: string;
  section: string;
  color: string;
}

interface ModuleContentProps {
  item: MenuItem;
  variant: 'desktop' | 'mobile';
}

export const ModuleContent: React.FC<ModuleContentProps> = ({ item, variant }) => {
  // Handle customers section specially
  if (item.section === 'customers') {
    return <CustomersScreen />;
  }

  if (item.section === 'users') {
    return <UsersScreen />;
  }

  if (item.section === 'financial-accounts') {
    return <FinancialAccountsScreen />;
  }

  return (
    <View style={[
      styles.container,
      variant === 'desktop' ? styles.desktopContainer : styles.mobileContainer
    ]}>
      <View style={styles.header}>
        <ThemedText style={[
          styles.icon,
          variant === 'desktop' ? styles.desktopIcon : styles.mobileIcon
        ]}>
          {item.icon}
        </ThemedText>
        <ThemedText style={[
          styles.title,
          variant === 'desktop' ? styles.desktopTitle : styles.mobileTitle
        ]}>
          {item.title}
        </ThemedText>
      </View>

      <ThemedText style={[
        styles.description,
        variant === 'desktop' ? styles.desktopDescription : styles.mobileDescription
      ]}>
        {item.description}
      </ThemedText>

      <View style={styles.comingSoon}>
        <ThemedText style={styles.comingSoonText}>
          🚧 Coming Soon
        </ThemedText>
        <ThemedText style={styles.comingSoonSubtext}>
          This module is under development and will be available soon.
        </ThemedText>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  desktopContainer: {
    padding: 20,
  },
  mobileContainer: {
    padding: 10,
  },
  header: {
    alignItems: 'center',
  },
  icon: {
    fontSize: 50,
  },
  desktopIcon: {
    fontSize: 60,
  },
  mobileIcon: {
    fontSize: 40,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  desktopTitle: {
    fontSize: 24,
  },
  mobileTitle: {
    fontSize: 18,
  },
  description: {
    fontSize: 16,
    textAlign: 'center',
  },
  desktopDescription: {
    fontSize: 18,
  },
  mobileDescription: {
    fontSize: 14,
  },
  comingSoon: {
    marginTop: 20,
    alignItems: 'center',
  },
  comingSoonText: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  comingSoonSubtext: {
    fontSize: 14,
    textAlign: 'center',
  },
});