// Fallback for using MaterialIcons on Android and web.

import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { SymbolWeight, SymbolViewProps } from 'expo-symbols';
import { ComponentProps } from 'react';
import { OpaqueColorValue, type StyleProp, type TextStyle } from 'react-native';

type IconMapping = Record<SymbolViewProps['name'], ComponentProps<typeof MaterialIcons>['name']>;
type IconSymbolName = keyof typeof MAPPING;

/**
 * Add your SF Symbols to Material Icons mappings here.
 * - see Material Icons in the [Icons Directory](https://icons.expo.fyi).
 * - see SF Symbols in the [SF Symbols](https://developer.apple.com/sf-symbols/) app.
 */
const MAPPING = {
  'house.fill': 'home',
  'paperplane.fill': 'send',
  'chevron.left.forwardslash.chevron.right': 'code',
  'chevron.right': 'chevron-right',
  // trip list filter pills
  'person.fill': 'person',
  'box.truck.fill': 'local-shipping',
  'car.fill': 'local-shipping', // the iOS 15 stand-in for box.truck.fill
  'chevron.down': 'expand-more',
  'xmark.circle.fill': 'cancel',
} as IconMapping;

/**
 * Material glyphs that sit much smaller in their box than the SF Symbol they
 * stand in for: expand_more is half an em wide, chevron.down nearly a full one.
 * Scaled so a given `size` looks about the same on both platforms.
 */
const OPTICAL_SCALE: Partial<Record<IconSymbolName, number>> = {
  'chevron.down': 1.55,
};

/**
 * An icon component that uses native SF Symbols on iOS, and Material Icons on Android and web.
 * This ensures a consistent look across platforms, and optimal resource usage.
 * Icon `name`s are based on SF Symbols and require manual mapping to Material Icons.
 */
export function IconSymbol({
  name,
  size = 24,
  color,
  style,
}: {
  name: IconSymbolName;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<TextStyle>;
  weight?: SymbolWeight;
}) {
  return (
    <MaterialIcons
      color={color}
      size={Math.round(size * (OPTICAL_SCALE[name] ?? 1))}
      name={MAPPING[name]}
      style={style}
    />
  );
}
