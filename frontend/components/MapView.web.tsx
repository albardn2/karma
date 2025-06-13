
import React, { useEffect, useState, useRef } from 'react';
import { View, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { apiCall } from '@/utils/api';
import { Colors } from '@/constants/Colors';

// Direct imports instead of lazy loading
let MapContainer: any = null;
let TileLayer: any = null;
let Marker: any = null;
let Popup: any = null;
let useMapEvents: any = null;

// Load react-leaflet components only in browser environment
if (typeof window !== 'undefined') {
  const leaflet = require('react-leaflet');
  MapContainer = leaflet.MapContainer;
  TileLayer = leaflet.TileLayer;
  Marker = leaflet.Marker;
  Popup = leaflet.Popup;
  useMapEvents = leaflet.useMapEvents;
}

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

const getMarkerColor = (customer: Customer): string => {
  const totalBalance = Object.values(customer.balance_per_currency).reduce((sum, amount) => sum + amount, 0);
  if (totalBalance > 0) return Colors.semantic.success; // Green for positive balance
  if (totalBalance < 0) return Colors.semantic.error; // Red for negative balance
  // Use brand color for consistency on mobile
  return Colors.gradient.primary;
};

const createCustomIcon = (color: string) => {
  if (typeof window === 'undefined') return null;

  const L = require('leaflet');
  return L.divIcon({
    className: 'custom-marker',
    html: `<div style="
      background-color: ${color};
      width: 20px;
      height: 20px;
      border-radius: 50%;
      border: 2px solid white;
      box-shadow: 0 2px 4px rgba(0,0,0,0.3);
    "></div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
};

// Convert map bounds to WKT polygon format
const boundsToWKT = (bounds: any): string => {
  const sw = bounds.getSouthWest();
  const ne = bounds.getNorthEast();
  const nw = { lat: ne.lat, lng: sw.lng };
  const se = { lat: sw.lat, lng: ne.lng };

  return `POLYGON((${sw.lng} ${sw.lat}, ${nw.lng} ${nw.lat}, ${ne.lng} ${ne.lat}, ${se.lng} ${se.lat}, ${sw.lng} ${sw.lat}))`;
};

const MapEventHandler = ({ onBoundsChange }: { onBoundsChange: (wkt: string) => void }) => {
  if (!useMapEvents) return null;

  const map = useMapEvents({
    moveend: () => {
      const bounds = map.getBounds();
      const wkt = boundsToWKT(bounds);
      onBoundsChange(wkt);
    },
    zoomend: () => {
      const bounds = map.getBounds();
      const wkt = boundsToWKT(bounds);
      onBoundsChange(wkt);
    },
  });

  return null;
};

const LoadingFallback = () => (
  <View style={styles.loadingContainer}>
    <Text style={styles.loadingText}>Loading map...</Text>
  </View>
);

export const MapViewComponent: React.FC<MapViewComponentProps> = ({ 
  onCustomerPress, 
  searchTerm = '', 
  categoryFilter = 'all' 
}) => {
  const [isClient, setIsClient] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentBounds, setCurrentBounds] = useState<string | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [popupPosition, setPopupPosition] = useState<{ x: number; y: number } | null>(null);
  const mapRef = useRef<any>(null);

  useEffect(() => {
    setIsClient(true);

    // Load leaflet CSS
    if (typeof window !== 'undefined') {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.7.1/dist/leaflet.css';
      document.head.appendChild(link);

      // Fix for default markers
      const L = require('leaflet');
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
        iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
      });
    }
  }, []);

  const fetchCustomersInBounds = async (wkt: string) => {
    try {
      setLoading(true);

      const params = new URLSearchParams({
        within_polygon: wkt,
        per_page: '500' // Get more items for map view
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
        setCustomers([]);
      }
    } catch (error) {
      console.error('Error fetching customers in bounds:', error);
      setCustomers([]);
    } finally {
      setLoading(false);
    }
  };

  const handleBoundsChange = (wkt: string) => {
    if (wkt !== currentBounds) {
      setCurrentBounds(wkt);
      // Clear existing customers first
      setCustomers([]);
      fetchCustomersInBounds(wkt);
    }
  };

  // Refetch when search or filter changes
  useEffect(() => {
    if (currentBounds) {
      fetchCustomersInBounds(currentBounds);
    }
  }, [searchTerm, categoryFilter]);

  if (!isClient || !MapContainer) {
    return <LoadingFallback />;
  }

  // Default center coordinates (you can adjust these)
  const defaultCenter: [number, number] = [40.7128, -74.0060]; // New York City
  const defaultZoom = 10;

  return (
    <View style={styles.mapContainer}>
      <MapContainer
        center={defaultCenter}
        zoom={defaultZoom}
        style={{ height: '100%', width: '100%' }}
        zoomControl={true}
        scrollWheelZoom={true}
        ref={mapRef}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <MapEventHandler onBoundsChange={handleBoundsChange} />

        {customers.map((customer) => {
          const coords = parseCoordinates(customer.coordinates)!;
          const totalBalance = Object.values(customer.balance_per_currency).reduce((sum, amount) => sum + amount, 0);
          const markerColor = getMarkerColor(customer);

          return (
            <Marker
              key={customer.uuid}
              position={[coords.lat, coords.lng]}
              icon={createCustomIcon(markerColor)}
              eventHandlers={{
                click: (e) => {
                  setSelectedCustomer(customer);
                  const map = e.target._map;
                  const point = map.latLngToContainerPoint([coords.lat, coords.lng]);
                  setPopupPosition({ x: point.x, y: point.y });
                },
              }}
            />
          );
        })}
      </MapContainer>

      <View style={styles.mapOverlay}>
        <View style={styles.mapOverlayContent}>
          <Text style={styles.mapOverlayIcon}>📍</Text>
          <Text style={styles.mapOverlayText}>
            {loading ? 'Loading...' : `${customers.length} customer${customers.length !== 1 ? 's' : ''} on map`}
          </Text>
        </View>
      </View>

      {/* Custom Info Popup */}
      {selectedCustomer && popupPosition && (
        <View
          style={[
            styles.infoPopup,
            {
              left: popupPosition.x - 150,
              top: popupPosition.y - 180,
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
            <Text style={styles.popupCloseText}>×</Text>
          </TouchableOpacity>
          
          <View style={styles.infoPopupContent}>
            <Text style={styles.infoPopupTitle}>{selectedCustomer.company_name}</Text>
            <Text style={styles.infoPopupSubtitle}>{selectedCustomer.full_name}</Text>
            <View style={styles.infoPopupCategory}>
              <Text style={styles.infoPopupCategoryText}>
                {selectedCustomer.category.charAt(0).toUpperCase() + selectedCustomer.category.slice(1)}
              </Text>
            </View>
            <Text style={styles.infoPopupAddress}>{selectedCustomer.full_address}</Text>
            {(() => {
              const totalBalance = Object.values(selectedCustomer.balance_per_currency).reduce((sum, amount) => sum + amount, 0);
              return totalBalance !== 0 ? (
                <Text style={[
                  styles.infoPopupBalance,
                  { color: totalBalance > 0 ? '#10b981' : '#ef4444' }
                ]}>
                  Balance: {totalBalance > 0 ? '+' : ''}${totalBalance.toFixed(2)}
                </Text>
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
              <Text style={styles.visitButtonText}>Visit Customer</Text>
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  loadingText: {
    fontSize: 16,
    color: '#6b7280',
  },
  mapOverlay: {
    position: 'absolute',
    top: 20,
    left: '50%',
    transform: [{ translateX: -75 }],
    backgroundColor: 'rgba(255, 255, 255, 0.98)',
    borderRadius: 25,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    zIndex: 1000,
    minWidth: 150,
  },
  mapOverlayContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapOverlayIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  mapOverlayText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
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
  popupCategory: {
    fontSize: 12,
    backgroundColor: '#f3f4f6',
    color: '#374151',
    padding: '2px 6px',
    borderRadius: 4,
    display: 'inline-block',
    marginBottom: 8,
  },
  popupAddress: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 8,
  },
  popupBalance: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  infoPopup: {
    position: 'absolute',
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    width: 300,
    maxWidth: '90vw',
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
