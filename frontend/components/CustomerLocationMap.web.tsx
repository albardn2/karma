
import React, { useState, useEffect } from 'react';
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
  const [isClient, setIsClient] = useState(false);
  const [mapComponents, setMapComponents] = useState<{
    MapContainer: any;
    TileLayer: any;
    Marker: any;
    Popup: any;
  } | null>(null);
  const [leafletLoaded, setLeafletLoaded] = useState(false);

  const coordinates = parseCoordinates(customer.coordinates);

  useEffect(() => {
    setIsClient(true);

    if (typeof window !== 'undefined') {
      // Load leaflet CSS
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.7.1/dist/leaflet.css';
      if (!document.querySelector(`link[href="${link.href}"]`)) {
        document.head.appendChild(link);
      }

      // Load leaflet and react-leaflet
      const loadLeaflet = async () => {
        try {
          // Load leaflet first
          const L = require('leaflet');
          
          // Fix for default markers
          delete (L.Icon.Default.prototype as any)._getIconUrl;
          L.Icon.Default.mergeOptions({
            iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
            iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
            shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
          });

          // Load react-leaflet components
          const leaflet = require('react-leaflet');
          setMapComponents({
            MapContainer: leaflet.MapContainer,
            TileLayer: leaflet.TileLayer,
            Marker: leaflet.Marker,
            Popup: leaflet.Popup,
          });
          
          setLeafletLoaded(true);
        } catch (error) {
          console.error('Error loading leaflet:', error);
        }
      };

      loadLeaflet();
    }
  }, []);

  if (!coordinates) {
    return (
      <View style={styles.noLocationContainer}>
        <ThemedText style={styles.noLocationText}>
          📍 No location coordinates available
        </ThemedText>
      </View>
    );
  }

  if (!isClient || !mapComponents || !leafletLoaded) {
    return (
      <View style={styles.loadingContainer}>
        <ThemedText>Loading map...</ThemedText>
      </View>
    );
  }

  const { MapContainer, TileLayer, Marker, Popup } = mapComponents;

  return (
    <View style={styles.mapContainer}>
      <MapContainer
        center={[coordinates.lat, coordinates.lng]}
        zoom={15}
        style={{ height: '100%', width: '100%' }}
        zoomControl={true}
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Marker position={[coordinates.lat, coordinates.lng]}>
          <Popup>
            <div style={styles.popupContainer}>
              <div style={styles.popupTitle}>{customer.company_name}</div>
              <div style={styles.popupSubtitle}>{customer.full_name}</div>
              <div style={styles.popupAddress}>{customer.full_address}</div>
            </div>
          </Popup>
        </Marker>
      </MapContainer>
    </View>
  );
};

const styles = StyleSheet.create({
  mapContainer: {
    height: 300,
    width: '100%',
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#f3f4f6',
  },
  loadingContainer: {
    height: 300,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
  },
  noLocationContainer: {
    height: 120,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderStyle: 'dashed',
  },
  noLocationText: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
  },
  popupContainer: {
    minWidth: 200,
  },
  popupTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
    color: '#1f2937',
  },
  popupSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 8,
  },
  popupAddress: {
    fontSize: 12,
    color: '#6b7280',
  },
});
