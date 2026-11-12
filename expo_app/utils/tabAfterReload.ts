import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'tab_after_reload';
/** A note older than this did not come from the reload just before this launch. */
const MAX_AGE_MS = 60_000;

export type HomeTab = 'home' | 'menu';

/**
 * Switching between English and Arabic flips the layout direction, which React
 * Native applies only by reloading the app, and the reload starts again at Home.
 * The language switcher records the tab it was on so the next launch can reopen it.
 */
export async function rememberTabForReload(tab: HomeTab): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify({ tab, at: Date.now() }));
}

/** The tab recorded just before a reload, read once and then cleared. */
export async function takeTabAfterReload(): Promise<HomeTab | null> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return null;
  await AsyncStorage.removeItem(KEY);
  try {
    const { tab, at } = JSON.parse(raw) as { tab: HomeTab; at: number };
    return Date.now() - at < MAX_AGE_MS ? tab : null;
  } catch {
    return null;
  }
}
