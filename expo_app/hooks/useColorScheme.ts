import type { ColorSchemeName } from 'react-native';

/**
 * The app is light-only, so this is pinned rather than read from the system.
 *
 * Every screen paints light surfaces with hard-coded colours — white cards, a
 * #f1f5f9 page — while ThemedText and ThemedView follow this hook. Under the
 * system's dark mode they switched to light text, which on those white cards
 * was white on white. Until the screens are themed, both follow light; app.json
 * (`userInterfaceStyle`) does the same for the native controls.
 */
export function useColorScheme(): ColorSchemeName {
  return 'light';
}
