import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, ActivityIndicator, Dimensions, TouchableOpacity, Platform } from 'react-native';
import MapView, { Marker, Region, PROVIDER_GOOGLE } from 'react-native-maps';
import { ThemedText } from '@/components/ThemedText';
import { apiCall } from '@/utils/api';
import * as Location from 'expo-location';

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

interface CustomerPage {
  customers: Customer[];
  total_count: number;
  page: number;
  per_page: number;
  pages: number;
}

interface MapViewComponentProps {
  onCustomerPress: (customer: Customer) => void;
  searchTerm?: string;
  categoryFilter?: string;
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

const regionToWKT = (region: Region): string => {
  const { latitude, longitude, latitudeDelta, longitudeDelta } = region;
  const halfLatDelta = latitudeDelta / 2;
  const halfLngDelta = longitudeDelta / 2;

  const sw = { lat: latitude - halfLatDelta, lng: longitude - halfLngDelta };
  const nw = { lat: latitude + halfLatDelta, lng: longitude - halfLngDelta };
  const ne = { lat: latitude + halfLatDelta, lng: longitude + halfLngDelta };
  const se = { lat: latitude - halfLatDelta, lng: longitude + halfLngDelta };

  return `POLYGON((${sw.lng} ${sw.lat}, ${nw.lng} ${nw.lat}, ${ne.lng} ${ne.lat}, ${se.lng} ${se.lat}, ${sw.lng} ${sw.lat}))`;
};

export const MapViewComponent: React.FC<MapViewComponentProps> = ({
  onCustomerPress,
  searchTerm = '',
  categoryFilter = 'all',
}) => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentBounds, setCurrentBounds] = useState<string | null>(null);
  const [isMapReady, setIsMapReady] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [popupPosition, setPopupPosition] = useState<{ x: number; y: number } | null>(null);
  const [locatingUser, setLocatingUser] = useState(false);
  const mapRef = useRef<MapView>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLoadingRef = useRef(false);
  const pendingRegionRef = useRef<Region | null>(null);

  const defaultRegion: Region = {
    latitude: 33.5138,
    longitude: 36.2765,
    latitudeDelta: 0.1,
    longitudeDelta: 0.1,
  };

  const fetchCustomersInBounds = async (wkt: string) => {
    if (isLoadingRef.current) {
      console.log('Already loading, skipping request');
      return;
    }

    try {
      isLoadingRef.current = true;
      setLoading(true);

      const params = new URLSearchParams({
        within_polygon: wkt,
        per_page: '50',
      });

      if (searchTerm) {
        params.append('full_name', searchTerm);
      }

      if (categoryFilter && categoryFilter !== 'all') {
        params.append('category', categoryFilter);
      }

      console.log('Fetching customers within bounds:', wkt);
      const response = await apiCall<CustomerPage>(`/customer/?${params.toString()}`);

      if (response.status === 200 && response.data) {
        const customersWithCoords = response.data.customers.filter(customer =>
          parseCoordinates(customer.coordinates) !== null
        );
        setCustomers(customersWithCoords);
        console.log(`Loaded ${customersWithCoords.length} customers in map bounds`);
      } else {
        console.error('Failed to load customers:', response);
        if (response.status !== 401) {
          setCustomers([]);
        }
      }
    } catch (error) {
      console.error('Error fetching customers in bounds:', error);
    } finally {
      setLoading(false);
      isLoadingRef.current = false;
      
      // Check if there's a pending region change
      if (pendingRegionRef.current) {
        const pendingRegion = pendingRegionRef.current;
        pendingRegionRef.current = null;
        const wkt = regionToWKT(pendingRegion);
        setCurrentBounds(wkt);
        fetchCustomersInBounds(wkt);
      }
    }
  };

  const handleRegionChange = (region: Region) => {
    if (!isMapReady) return;

    // Always store the latest region for processing
    pendingRegionRef.current = region;

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      // Only fetch if not currently loading (pending region will be processed after load)
      if (!isLoadingRef.current) {
        const wkt = regionToWKT(region);
        if (wkt !== currentBounds) {
          pendingRegionRef.current = null; // Clear pending since we're processing it now
          setCurrentBounds(wkt);
          fetchCustomersInBounds(wkt);
        } else {
          pendingRegionRef.current = null; // Clear pending if bounds haven't changed
        }
      }
      // If loading, pendingRegionRef stays populated and will be processed in finally block
    }, 1000);
  };

  const handleMapReady = () => {
    console.log('✅ Map is ready - Platform:', Platform.OS);
    console.log('✅ Map provider:', Platform.OS === 'android' ? 'PROVIDER_GOOGLE' : 'Apple Maps');
    setIsMapReady(true);
  };

  const handleLocateMe = async () => {
    try {
      setLocatingUser(true);

      // Request permission
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        console.log('Location permission denied');
        return;
      }

      // Get current location
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const { latitude, longitude } = location.coords;

      // Animate to user location
      if (mapRef.current) {
        mapRef.current.animateToRegion({
          latitude,
          longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        }, 1000);
      }
    } catch (error) {
      console.error('Error getting location:', error);
    } finally {
      setLocatingUser(false);
    }
  };

  useEffect(() => {
    if (currentBounds) {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      fetchCustomersInBounds(currentBounds);
    }
  }, [searchTerm, categoryFilter]);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  return (
    <View style={styles.mapContainer}>
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        initialRegion={defaultRegion}
        onRegionChangeComplete={handleRegionChange}
        onMapReady={handleMapReady}
        onLayout={() => console.log('🗺️ MapView onLayout - Map should be visible')}
        showsUserLocation={true}
        showsMyLocationButton={true}
        showsCompass={false}
        toolbarEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}
        scrollEnabled={true}
        zoomEnabled={true}
        zoomControlEnabled={true}
        loadingEnabled={true}
        moveOnMarkerPress={false}
      >
        {customers.map((customer) => {
          try {
            const coords = parseCoordinates(customer.coordinates);
            if (!coords) return null;

            return (
              <Marker
                key={customer.uuid}
                coordinate={{
                  latitude: coords.lat,
                  longitude: coords.lng,
                }}
                title={customer.company_name}
                description={customer.full_address}
                onPress={(event) => {
                  if (mapRef.current) {
                    mapRef.current.pointForCoordinate({
                      latitude: coords.lat,
                      longitude: coords.lng,
                    }).then((point) => {
                      setSelectedCustomer(customer);
                      setPopupPosition({ x: point.x, y: point.y });
                    }).catch(() => {
                      const screenData = Dimensions.get('window');
                      setSelectedCustomer(customer);
                      setPopupPosition({ x: screenData.width / 2, y: screenData.height / 2 });
                    });
                  }
                }}
              >
                <View style={[styles.circleMarker, { backgroundColor: '#ff4757' }]} />
              </Marker>
            );
          } catch (error) {
            console.error('Error rendering marker for customer:', customer.uuid, error);
            return null;
          }
        })}
      </MapView>

      <View style={styles.mapOverlay}>
        <ThemedText style={styles.mapOverlayText}>
          {loading ? 'Loading...' : `${customers.length} customer${customers.length !== 1 ? 's' : ''} on map`}
        </ThemedText>
      </View>

      {/* Locate Me Button */}
      <TouchableOpacity
        style={styles.locateMeButton}
        onPress={handleLocateMe}
        disabled={locatingUser}
      >
        <ThemedText style={styles.locateMeButtonText}>
          {locatingUser ? '📍...' : '📍 Locate Me'}
        </ThemedText>
      </TouchableOpacity>

      {selectedCustomer && popupPosition && (
        <View
          style={[
            styles.infoPopup,
            {
              left: Math.max(10, Math.min(popupPosition.x - 150, Dimensions.get('window').width - 310)),
              top: Math.max(100, popupPosition.y - 200),
            }
          ]}
        >
          <TouchableOpacity
            style={styles.popupCloseButton}
            onPress={() => {
              setSelectedCustomer(null);
              setPopupPosition(null);
            }}
          >
            <ThemedText style={styles.popupCloseText}>×</ThemedText>
          </TouchableOpacity>

          <View style={styles.infoPopupContent}>
            <ThemedText style={styles.infoPopupTitle}>{selectedCustomer.company_name}</ThemedText>
            <ThemedText style={styles.infoPopupSubtitle}>{selectedCustomer.full_name}</ThemedText>
            <View style={styles.infoPopupCategory}>
              <ThemedText style={styles.infoPopupCategoryText}>
                {selectedCustomer.category.charAt(0).toUpperCase() + selectedCustomer.category.slice(1)}
              </ThemedText>
            </View>
            <ThemedText style={styles.infoPopupAddress}>{selectedCustomer.full_address}</ThemedText>
            {(() => {
              const totalBalance = Object.values(selectedCustomer.balance_per_currency).reduce((sum, amount) => sum + amount, 0);
              return totalBalance !== 0 ? (
                <ThemedText style={[
                  styles.infoPopupBalance,
                  { color: totalBalance > 0 ? '#10b981' : '#ef4444' }
                ]}>
                  Balance: {totalBalance > 0 ? '+' : ''}${totalBalance.toFixed(2)}
                </ThemedText>
              ) : null;
            })()}

            <TouchableOpacity
              style={styles.visitButton}
              onPress={() => {
                onCustomerPress(selectedCustomer);
                setSelectedCustomer(null);
                setPopupPosition(null);
              }}
            >
              <ThemedText style={styles.visitButtonText}>Visit Customer</ThemedText>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  mapContainer: {
    flex: 1,
    position: 'relative',
  },
  map: {
    ...StyleSheet.absoluteFillObject,
    flex: 1,
  },
  mapOverlay: {
    position: 'absolute',
    top: 16,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  mapOverlayText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    textAlign: 'center',
  },
  locateMeButton: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    backgroundColor: '#5469D4',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 25,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  locateMeButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  circleMarker: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 3,
    borderColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoPopup: {
    position: 'absolute',
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    width: 300,
    maxWidth: '90%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    zIndex: 1001,
  },
  popupCloseButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#f3f4f6',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1002,
  },
  popupCloseText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#6b7280',
    lineHeight: 16,
  },
  infoPopupContent: {
    paddingTop: 8,
  },
  infoPopupTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 4,
  },
  infoPopupSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 8,
  },
  infoPopupCategory: {
    backgroundColor: '#f3f4f6',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  infoPopupCategoryText: {
    fontSize: 12,
    color: '#374151',
    fontWeight: '600',
  },
  infoPopupAddress: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 8,
    lineHeight: 16,
  },
  infoPopupBalance: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  visitButton: {
    backgroundColor: '#5469D4',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  visitButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
});
