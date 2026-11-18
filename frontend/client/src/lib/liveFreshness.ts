import L from "leaflet";

/**
 * How old a driver's live position is, and whether it still counts as live.
 *
 * The age is measured from the device's fix time (`recorded_at`), never from when
 * the message reached this page: publishers set retain = true, so the broker
 * replays each driver's last position the moment a map subscribes, and its arrival
 * time is always "just now" however old the fix is. A payload without a usable
 * `recorded_at` has an unknown age and is drawn as stale.
 */

/** Used until /location/client-config answers, and when it omits the window. */
export const DEFAULT_FRESH_MINUTES = 5;

type Translate = (key: string, vars?: Record<string, string | number>) => string;

/** Epoch ms of an ISO timestamp; one without a timezone suffix is UTC. */
export function parseRecordedAt(value: unknown): number | null {
  if (typeof value !== "string" || !value) return null;
  const iso = /[zZ]|[+-]\d{2}:?\d{2}$/.test(value) ? value : value + "Z";
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
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
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : DEFAULT_FRESH_MINUTES;
}

export function lastSeenLabel(recordedAt: number | null, now: number, t: Translate): string {
  const age = ageMs(recordedAt, now);
  if (age === null) return t("location.lastSeenUnknown");
  const seconds = Math.floor(age / 1000);
  if (seconds < 60) return t("location.lastSeenSecondsAgo", { n: seconds });
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t("location.lastSeenMinutesAgo", { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("location.lastSeenHoursAgo", { n: hours });
  return t("location.lastSeenDaysAgo", { n: Math.floor(hours / 24) });
}

const FRESH_COLOR = "#16a34a";
const STALE_COLOR = "#9ca3af";

function dotIcon(color: string): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<span style="display:block;width:18px;height:18px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.25),0 1px 4px rgba(0,0,0,.35)"></span>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    popupAnchor: [0, -10],
  });
}

const FRESH_ICON = dotIcon(FRESH_COLOR);
const STALE_ICON = dotIcon(STALE_COLOR);

export function driverMarkerIcon(fresh: boolean): L.DivIcon {
  return fresh ? FRESH_ICON : STALE_ICON;
}
