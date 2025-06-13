
import React, { useRef, useEffect } from 'react';
import { View, StyleSheet, Animated, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ThemedText } from '@/components/ThemedText';

interface WelcomeContentProps {
  variant?: 'desktop' | 'mobile';
}

export const WelcomeContent: React.FC<WelcomeContentProps> = ({ variant = 'desktop' }) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;
  const rotateValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Sequential entrance animation with improved timing
    const entranceAnimation = Animated.sequence([
      Animated.delay(200), // Small delay for better feel
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          tension: 80,
          friction: 8,
          useNativeDriver: true,
        }),
      ]),
    ]);

    entranceAnimation.start();

    // Gentler continuous rotation with longer duration
    const continuousRotation = Animated.loop(
      Animated.timing(rotateValue, {
        toValue: 1,
        duration: 8000, // Slower rotation for smoother feel
        useNativeDriver: true,
      })
    );

    // Start rotation after entrance animation completes
    setTimeout(() => {
      continuousRotation.start();
    }, 800);

    return () => {
      continuousRotation.stop();
    };
  }, []);

  const rotateInterpolate = rotateValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const animatedStyle = {
    opacity: fadeAnim,
    transform: [
      { translateY: slideAnim },
      { scale: scaleAnim },
      { rotate: rotateInterpolate },
    ],
  };

  return (
    <View style={variant === 'desktop' ? styles.desktopContainer : styles.mobileContainer}>
      <Animated.View style={[
        variant === 'desktop' ? styles.desktopIconContainer : styles.mobileIconContainer,
        animatedStyle
      ]}>
        <LinearGradient
          colors={['#5469D4', '#6B73E0', '#8B5CF6']}
          style={variant === 'desktop' ? styles.desktopGradient : styles.mobileGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <ThemedText style={styles.icon}>
            {Platform.OS === 'ios' || Platform.OS === 'android' ? '⚡' : '🚀'}
          </ThemedText>
        </LinearGradient>
      </Animated.View>

      <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
        <ThemedText style={variant === 'desktop' ? styles.desktopTitle : styles.mobileTitle}>
          Welcome to Your Dashboard
        </ThemedText>
      </Animated.View>

      <Animated.View style={{ 
        opacity: fadeAnim, 
        transform: [{ translateY: slideAnim }, { scale: scaleAnim }] 
      }}>
        <ThemedText style={variant === 'desktop' ? styles.desktopMessage : styles.mobileMessage}>
          Select a module from the navigation to get started
        </ThemedText>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  desktopContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  mobileContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    minHeight: 400,
  },
  desktopIconContainer: {
    marginBottom: 32,
  },
  mobileIconContainer: {
    marginBottom: 32,
  },
  desktopGradient: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: 'rgba(84, 105, 212, 0.3)',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 1,
    shadowRadius: 20,
    elevation: 10,
  },
  mobileGradient: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: 'rgba(84, 105, 212, 0.2)',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 10,
    elevation: 5,
  },
  icon: {
    fontSize: Platform.OS === 'ios' || Platform.OS === 'android' ? 36 : 40,
    color: '#ffffff',
    textAlign: 'center',
    lineHeight: Platform.OS === 'ios' || Platform.OS === 'android' ? 40 : 45,
  },
  desktopTitle: {
    fontSize: 32,
    fontWeight: '700',
    color: '#1f2937',
    textAlign: 'center',
    marginBottom: 12,
    lineHeight: 40,
  },
  mobileTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1f2937',
    textAlign: 'center',
    marginBottom: 12,
  },
  desktopMessage: {
    fontSize: 16,
    color: '#9ca3af',
    textAlign: 'center',
    fontStyle: 'italic',
    marginTop: 32,
  },
  mobileMessage: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
  },
});
