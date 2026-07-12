import React, { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import * as Location from 'expo-location';
import { apiCall } from '@/utils/api';
import { useAuth } from '@/contexts/AuthContext';
import { MqttPublisher } from '@/utils/mqttPublisher';
import { startBackgroundTracking, stopBackgroundTracking } from '@/services/backgroundLocation';

interface ClientConfig {
  track_location: boolean;
  ping_seconds: number;
  broker_ws_url: string;
  topic: string;
  user_uuid: string;
  username: string;
}

const RECONNECT_BASE_MS = 5000;
const RECONNECT_MAX_MS = 120000;

/**
 * Location tracker. When the logged-in user has track_location enabled
 * (per /location/client-config), publishes a retained position message to
 * the MQTT topic every ping_seconds — via the foreground watcher while the
 * app is active, and via the background task (services/backgroundLocation)
 * when backgrounded, if the Always permission is granted.
 */
export function LocationTrackingProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  // everything lives in refs: this component renders nothing and must never
  // re-render the tree on tracking state changes
  const configRef = useRef<ClientConfig | null>(null);
  const publisherRef = useRef<MqttPublisher | null>(null);
  const watcherRef = useRef<Location.LocationSubscription | null>(null);
  const lastPublishRef = useRef(0);
  const reconnectDelayRef = useRef(RECONNECT_BASE_MS);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stoppedRef = useRef(true);

  useEffect(() => {
    stoppedRef.current = false;

    const stopTracking = () => {
      stoppedRef.current = true;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      watcherRef.current?.remove();
      watcherRef.current = null;
      publisherRef.current?.close();
      publisherRef.current = null;
      stopBackgroundTracking().catch(() => {});
    };

    const connectPublisher = async (config: ClientConfig) => {
      const publisher = new MqttPublisher({
        url: config.broker_ws_url,
        clientId: `karma-app-${config.user_uuid.slice(0, 8)}-${Math.random().toString(36).slice(2, 8)}`,
        onStatus: (status) => {
          // schedule a reconnect whenever the connection drops mid-tracking
          if ((status === 'closed' || status === 'error') && !stoppedRef.current) {
            scheduleReconnect(config);
          }
          if (status === 'connected') reconnectDelayRef.current = RECONNECT_BASE_MS;
        },
      });
      publisherRef.current = publisher;
      await publisher.connect();
    };

    const scheduleReconnect = (config: ClientConfig) => {
      if (reconnectTimerRef.current || stoppedRef.current) return;
      const delay = reconnectDelayRef.current;
      reconnectDelayRef.current = Math.min(delay * 2, RECONNECT_MAX_MS);
      reconnectTimerRef.current = setTimeout(async () => {
        reconnectTimerRef.current = null;
        if (stoppedRef.current || AppState.currentState !== 'active') return;
        try {
          await connectPublisher(config);
        } catch {
          scheduleReconnect(config);
        }
      }, delay);
    };

    const onPosition = (config: ClientConfig) => (pos: Location.LocationObject) => {
      const now = Date.now();
      if (now - lastPublishRef.current < config.ping_seconds * 1000 - 500) return;
      const publisher = publisherRef.current;
      if (!publisher?.isConnected) return;
      const { latitude, longitude, speed, heading, accuracy } = pos.coords;
      const sent = publisher.publish(
        config.topic,
        JSON.stringify({
          coordinates: `${latitude.toFixed(6)},${longitude.toFixed(6)}`,
          user_uuid: config.user_uuid,
          username: config.username,
          recorded_at: new Date(pos.timestamp || now).toISOString(),
          speed: speed ?? undefined,
          heading: heading ?? undefined,
          accuracy: accuracy ?? undefined,
        })
      );
      if (sent) lastPublishRef.current = now;
    };

    const startTracking = async () => {
      const res = await apiCall<ClientConfig>('/location/client-config');
      const config = res.data;
      if (!config?.track_location || stoppedRef.current) return;
      configRef.current = config;

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted' || stoppedRef.current) return;

      try {
        await connectPublisher(config);
      } catch {
        scheduleReconnect(config);
      }
      if (stoppedRef.current) return;

      watcherRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: Math.max(config.ping_seconds, 5) * 1000,
          distanceInterval: 0,
        },
        onPosition(config)
      );
      if (stoppedRef.current) watcherRef.current?.remove();

      // keep publishing when the app is backgrounded / screen off; falls back
      // to foreground-only when the Always permission is denied
      const bgStarted = await startBackgroundTracking({
        broker_ws_url: config.broker_ws_url,
        topic: config.topic,
        user_uuid: config.user_uuid,
        username: config.username,
        ping_seconds: config.ping_seconds,
      }).catch(() => false);
      if (stoppedRef.current && bgStarted) stopBackgroundTracking().catch(() => {});
    };

    // pause while backgrounded (foreground-only phase), resume when active
    const onAppState = (state: AppStateStatus) => {
      if (!configRef.current) return;
      if (state === 'active' && stoppedRef.current === false && !watcherRef.current) {
        startTracking().catch(() => {});
      } else if (state !== 'active' && watcherRef.current) {
        watcherRef.current.remove();
        watcherRef.current = null;
        publisherRef.current?.close();
        publisherRef.current = null;
      }
    };
    const sub = AppState.addEventListener('change', onAppState);

    if (isAuthenticated) {
      startTracking().catch(() => {});
    }

    return () => {
      sub.remove();
      stopTracking();
    };
  }, [isAuthenticated]);

  return <>{children}</>;
}
