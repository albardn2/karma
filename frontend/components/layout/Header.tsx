import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ThemedText } from '@/components/ThemedText';
import { useRouter } from 'expo-router';

interface HeaderProps {
  title: string;
  showMenuButton?: boolean;
  centered?: boolean;
}

export const Header: React.FC<HeaderProps> = ({ 
  title, 
  showMenuButton = false,
  centered = false 
}) => {
  const router = useRouter();

  if (centered) {
    return (
      <LinearGradient
        colors={['#5469D4', '#6B73E0']}
        style={styles.headerCentered}
      >
        <ThemedText style={styles.headerTitle}>
          {title}
        </ThemedText>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient
      colors={['#5469D4', '#6B73E0']}
      style={styles.header}
    >
      <ThemedText style={styles.headerTitle}>
        {title}
      </ThemedText>
      {showMenuButton && (
        <TouchableOpacity 
          style={styles.menuButton}
          onPress={() => router.push('/menu')}
          activeOpacity={0.7}
        >
          <View style={styles.menuButtonContainer}>
            <ThemedText style={styles.menuButtonText}>☰</ThemedText>
          </View>
        </TouchableOpacity>
      )}
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  header: {
    paddingTop: 50,
    paddingHorizontal: 20,
    paddingBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
  },
  headerContentCentered: {
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#ffffff',
  },
  menuButton: {
    padding: 4,
  },
  menuButtonContainer: {
    width: 40,
    height: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuButtonText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#ffffff',
  },
  headerCentered: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 50,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
});