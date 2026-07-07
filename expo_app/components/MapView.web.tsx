import React from 'react';
import { View, StyleSheet } from 'react-native';
import { ThemedText } from '@/components/ThemedText';

interface Customer {
  uuid: string;
  email_address: string | null;
  company_name: string;
  full_name: string;
  phone_number: string;
  full_address: string;
  business_cards: string | null;
  notes: string | null;
  category: 'roastery' | 'restaurant' | 'minimarket' | 'supermarket' | 'distributer';
  coordinates: string | null;
  created_at: string;
  is_deleted: boolean;
  balance_per_currency: Record<string, number>;
}

interface MapViewComponentProps {
  onCustomerPress: (customer: Customer) => void;
  searchTerm?: string;
  categoryFilter?: string;
}

export const MapViewComponent: React.FC<MapViewComponentProps> = () => {
  return (
    <View style={styles.container}>
      <View style={styles.messageContainer}>
        <ThemedText style={styles.title}>🗺️ Map View</ThemedText>
        <ThemedText style={styles.message}>
          Interactive map is available on the mobile app.
        </ThemedText>
        <ThemedText style={styles.submessage}>
          Please use the mobile app (iOS/Android) to view customers on the map.
        </ThemedText>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  messageContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 32,
    maxWidth: 500,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 16,
    textAlign: 'center',
  },
  message: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 8,
  },
  submessage: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
  },
});
