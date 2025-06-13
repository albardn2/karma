
/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

const tintColorLight = '#5469D4';
const tintColorDark = '#6B73E0';

export const Colors = {
  light: {
    text: '#11181C',
    background: '#fff',
    tint: tintColorLight,
    icon: '#687076',
    tabIconDefault: '#687076',
    tabIconSelected: tintColorLight,
  },
  dark: {
    text: '#ECEDEE',
    background: '#151718',
    tint: tintColorDark,
    icon: '#9BA1A6',
    tabIconDefault: '#9BA1A6',
    tabIconSelected: tintColorDark,
  },
  // Gradient system based on #5469D4
  gradient: {
    primary: '#5469D4',
    secondary: '#6B73E0',
    tertiary: '#8B5CF6',
    // Lighter variants
    light: '#7B8AE8',
    lighter: '#A3B1F0',
    lightest: '#D1D9F8',
    // Darker variants
    dark: '#3D4FB8',
    darker: '#2A389C',
    darkest: '#1A2580',
  },
  // Semantic colors using the gradient system
  semantic: {
    success: '#10B981',
    warning: '#F59E0B',
    error: '#EF4444',
    info: '#5469D4',
  },
  // Category colors for consistent theming
  categories: {
    restaurant: '#f59e0b',
    roastery: '#8b5cf6',
    minimarket: '#06b6d4',
    supermarket: '#10b981',
    distributer: '#ef4444',
    default: '#5469D4',
  },
};
