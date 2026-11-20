/** Location permission state as expo-location reports it, reduced to what the disclosure decision needs. */
export interface PermissionSnapshot {
  granted: boolean;
  canAskAgain: boolean;
}

/**
 * Whether the in-app location disclosure must be shown before asking Android
 * for location permission.
 *
 * Google Play requires a prominent disclosure before any background location
 * request, so it is shown whenever a system prompt is still possible: the
 * foreground prompt if that permission is missing, else the background one.
 * Once per launch at most, because tracking restarts on every return to the
 * foreground and a driver who said no should not be asked again each time.
 */
export function needsLocationDisclosure(
  foreground: PermissionSnapshot,
  background: PermissionSnapshot,
  shownThisLaunch: boolean,
): boolean {
  if (background.granted || shownThisLaunch) return false;
  return foreground.granted ? background.canAskAgain : foreground.canAskAgain;
}
