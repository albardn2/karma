import { Platform } from 'react-native';
import * as Location from 'expo-location';
import { needsLocationDisclosure } from '@/utils/locationDisclosure';

export type LocationAccess = 'none' | 'foreground' | 'background';

let disclosureShownThisLaunch = false;

/**
 * Get as much location access as the user allows, asking the OS only when needed.
 *
 * On Android every system prompt is preceded by the in-app disclosure
 * (`askDisclosure`, resolving true when the user continues), as Google Play
 * requires for background location; declining it leaves whatever access was
 * already granted. iOS goes straight to the system prompts, whose purpose
 * strings come from app.json.
 */
export async function acquireLocationAccess(askDisclosure: () => Promise<boolean>): Promise<LocationAccess> {
  const [foreground, background] = await Promise.all([
    Location.getForegroundPermissionsAsync(),
    Location.getBackgroundPermissionsAsync(),
  ]);
  if (foreground.granted && background.granted) return 'background';
  const current: LocationAccess = foreground.granted ? 'foreground' : 'none';

  if (Platform.OS === 'android') {
    if (!needsLocationDisclosure(foreground, background, disclosureShownThisLaunch)) return current;
    disclosureShownThisLaunch = true;
    if (!(await askDisclosure())) return current;
  }

  return requestLocationAccess(foreground.granted);
}

async function requestLocationAccess(foregroundGranted: boolean): Promise<LocationAccess> {
  if (!foregroundGranted) {
    const { granted } = await Location.requestForegroundPermissionsAsync();
    if (!granted) return 'none';
  }
  const { granted } = await Location.requestBackgroundPermissionsAsync();
  return granted ? 'background' : 'foreground';
}
