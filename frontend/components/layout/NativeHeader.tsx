
import React from 'react';
import { View, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface NativeHeaderProps {
  title: string;
  onBack: () => void;
  rightComponent?: React.ReactNode;
}

export const NativeHeader: React.FC<NativeHeaderProps> = ({
  title,
  onBack,
  rightComponent
}) => {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.header, { paddingTop: Math.max(insets.top, 20) + 8 }]}>
      <TouchableOpacity 
        style={styles.backButton} 
        onPress={onBack}
        activeOpacity={0.7}
      >
        <ThemedText style={styles.backButtonText}>← Back</ThemedText>
      </TouchableOpacity>
      
      <ThemedText style={styles.title} numberOfLines={1}>
        {title}
      </ThemedText>
      
      <View style={styles.rightContainer}>
        {rightComponent}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
    zIndex: 10000,
    position: 'relative',
  },
  backButton: {
    paddingVertical: 8,
    paddingHorizontal: 4,
    marginRight: 12,
  },
  backButtonText: {
    fontSize: 16,
    color: '#5469D4',
    fontWeight: '600',
  },
  title: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: '#1f2937',
    textAlign: 'center',
    marginHorizontal: 8,
  },
  rightContainer: {
    width: 60,
    alignItems: 'flex-end',
  },
});
