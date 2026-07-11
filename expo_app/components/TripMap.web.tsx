import React from 'react';
import { StyleSheet, View } from 'react-native';
import { ThemedText } from '@/components/ThemedText';

export interface TripMapStop {
  taskExecutionUuid: string;
  tripStopUuid: string;
  customerName: string;
  status: string;
  lat: number | null;
  lng: number | null;
  index: number;
}

// react-native-maps has no web support; render a placeholder so the surrounding
// UI (the slide-up stops sheet) stays usable in the web preview. The real map
// renders on iOS/Android via TripMap.tsx.
export function TripMap({ stops, currentStopUuid }: {
  stops: TripMapStop[];
  currentStopUuid: string | null;
  onStopPress: (stop: TripMapStop) => void;
  armedStopUuid?: string | null;
  onArm?: (uuid: string | null) => void;
  onSetCurrent?: (stop: TripMapStop) => void;
  areas?: { uuid: string; name: string; polygons: unknown[] }[];
}) {
  const current = stops.find((s) => s.tripStopUuid === currentStopUuid);
  const pinned = stops.filter((s) => s.lat != null && s.lng != null);
  return (
    <View style={styles.container}>
      <ThemedText style={styles.icon}>🗺️</ThemedText>
      <ThemedText style={styles.title}>Map view</ThemedText>
      <ThemedText style={styles.msg}>Interactive map runs on the mobile app (iOS/Android).</ThemedText>
      <ThemedText style={styles.meta}>{pinned.length} stop{pinned.length === 1 ? '' : 's'} with a location</ThemedText>
      {current && (
        <ThemedText style={styles.meta}>
          Current: {current.customerName}{current.lat != null ? ` · ${current.lat.toFixed(4)}, ${current.lng?.toFixed(4)}` : ''}
        </ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: '#eef2ff', padding: 24 },
  icon: { fontSize: 44, marginBottom: 8 },
  title: { fontSize: 18, fontWeight: '700', marginBottom: 4 },
  msg: { fontSize: 14, opacity: 0.7, textAlign: 'center', marginBottom: 8 },
  meta: { fontSize: 13, opacity: 0.6, textAlign: 'center' },
});
