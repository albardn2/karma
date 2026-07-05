import React, { useMemo, useRef } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE, Region } from 'react-native-maps';

export interface TripMapStop {
  taskExecutionUuid: string;
  tripStopUuid: string;
  customerName: string;
  status: string;
  lat: number | null;
  lng: number | null;
  index: number;
}

const statusColor = (status: string, isCurrent: boolean) => {
  if (isCurrent) return '#5469D4';
  if (status === 'completed') return '#16a34a';
  if (status === 'cancelled' || status === 'failed') return '#dc2626';
  return '#9ca3af';
};

// Damascus fallback (matches the rest of the app)
const DEFAULT_REGION: Region = {
  latitude: 33.5138,
  longitude: 36.2765,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08,
};

export function TripMap({
  stops,
  currentStopUuid,
  onStopPress,
}: {
  stops: TripMapStop[];
  currentStopUuid: string | null;
  onStopPress: (stop: TripMapStop) => void;
}) {
  const mapRef = useRef<MapView>(null);
  const pinned = stops.filter((s) => s.lat != null && s.lng != null);

  const initialRegion = useMemo<Region>(() => {
    const current = pinned.find((s) => s.tripStopUuid === currentStopUuid) || pinned[0];
    if (current && current.lat != null && current.lng != null) {
      return { latitude: current.lat, longitude: current.lng, latitudeDelta: 0.05, longitudeDelta: 0.05 };
    }
    return DEFAULT_REGION;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinned.length, currentStopUuid]);

  return (
    <View style={StyleSheet.absoluteFill}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        initialRegion={initialRegion}
        showsUserLocation
        showsMyLocationButton
        loadingEnabled
      >
        {pinned.map((s) => {
          const isCurrent = s.tripStopUuid === currentStopUuid;
          return (
            <Marker
              key={s.taskExecutionUuid}
              coordinate={{ latitude: s.lat as number, longitude: s.lng as number }}
              title={s.customerName}
              description={isCurrent ? 'Current stop' : s.status}
              onPress={() => onStopPress(s)}
            >
              <View style={[styles.pin, { backgroundColor: statusColor(s.status, isCurrent) }, isCurrent && styles.pinCurrent]}>
                <View style={styles.pinInner} />
              </View>
            </Marker>
          );
        })}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  pin: {
    width: 26, height: 26, borderRadius: 13, borderWidth: 3, borderColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 2, shadowOffset: { width: 0, height: 1 },
  },
  pinCurrent: { width: 32, height: 32, borderRadius: 16 },
  pinInner: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' },
});
