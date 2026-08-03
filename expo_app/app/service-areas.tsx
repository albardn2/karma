import React, { useCallback, useMemo, useState } from 'react';
import { Alert, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { ThemedText } from '@/components/ThemedText';
import { ModuleListScreen } from '@/components/ModuleListScreen';
import { useLanguage } from '@/contexts/LanguageContext';
import { formatNumericDate } from '@/utils/date';

interface ServiceArea {
  uuid: string;
  name: string;
  description?: string | null;
  created_at: string;
}

/**
 * Service areas — the polygons the business delivers into.
 *
 * The reason this is worth a screen rather than a config page: `intersects_polygon`
 * answers "which area am I standing in" in one request, which is a question a driver
 * actually asks and cannot otherwise answer. WKT wants LONGITUDE FIRST, so a GPS fix
 * goes in as POINT(lon lat) — the transposition is silent, returning plausibly empty
 * results rather than an error.
 *
 * Two things deliberately absent. There is no create form: creating an area means
 * typing a WKT polygon, which is not a phone interaction, and a driver's POST is
 * refused anyway. And nothing renders the raw geometry string — the detail screen draws
 * it instead.
 *
 * Passing `intersects_polygon` makes the server force per_page to 10000, so that mode
 * is effectively unpaginated. That is the server's choice, not something to work
 * around, but it is why the chip is a filter rather than the default view.
 */
export default function ServiceAreasScreen() {
  const router = useRouter();
  const { t } = useLanguage();
  const [near, setNear] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);

  // memoised: ModuleListScreen refetches when this object's identity changes, so a
  // fresh literal every render would loop
  const params = useMemo(() => {
    const p: Record<string, string> = {};
    if (near) p.intersects_polygon = near;
    return p;
  }, [near]);

  const toggleNear = useCallback(async () => {
    if (near) return setNear(null);
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('serviceAreas.locationDenied'));
        return;
      }
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      // lon first — WKT is (x y), not (lat lon)
      setNear(`POINT(${pos.coords.longitude} ${pos.coords.latitude})`);
    } catch {
      Alert.alert(t('serviceAreas.locationFailed'));
    } finally {
      setLocating(false);
    }
  }, [near, t]);

  return (
    <ModuleListScreen<ServiceArea>
      module="service-areas"
      title={t('menu.serviceAreas')}
      endpoint="/service-area/"
      itemsKey="items"
      searchParam="name"
      searchPlaceholder={t('serviceAreas.searchPlaceholder')}
      params={params}
      keyExtractor={(a) => a.uuid}
      header={
        <TouchableOpacity
          style={[styles.nearChip, !!near && styles.nearChipOn]}
          onPress={toggleNear}
          disabled={locating}
          testID="service-areas-near"
        >
          <ThemedText style={[styles.nearText, !!near && styles.nearTextOn]}>
            {locating
              ? t('serviceAreas.locating')
              : near
                ? t('serviceAreas.nearOn')
                : t('serviceAreas.nearOff')}
          </ThemedText>
        </TouchableOpacity>
      }
      renderItem={(a) => (
        <TouchableOpacity
          style={styles.row}
          onPress={() => router.push(`/service-areas/${a.uuid}`)}
          testID={`service-area-${a.uuid}`}
        >
          <View style={styles.rowLeft}>
            <ThemedText style={styles.name} numberOfLines={1}>
              {a.name}
            </ThemedText>
            {!!a.description && (
              <ThemedText style={styles.desc} numberOfLines={1}>
                {a.description}
              </ThemedText>
            )}
          </View>
          <ThemedText style={styles.when}>
            {a.created_at ? formatNumericDate(new Date(a.created_at)) : ''}
          </ThemedText>
        </TouchableOpacity>
      )}
    />
  );
}

const styles = StyleSheet.create({
  nearChip: {
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
    marginBottom: 12,
  },
  nearChipOn: { backgroundColor: '#5469D4', borderColor: '#5469D4' },
  nearText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  nearTextOn: { color: '#fff' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  rowLeft: { flex: 1 },
  name: { fontSize: 15, fontWeight: '600', color: '#1f2937' },
  desc: { fontSize: 12, opacity: 0.55, marginTop: 2 },
  when: { fontSize: 11, opacity: 0.5 },
});
