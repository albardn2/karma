
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useRouter, useSegments } from 'expo-router';
import { Platform } from 'react-native';
import 'react-native-reanimated';

// Leaflet CSS will be loaded dynamically in MapView.web.tsx

import { useColorScheme } from '@/hooks/useColorScheme';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';

function RootLayoutNav() {
  const { isAuthenticated, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    console.log('Navigation effect triggered:', { loading, isAuthenticated, segments });
    if (loading) return;

    const inAuthGroup = segments[0] === '(auth)';
    console.log('Navigation check:', { isAuthenticated, inAuthGroup, segments });

    if (!isAuthenticated && !inAuthGroup) {
      // Redirect to login if not authenticated
      console.log('Redirecting to login...');
      router.replace('/login');
    } else if (isAuthenticated && inAuthGroup) {
      // Redirect to main app if authenticated
      console.log('Redirecting to main app...');
      router.replace('/(tabs)');
    }
  }, [isAuthenticated, loading, segments]);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'none',
        animationDuration: 0,
        gestureEnabled: false,
        animationTypeForReplace: 'pop',
      }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="menu" options={{ headerShown: false }} />
      <Stack.Screen name="customers" options={{ headerShown: false }} />
      <Stack.Screen name="customers/create" options={{ headerShown: false }} />
      <Stack.Screen name="users" options={{ headerShown: false }} />
      <Stack.Screen name="users/create" options={{ headerShown: false }} />
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
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <RootLayoutNav />
        <StatusBar style="auto" />
      </ThemeProvider>
    </AuthProvider>
  );
}
