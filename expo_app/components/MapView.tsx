import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, ActivityIndicator, Dimensions, ScrollView, TouchableOpacity, Platform } from 'react-native';
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
  category: 'roastery' | 'restaurant' | 'minimarket' | 'supermarket' | 'distributer' | 'school' | 'university' | 'hospital';
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

/** One map pin: a single customer, or a group standing in for several. */
interface MapCluster {
  latitude: number;
  longitude: number;
  count: number;
  /** Populated only when count === 1. */
  customer_uuid: string | null;
  company_name: string | null;
  /** True extent of the members — the zoom target, and the co-location signal. */
  min_latitude: number;
  max_latitude: number;
  min_longitude: number;
  max_longitude: number;
}

interface MapClusterPage {
  clusters: MapCluster[];
  total_count: number;
  cell_size_degrees: number;
  max_points: number;
}

/**
 * Never let a zoom target collapse to a point.
 *
 * fitToCoordinates / animateToRegion on a degenerate extent slams the map to
 * maximum zoom, which looks like the app breaking. Clusters of customers on one
 * street are routinely near-coincident, so this is the common case rather than a
 * corner one.
 */
const MIN_ZOOM_SPAN = 0.002;

/**
 * The shape the popup renders before the customer's detail has arrived.
 *
 * Only company_name is real; the rest is empty so each line of the card simply
 * does not draw until the fetch fills it in. Balance is an empty object, which the
 * card's own total already treats as nothing owed.
 */
const PLACEHOLDER_CUSTOMER: Customer = {
  uuid: '',
  email_address: null,
  company_name: '',
  full_name: '',
  phone_number: '',
  full_address: '',
  business_cards: null,
  notes: null,
  // Empty rather than any real category: the card would otherwise state a
  // category it is only guessing at for the moment before the fetch lands, and
  // the blocks below are guarded on this being non-empty.
  category: '' as Customer['category'],
  coordinates: null,
  created_at: '',
  is_deleted: false,
  balance_per_currency: {},
};

/** Beyond three digits the number stops fitting the pin. */
const formatClusterCount = (n: number): string => (n > 999 ? '999+' : String(n));

interface MapViewComponentProps {
  onCustomerPress: (customer: Customer) => void;
  searchTerm?: string;
  categoryFilter?: string;
}

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
  const [clusters, setClusters] = useState<MapCluster[]>([]);
  // How many customers the pins stand for, which is not the number of pins.
  const [customerTotal, setCustomerTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [currentBounds, setCurrentBounds] = useState<string | null>(null);
  const [isMapReady, setIsMapReady] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  // Members of a pin that cannot be split by zooming, shown as a chooser.
  const [coincident, setCoincident] = useState<Customer[] | null>(null);
  // See the marker below: true only for the moment after a pin set changes.
  const [tracksViewChanges, setTracksViewChanges] = useState(true);
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

  /**
   * Ask the server to summarise the viewport, rather than to enumerate it.
   *
   * This used to call `GET /customer/?within_polygon=...&per_page=50`, and the
   * per_page was a fiction: that route overrides it to 10000 whenever a polygon
   * is present, then serialises a full customer per row — including
   * balance_per_currency, which walks every order, invoice, payment and note.
   * Measured at 574 bytes and 1.4 ms per customer, so an account with 10,000
   * customers meant roughly 5.7 MB and 14 s of work for every single pan, on a
   * phone, repeatedly. That is what was killing the app.
   *
   * `/customer/map-clusters` answers with at most 100 rows whatever the viewport
   * holds, so the payload no longer scales with the number of customers.
   */
  const fetchClustersInBounds = async (wkt: string) => {
    if (isLoadingRef.current) {
      console.log('Already loading, skipping request');
      return;
    }

    try {
      isLoadingRef.current = true;
      setLoading(true);

      const params = new URLSearchParams({ within_polygon: wkt });

      if (searchTerm) {
        params.append('full_name', searchTerm);
      }

      if (categoryFilter && categoryFilter !== 'all') {
        params.append('category', categoryFilter);
      }

      const response = await apiCall<MapClusterPage>(`/customer/map-clusters?${params.toString()}`);

      if (response.status === 200 && response.data) {
        setClusters(response.data.clusters || []);
        setCustomerTotal(response.data.total_count || 0);
        console.log(
          `Map: ${response.data.clusters?.length ?? 0} pins covering ` +
          `${response.data.total_count} customers (cell ${response.data.cell_size_degrees}deg)`
        );
      } else {
        console.error('Failed to load map clusters:', response);
        if (response.status !== 401) {
          setClusters([]);
          setCustomerTotal(0);
        }
      }
    } catch (error) {
      console.error('Error fetching map clusters:', error);
    } finally {
      setLoading(false);
      isLoadingRef.current = false;
      
      // Check if there's a pending region change
      if (pendingRegionRef.current) {
        const pendingRegion = pendingRegionRef.current;
        pendingRegionRef.current = null;
        const wkt = regionToWKT(pendingRegion);
        setCurrentBounds(wkt);
        fetchClustersInBounds(wkt);
      }
    }
  };

  const handleRegionChange = (region: Region) => {
    // Record the region BEFORE the readiness check. onRegionChangeComplete can
    // fire before onMapReady, and dropping that first region on the floor is why
    // the map used to open empty and only populate once the user happened to pan
    // — nothing else ever triggered a fetch.
    pendingRegionRef.current = region;
    if (!isMapReady) return;

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
          fetchClustersInBounds(wkt);
        } else {
          pendingRegionRef.current = null; // Clear pending if bounds haven't changed
        }
      }
      // If loading, pendingRegionRef stays populated and will be processed in finally block
    }, 1000);
  };

  /**
   * Open a single customer, or break a cluster open.
   *
   * A cluster normally zooms to the extent of its own members, which the exactly
   * nested grid guarantees will split it into smaller pins. The exception is a
   * cluster whose members share a coordinate — several shops at one address, or
   * records saved from the same spot. Those have a zero-span extent and no amount
   * of zooming will ever separate them, so zooming would strand the user tapping
   * a pin that never changes. Four customers in the local database sit on one
   * point, so this is ordinary rather than theoretical: those are listed instead.
   */
  const handlePinPress = async (cluster: MapCluster) => {
    if (cluster.count === 1 && cluster.customer_uuid) {
      await openCustomerPopup(
        cluster.customer_uuid,
        cluster.latitude,
        cluster.longitude,
        cluster.company_name,
      );
      return;
    }

    const latSpan = cluster.max_latitude - cluster.min_latitude;
    const lngSpan = cluster.max_longitude - cluster.min_longitude;

    if (latSpan <= 0 && lngSpan <= 0) {
      await showCoincidentCustomers(cluster);
      return;
    }

    // Pad the extent so the outermost members are not sitting on the screen edge,
    // and floor it so a tight cluster does not throw the map to maximum zoom.
    mapRef.current?.animateToRegion(
      {
        latitude: (cluster.min_latitude + cluster.max_latitude) / 2,
        longitude: (cluster.min_longitude + cluster.max_longitude) / 2,
        latitudeDelta: Math.max(latSpan * 1.4, MIN_ZOOM_SPAN),
        longitudeDelta: Math.max(lngSpan * 1.4, MIN_ZOOM_SPAN),
      },
      500,
    );
  };

  /**
   * The popup needs the full customer — address, category, balance — which the
   * cluster payload deliberately does not carry. Fetching one customer on tap is
   * what lets the map itself stay cheap.
   */
  const openCustomerPopup = async (
    uuid: string,
    lat: number,
    lng: number,
    knownName?: string | null,
  ) => {
    const placePopup = () => {
      const screen = Dimensions.get('window');
      mapRef.current
        ?.pointForCoordinate({ latitude: lat, longitude: lng })
        .then((point) => setPopupPosition({ x: point.x, y: point.y }))
        .catch(() => setPopupPosition({ x: screen.width / 2, y: screen.height / 2 }));
    };

    // Open on the name the pin already carries, so the tap feels instant, and let
    // the address, category and balance arrive a moment later. Waiting for the
    // round trip before showing anything made the most frequent gesture on the
    // screen feel like it had missed.
    if (knownName) {
      setSelectedCustomer({ ...PLACEHOLDER_CUSTOMER, uuid, company_name: knownName });
      placePopup();
    }

    try {
      const response = await apiCall<Customer>(`/customer/${uuid}`);
      if (response.status === 200 && response.data) {
        setSelectedCustomer(response.data);
        if (!knownName) placePopup();
      } else {
        console.error('Failed to load customer for popup:', response);
        // nothing to enrich and nothing shown yet — do not leave a blank card
        if (!knownName) setSelectedCustomer(null);
      }
    } catch (error) {
      console.error('Error loading customer for popup:', error);
      if (!knownName) setSelectedCustomer(null);
    }
  };

  /**
   * List customers that share one coordinate, so a pin that cannot split is
   * still openable. Scoped to a hair's breadth around the point rather than to
   * the grid cell, so this really is the co-located set and not the neighbours.
   */
  const showCoincidentCustomers = async (cluster: MapCluster) => {
    const e = 0.00002; // ~2 m
    const { latitude: lat, longitude: lng } = cluster;
    const wkt =
      `POLYGON((${lng - e} ${lat - e}, ${lng - e} ${lat + e}, ` +
      `${lng + e} ${lat + e}, ${lng + e} ${lat - e}, ${lng - e} ${lat - e}))`;
    const params = new URLSearchParams({ within_polygon: wkt });
    if (searchTerm) params.append('full_name', searchTerm);
    if (categoryFilter && categoryFilter !== 'all') params.append('category', categoryFilter);

    try {
      const response = await apiCall<CustomerPage>(`/customer/?${params.toString()}`);
      const found = response.data?.customers ?? [];
      if (response.status === 200 && found.length) {
        setCoincident(found);
      } else {
        console.error('Could not load co-located customers:', response);
      }
    } catch (error) {
      console.error('Error loading co-located customers:', error);
    }
  };

  const handleMapReady = () => {
    console.log('✅ Map is ready - Platform:', Platform.OS);
    console.log('✅ Map provider:', Platform.OS === 'android' ? 'PROVIDER_GOOGLE' : 'Apple Maps');
    setIsMapReady(true);
    // Load whatever is on screen now. Falls back to the initial region when the
    // map settled without reporting one, so opening the map always shows pins
    // instead of an empty city.
    const region = pendingRegionRef.current ?? defaultRegion;
    pendingRegionRef.current = null;
    const wkt = regionToWKT(region);
    setCurrentBounds(wkt);
    fetchClustersInBounds(wkt);
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
      fetchClustersInBounds(currentBounds);
    }
  }, [searchTerm, categoryFilter]);

  // Give a newly-rendered pin set one window to rasterise itself, then freeze it.
  useEffect(() => {
    setTracksViewChanges(true);
    const timer = setTimeout(() => setTracksViewChanges(false), 600);
    return () => clearTimeout(timer);
  }, [clusters]);

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
        {clusters.map((cluster) => {
          const isSingle = cluster.count === 1;
          return (
            <Marker
              // The count is part of the key on purpose. tracksViewChanges is off
              // below, which freezes each marker's bitmap after its first frame,
              // and Apple Maps does not reliably redraw a custom marker view in
              // place either (TripMap.tsx works around the same thing). Without
              // the count in the key, a pin that regrouped from 12 to 30 members
              // would keep displaying 12.
              key={`${cluster.latitude.toFixed(6)},${cluster.longitude.toFixed(6)}:${cluster.count}`}
              coordinate={{ latitude: cluster.latitude, longitude: cluster.longitude }}
              // Track, then stop. Left at its default (true) every custom-child
              // marker joins a 40 ms re-rasterization loop on the Android UI
              // thread — a buildDrawingCache plus a bitmap upload each, for every
              // marker, forever — which at up to 100 pins is what turns a slow
              // map into an out-of-memory crash. But pinned to false from mount,
              // a marker can be rasterised before its child has laid out and then
              // never redrawn, leaving a pin with no number in it. So it tracks
              // just long enough to capture a frame and is then frozen.
              tracksViewChanges={tracksViewChanges}
              // A native callout would fight the custom popup below, so only the
              // single-customer pins get one — matching the previous behaviour.
              title={isSingle ? cluster.company_name ?? undefined : undefined}
              onPress={() => handlePinPress(cluster)}
            >
              {isSingle ? (
                <View style={[styles.circleMarker, { backgroundColor: '#ff4757' }]} />
              ) : (
                <View style={[styles.circleMarker, styles.clusterMarker]}>
                  <ThemedText
                    style={[
                      styles.clusterCount,
                      cluster.count > 99 && styles.clusterCountSmall,
                    ]}
                    // the pin is deliberately close to the plain marker's size,
                    // so the number must not be allowed to wrap or ellipsise
                    numberOfLines={1}
                    allowFontScaling={false}
                  >
                    {formatClusterCount(cluster.count)}
                  </ThemedText>
                </View>
              )}
            </Marker>
          );
        })}
      </MapView>

      <View style={styles.mapOverlay}>
        <ThemedText style={styles.mapOverlayText}>
          {loading
            ? 'Loading...'
            : clusters.length === customerTotal
              // every pin is one customer, so there is nothing to explain
              ? `${customerTotal} customer${customerTotal !== 1 ? 's' : ''} on map`
              // say both numbers: "14 pins" alone hides customers, and "161
              // customers" alone makes the pin count look like a bug
              : `${customerTotal} customers in ${clusters.length} groups — zoom in to split`}
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

      {/* A pin whose members share a coordinate cannot be split by zooming, so it
          opens as a list instead of moving the map. */}
      {coincident && (
        <View style={styles.coincidentSheet}>
          <View style={styles.coincidentHeader}>
            <ThemedText style={styles.coincidentTitle}>
              {coincident.length} customers at this location
            </ThemedText>
            <TouchableOpacity onPress={() => setCoincident(null)} style={styles.popupCloseButton}>
              <ThemedText style={styles.popupCloseText}>×</ThemedText>
            </TouchableOpacity>
          </View>
          <ScrollView>
            {coincident.map((c) => (
              <TouchableOpacity
                key={c.uuid}
                style={styles.coincidentRow}
                onPress={() => {
                  setCoincident(null);
                  onCustomerPress(c);
                }}
              >
                <ThemedText style={styles.coincidentName}>{c.company_name || c.full_name}</ThemedText>
                {!!c.full_address && (
                  <ThemedText style={styles.coincidentAddress} numberOfLines={1}>
                    {c.full_address}
                  </ThemedText>
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

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
            {!!selectedCustomer.full_name && (
              <ThemedText style={styles.infoPopupSubtitle}>{selectedCustomer.full_name}</ThemedText>
            )}
            {!!selectedCustomer.category && (
              <View style={styles.infoPopupCategory}>
                <ThemedText style={styles.infoPopupCategoryText}>
                  {selectedCustomer.category.charAt(0).toUpperCase() + selectedCustomer.category.slice(1)}
                </ThemedText>
              </View>
            )}
            {!!selectedCustomer.full_address && (
              <ThemedText style={styles.infoPopupAddress}>{selectedCustomer.full_address}</ThemedText>
            )}
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
              style={[styles.visitButton, !selectedCustomer.uuid && styles.visitButtonDisabled]}
              // disabled until the real record has arrived: the placeholder has no
              // uuid, and handing that to the caller would navigate nowhere
              disabled={!selectedCustomer.uuid}
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
  // Same pin, with room for a number. Kept to 32 dp on purpose: react-native-maps
  // 1.20.1 never writes the marker's size fields, so Android falls back to a
  // 100 x 100 DEVICE pixel bitmap — at density 3 anything past ~33 dp is clipped.
  clusterMarker: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#e8352e',
  },
  clusterCount: {
    color: '#ffffff',
    fontSize: 12,
    lineHeight: 14,
    fontWeight: '700',
    textAlign: 'center',
    includeFontPadding: false,
  },
  clusterCountSmall: {
    fontSize: 9,
    lineHeight: 11,
  },
  coincidentSheet: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 90,
    maxHeight: '55%',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 1001,
  },
  coincidentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
  },
  coincidentTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1f2937',
  },
  coincidentRow: {
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  coincidentName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
  },
  coincidentAddress: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
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
  visitButtonDisabled: {
    opacity: 0.5,
  },
  visitButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
});
