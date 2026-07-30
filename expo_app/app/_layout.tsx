import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/useColorScheme';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { LocationTrackingProvider } from '@/contexts/LocationTrackingContext';
import { AccountUnverifiedNotice } from '@/components/AccountUnverifiedNotice';

function NavigationContent() {
  const { isAuthenticated, loading, isVerified } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === 'login';

    if (!isAuthenticated && !inAuthGroup) {
      router.replace('/login');
    } else if (isAuthenticated && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [isAuthenticated, loading, segments]);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  // An unverified company gets the notice INSTEAD of the navigator.
  //
  // This has to sit at the root. There are only two layouts in the app, and the
  // (tabs) group declares just `index` and `explore` — every module screen
  // (customers, trips, distribution, …) is a sibling of (tabs) on this Stack, so
  // a deep link like myapp://customers never passes through the tab layout. A
  // gate anywhere below here would be bypassable by exactly the deep links this
  // app is driven by.
  //
  // Rendering instead of redirecting also means no module screen ever mounts, so
  // none of their fetch-on-mount effects fire against an API that would 403.
  if (isAuthenticated && !isVerified) {
    return <AccountUnverifiedNotice />;
  }

  return (
    <Stack>
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="+not-found" />
    </Stack>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [loaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  if (!loaded) {
    return null;
  }

  return (
    <AuthProvider>
      <LanguageProvider>
        <LocationTrackingProvider>
          <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
            <NavigationContent />
            <StatusBar style="auto" />
          </ThemeProvider>
        </LocationTrackingProvider>
      </LanguageProvider>
    </AuthProvider>
  );
}
