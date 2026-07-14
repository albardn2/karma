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
  category: 'roastery' | 'restaurant' | 'minimarket' | 'supermarket' | 'distributer' | 'school' | 'university' | 'hospital';
  coordinates: string | null;
  created_at: string;
  is_deleted: boolean;
  balance_per_currency: Record<string, number>;
}

interface CustomerLocationMapProps {
  customer: Customer;
}

const parseCoordinates = (coordinatesString: string | null): { lat: number; lng: number } | null => {
  if (!coordinatesString) return null;

  try {
    const coords = coordinatesString.split(',');
    if (coords.length === 2) {
      const lat = parseFloat(coords[0].trim());
      const lng = parseFloat(coords[1].trim());
      if (!isNaN(lat) && !isNaN(lng)) {
        return { lat, lng };
      }
    }
  } catch (error) {
    console.error('Error parsing coordinates:', error);
  }
  return null;
};

export const CustomerLocationMap: React.FC<CustomerLocationMapProps> = ({ customer }) => {
  const coordinates = parseCoordinates(customer.coordinates);

  return (
    <View style={styles.locationContainer}>
      <ThemedText style={styles.locationTitle}>📍 Location</ThemedText>
      {coordinates ? (
        <View style={styles.coordinatesContainer}>
          <ThemedText style={styles.coordinateText}>
            Latitude: {coordinates.lat.toFixed(6)}
          </ThemedText>
          <ThemedText style={styles.coordinateText}>
            Longitude: {coordinates.lng.toFixed(6)}
          </ThemedText>
          <ThemedText style={styles.mapNote}>
            Map view available on mobile app
          </ThemedText>
        </View>
      ) : (
        <ThemedText style={styles.noLocationText}>
          No location coordinates available
        </ThemedText>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  locationContainer: {
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 16,
  },
  locationTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 12,
  },
  coordinatesContainer: {
    gap: 4,
  },
  coordinateText: {
    fontSize: 14,
    color: '#6b7280',
    fontFamily: 'monospace',
  },
  mapNote: {
    fontSize: 12,
    color: '#9ca3af',
    fontStyle: 'italic',
    marginTop: 8,
  },
  noLocationText: {
    fontSize: 14,
    color: '#9ca3af',
    fontStyle: 'italic',
  },
});
