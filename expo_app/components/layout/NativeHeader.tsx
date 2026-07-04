import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface NativeHeaderProps {
  title: string;
  onBack?: () => void;
  rightButton?: {
    label: string;
    onPress: () => void;
    disabled?: boolean;
  };
  rightComponent?: React.ReactNode;
}

export const NativeHeader: React.FC<NativeHeaderProps> = ({ title, onBack, rightButton, rightComponent }) => {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      router.back();
    }
  };

  return (
    <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
      <TouchableOpacity onPress={handleBack} style={styles.backButton}>
        <ThemedText style={styles.backText}>←</ThemedText>
      </TouchableOpacity>
      <ThemedText style={styles.title}>{title}</ThemedText>
      <View style={styles.rightButton}>
        {rightComponent ? (
          rightComponent
        ) : rightButton ? (
          <TouchableOpacity
            onPress={rightButton.onPress}
            disabled={rightButton.disabled}
            style={[styles.actionButton, rightButton.disabled && styles.actionButtonDisabled]}
          >
            <ThemedText style={[
              styles.actionButtonText,
              rightButton.disabled && styles.actionButtonTextDisabled
            ]}>
              {rightButton.label}
            </ThemedText>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  backButton: {
    padding: 8,
    marginLeft: -8,
  },
  backText: {
    fontSize: 28,
    color: '#5469D4',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
    flex: 1,
    textAlign: 'center',
  },
  rightButton: {
    minWidth: 44,
    alignItems: 'flex-end',
  },
  actionButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#5469D4',
  },
  actionButtonDisabled: {
    opacity: 0.5,
  },
  actionButtonTextDisabled: {
    color: '#9ca3af',
  },
});
