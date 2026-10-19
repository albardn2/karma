import type { ColorSchemeName } from 'react-native';

/** Light-only, as on native — see ./useColorScheme.ts for why. */
export function useColorScheme(): ColorSchemeName {
  return 'light';
}
