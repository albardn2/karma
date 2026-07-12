// Background location tracking: keeps publishing while the app is
// backgrounded or the screen is off, on both platforms.
//
// iOS: needs the "Always" permission + UIBackgroundModes location (set via
// the expo-location config plugin) — location updates wake the app briefly
// and the task handler runs.
// Android: needs ACCESS_BACKGROUND_LOCATION + a foreground service with a
// persistent notification (required by Android 10+ for continuous location);
// expo-location's foregroundService option handles the service.
//
// The task handler runs OUTSIDE React (possibly headless, app killed), so it
// reads its config from an AsyncStorage snapshot written when tracking
// starts, opens a short-lived MQTT connection, publishes the latest point
// (retained), and closes.
import { AppState } from 'react-native';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MqttPublisher } from '@/utils/mqttPublisher';

export const BG_LOCATION_TASK = 'karma-bg-location';
const BG_CONFIG_KEY = 'bg_location_config';
const BG_LAST_PUBLISH_KEY = 'bg_location_last_publish';

interface BgConfig {
  broker_ws_url: string;
  topic: string;
  user_uuid: string;
  username: string;
  ping_seconds: number;
}

// Module scope, as required by expo-task-manager: this runs even when the
// app was launched headless for a background location batch.
TaskManager.defineTask(BG_LOCATION_TASK, async ({ data, error }) => {
  if (error || !data) return;
  // the foreground tracker owns publishing while the app is active
  if (AppState.currentState === 'active') return;

  const { locations } = data as { locations: Location.LocationObject[] };
  const latest = locations?.[locations.length - 1];
  if (!latest) return;

  try {
    const raw = await AsyncStorage.getItem(BG_CONFIG_KEY);
    if (!raw) return;
    const config: BgConfig = JSON.parse(raw);

    // throttle to the user's cadence across task invocations
    const lastRaw = await AsyncStorage.getItem(BG_LAST_PUBLISH_KEY);
    const last = lastRaw ? Number(lastRaw) : 0;
    if (Date.now() - last < config.ping_seconds * 1000 - 500) return;

    const publisher = new MqttPublisher({
      url: config.broker_ws_url,
      clientId: `karma-bg-${config.user_uuid.slice(0, 8)}-${Math.random().toString(36).slice(2, 8)}`,
      keepaliveSec: 30,
    });
    await publisher.connect();
    const { latitude, longitude, speed, heading, accuracy } = latest.coords;
    publisher.publish(
      config.topic,
      JSON.stringify({
        coordinates: `${latitude.toFixed(6)},${longitude.toFixed(6)}`,
        user_uuid: config.user_uuid,
        username: config.username,
        recorded_at: new Date(latest.timestamp || Date.now()).toISOString(),
        speed: speed ?? undefined,
        heading: heading ?? undefined,
        accuracy: accuracy ?? undefined,
        background: true,
      })
    );
    await AsyncStorage.setItem(BG_LAST_PUBLISH_KEY, String(Date.now()));
    // give the QoS0 publish a moment to flush before closing the socket
    await new Promise((r) => setTimeout(r, 500));
    publisher.close();
  } catch {
    // background budget is tight — never throw out of the task
  }
});

/**
 * Start background location updates. Requires the foreground permission to
 * already be granted; requests the background ("Always") permission and
 * returns false (leaving foreground-only tracking intact) if denied.
 */
export async function startBackgroundTracking(config: BgConfig): Promise<boolean> {
  const { status } = await Location.requestBackgroundPermissionsAsync();
  if (status !== 'granted') return false;

  await AsyncStorage.setItem(BG_CONFIG_KEY, JSON.stringify(config));

  const already = await Location.hasStartedLocationUpdatesAsync(BG_LOCATION_TASK).catch(() => false);
  if (already) return true;

  await Location.startLocationUpdatesAsync(BG_LOCATION_TASK, {
    accuracy: Location.Accuracy.Balanced,
    timeInterval: Math.max(config.ping_seconds, 15) * 1000, // android hint
    distanceInterval: 0,
    // batch updates so iOS wakes the app at roughly the publish cadence
    deferredUpdatesInterval: Math.max(config.ping_seconds, 15) * 1000,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true, // iOS blue pill — honest UX
    foregroundService: {
      // Android 10+: continuous background location requires a foreground
      // service with a visible notification
      notificationTitle: 'Karma location tracking',
      notificationBody: 'Sharing your live location with dispatch',
      killServiceOnDestroy: false,
    },
  });
  return true;
}

export async function stopBackgroundTracking(): Promise<void> {
  const started = await Location.hasStartedLocationUpdatesAsync(BG_LOCATION_TASK).catch(() => false);
  if (started) {
    await Location.stopLocationUpdatesAsync(BG_LOCATION_TASK).catch(() => {});
  }
  await AsyncStorage.removeItem(BG_CONFIG_KEY);
}
