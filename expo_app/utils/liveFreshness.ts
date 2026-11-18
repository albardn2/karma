import { parseTs } from '@/utils/date';

/**
 * How old a driver's live position is, and whether it still counts as live.
 *
 * The age is measured from the device's fix time (`recorded_at`), never from when
 * the message reached this app: publishers set retain = true, so the broker replays
 * each driver's last position the moment a map subscribes, and its arrival time is
 * always "just now" however old the fix is. A payload without a usable
 * `recorded_at` has an unknown age and is drawn as stale.
 */

/** Used until /location/client-config answers, and when it omits the window. */
export const DEFAULT_FRESH_MINUTES = 5;

export const FRESH_COLOR = '#16a34a';
export const STALE_COLOR = '#9ca3af';

type Translate = (key: string, vars?: Record<string, string | number>) => string;

/** Epoch ms of an ISO timestamp; one without a timezone suffix is UTC. */
export function parseRecordedAt(value: unknown): number | null {
  if (typeof value !== 'string' || !value) return null;
  const ms = parseTs(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/** Milliseconds since the fix; a device clock running ahead reads as zero, not negative. */
export function ageMs(recordedAt: number | null, now: number): number | null {
  return recordedAt === null ? null : Math.max(0, now - recordedAt);
}

export function isFresh(recordedAt: number | null, now: number, freshMinutes: number): boolean {
  const age = ageMs(recordedAt, now);
  return age !== null && age <= freshMinutes * 60_000;
}

export function freshMinutesFrom(config: { fresh_minutes?: unknown } | null | undefined): number {
  const value = config?.fresh_minutes;
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : DEFAULT_FRESH_MINUTES;
}

export function lastSeenLabel(recordedAt: number | null, now: number, t: Translate): string {
  const age = ageMs(recordedAt, now);
  if (age === null) return t('liveMap.lastSeenUnknown');
  const seconds = Math.floor(age / 1000);
  if (seconds < 60) return t('liveMap.secondsAgo', { n: seconds });
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t('liveMap.minutesAgo', { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('liveMap.hoursAgo', { n: hours });
  return t('liveMap.daysAgo', { n: Math.floor(hours / 24) });
}
