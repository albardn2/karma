
import React, { useState, useEffect } from 'react';
import { StyleSheet, TextInput, TouchableOpacity, Alert, KeyboardAvoidingView, Platform, View, Animated } from 'react-native';
import { useRouter } from 'expo-router';
import { ThemedView } from '@/components/ThemedView';
import { ThemedText } from '@/components/ThemedText';
import { useAuth } from '@/contexts/AuthContext';
import { LinearGradient } from 'expo-linear-gradient';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'rfid' | 'manual'>(
    Platform.OS === 'web' && typeof window !== 'undefined' && window.innerWidth > 768 ? 'rfid' : 'manual'
  );
  const [rfidInput, setRfidInput] = useState('');
  const [pulseAnim] = useState(new Animated.Value(1));
  const [fadeAnim] = useState(new Animated.Value(0));
  const { login } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // Fade in animation on mount
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 800,
      useNativeDriver: true,
    }).start();

    // Pulse animation for RFID scanning
    if (Platform.OS === 'web' && activeTab === 'rfid' && typeof window !== 'undefined' && window.innerWidth > 768) {
      const pulseAnimation = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.1,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      );
      pulseAnimation.start();

      return () => pulseAnimation.stop();
    }
  }, [activeTab]);

  // RFID scanning effect for web
  useEffect(() => {
    if (Platform.OS === 'web' && activeTab === 'rfid' && typeof window !== 'undefined' && window.innerWidth > 768) {
      let clearTimer: NodeJS.Timeout;

      const handleKeyPress = (event: KeyboardEvent) => {
        if (event.key === 'Enter' && rfidInput.length > 0) {
          // RFID scanner typically sends Enter at the end
          handleRfidLogin(rfidInput);
          setRfidInput('');
          if (clearTimer) {
            clearTimeout(clearTimer);
          }
        } else if (event.key.length === 1 && /[a-zA-Z0-9]/.test(event.key)) {
          // Only accept alphanumeric characters
          setRfidInput(prev => prev + event.key);
        }
      };

      document.addEventListener('keydown', handleKeyPress);
      
      return () => {
        document.removeEventListener('keydown', handleKeyPress);
        if (clearTimer) {
          clearTimeout(clearTimer);
        }
      };
    }
  }, [rfidInput, activeTab]);

  // Separate effect for clearing RFID input after 2 seconds of inactivity
  useEffect(() => {
    if (Platform.OS === 'web' && activeTab === 'rfid' && rfidInput.length > 0 && typeof window !== 'undefined' && window.innerWidth > 768) {
      const clearTimer = setTimeout(() => {
        setRfidInput('');
      }, 2000);

      return () => {
        clearTimeout(clearTimer);
      };
    }
  }, [rfidInput, activeTab]);

  const handleRfidLogin = async (rfidCode: string) => {
    if (!rfidCode || rfidCode.length < 8) {
      Alert.alert('Invalid RFID', 'RFID code is too short');
      return;
    }

    setIsLoading(true);
    try {
      // Pass only rfidCode without password to trigger RFID authentication
      const success = await login(rfidCode);
      if (success) {
        router.replace('/(tabs)');
      } else {
        Alert.alert('Login Failed', 'Invalid RFID code. Please try again or use manual login.');
      }
    } catch (error) {
      Alert.alert('Network Error', 'Unable to connect to the server. Please check your internet connection and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleManualLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }
    
    setIsLoading(true);
    try {
      const success = await login(email, password);
      if (success) {
        router.replace('/(tabs)');
      } else {
        Alert.alert('Login Failed', 'Invalid email or password. Please check your credentials and try again.');
      }
    } catch (error) {
      Alert.alert('Network Error', 'Unable to connect to the server. Please check your internet connection and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  

  // Hidden form for RFID submission (web only)
  const RfidForm = () => (
    <form 
      onSubmit={(e) => {
        e.preventDefault();
        handleRfidLogin(rfidInput);
      }}
      style={{ display: 'none' }}
    >
      <input 
        type="text" 
        value={rfidInput}
        onChange={(e) => setRfidInput(e.target.value)}
        autoFocus
      />
      <input type="submit" />
    </form>
  );

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#5469D4', '#6B73E0', '#8B5CF6']}
        style={styles.gradient}
      >
        <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
          <KeyboardAvoidingView 
            style={styles.keyboardContainer} 
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <ThemedView style={styles.formContainer}>
              <View style={styles.logoContainer}>
                <View style={styles.logoCircle}>
                  <ThemedText style={styles.logoText}>
                    {activeTab === 'rfid' ? '🔐' : '👋'}
                  </ThemedText>
                </View>
              </View>
              
              <ThemedText type="title" style={styles.title}>
                {activeTab === 'rfid' ? 'RFID Authentication' : 'Welcome Back'}
              </ThemedText>
              <ThemedText style={styles.subtitle}>
                {activeTab === 'rfid' ? 'Tap your card to continue' : 'Sign in to continue to your account'}
              </ThemedText>

              {/* Tab Navigation - Only show on desktop web when both options are available */}
              {Platform.OS === 'web' && typeof window !== 'undefined' && window.innerWidth > 768 && (
                <View style={styles.tabContainer}>
                  <TouchableOpacity 
                    style={[styles.tab, activeTab === 'rfid' && styles.activeTab]}
                    onPress={() => setActiveTab('rfid')}
                    disabled={isLoading}
                  >
                    <ThemedText style={[styles.tabText, activeTab === 'rfid' && styles.activeTabText]}>
                      📱 RFID Scan
                    </ThemedText>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[styles.tab, activeTab === 'manual' && styles.activeTab]}
                    onPress={() => setActiveTab('manual')}
                    disabled={isLoading}
                  >
                    <ThemedText style={[styles.tabText, activeTab === 'manual' && styles.activeTabText]}>
                      ✉️ Email & Password
                    </ThemedText>
                  </TouchableOpacity>
                </View>
              )}

              {/* Tab Content */}
              {activeTab === 'rfid' && Platform.OS === 'web' && typeof window !== 'undefined' && window.innerWidth > 768 ? (
                // RFID Scanning Interface
                <>
                  <Animated.View style={[styles.rfidContainer, { transform: [{ scale: pulseAnim }] }]}>
                    <View style={[styles.scanningIndicator, isLoading && styles.scanningIndicatorActive]}>
                      <View style={styles.scanIcon}>
                        <ThemedText style={styles.scanIconText}>📱</ThemedText>
                      </View>
                      <ThemedText style={styles.scanningText}>
                        {isLoading ? 'Authenticating...' : rfidInput.length > 0 ? 'Scanning...' : 'Ready to scan'}
                      </ThemedText>
                      {rfidInput.length > 0 && (
                        <ThemedText style={styles.rfidInputDisplay}>
                          {'*'.repeat(Math.min(rfidInput.length, 12))}
                        </ThemedText>
                      )}
                    </View>
                  </Animated.View>

                  {Platform.OS === 'web' && typeof window !== 'undefined' && window.innerWidth > 768 && <RfidForm />}
                </>
              ) : (
                // Manual Login Interface
                <>
                  <View style={styles.inputContainer}>
                    <ThemedText style={styles.label}>Email or Username</ThemedText>
                    <View style={styles.inputWrapper}>
                      <TextInput
                        style={styles.input}
                        placeholder="Enter your email or username"
                        placeholderTextColor="#9CA3AF"
                        value={email}
                        onChangeText={setEmail}
                        autoCapitalize="none"
                        autoCorrect={false}
                        editable={!isLoading}
                      />
                    </View>
                  </View>

                  <View style={styles.inputContainer}>
                    <ThemedText style={styles.label}>Password</ThemedText>
                    <View style={styles.inputWrapper}>
                      <TextInput
                        style={styles.input}
                        placeholder="Enter your password"
                        placeholderTextColor="#9CA3AF"
                        value={password}
                        onChangeText={setPassword}
                        secureTextEntry
                        autoCapitalize="none"
                        autoCorrect={false}
                        editable={!isLoading}
                      />
                    </View>
                  </View>

                  <TouchableOpacity 
                    style={[styles.loginButton, isLoading && styles.loginButtonDisabled]} 
                    onPress={handleManualLogin}
                    disabled={isLoading}
                  >
                    <LinearGradient
                      colors={isLoading ? ['#9CA3AF', '#9CA3AF'] : ['#5469D4', '#6B73E0']}
                      style={styles.loginButtonGradient}
                    >
                      <ThemedText style={styles.loginButtonText}>
                        {isLoading ? 'Signing In...' : 'Sign In'}
                      </ThemedText>
                    </LinearGradient>
                  </TouchableOpacity>
                </>
              )}
            </ThemedView>
          </KeyboardAvoidingView>
        </Animated.View>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gradient: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  keyboardContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  formContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    backdropFilter: 'blur(10px)',
    borderRadius: 24,
    padding: 32,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 10,
    },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
    maxWidth: 400,
    alignSelf: 'center',
    width: '100%',
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logoCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  logoText: {
    fontSize: 32,
  },
  title: {
    textAlign: 'center',
    marginBottom: 8,
    fontSize: 28,
    fontWeight: '700',
    color: '#1F2937',
  },
  subtitle: {
    textAlign: 'center',
    marginBottom: 40,
    fontSize: 16,
    color: '#6B7280',
    lineHeight: 24,
  },
  // Tab Styles
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    borderRadius: 16,
    marginBottom: 32,
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  activeTab: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6B7280',
  },
  activeTabText: {
    color: '#5469D4',
    fontWeight: '600',
  },
  // RFID Styles
  rfidContainer: {
    alignItems: 'center',
    paddingVertical: 48,
    marginBottom: 32,
  },
  scanningIndicator: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 3,
    borderColor: '#E5E7EB',
    borderStyle: 'dashed',
    backgroundColor: '#F9FAFB',
  },
  scanningIndicatorActive: {
    borderColor: '#5469D4',
    backgroundColor: '#EEF2FF',
  },
  scanIcon: {
    marginBottom: 16,
  },
  scanIconText: {
    fontSize: 24,
  },
  scanningText: {
    fontSize: 14,
    textAlign: 'center',
    fontWeight: '600',
    color: '#374151',
  },
  rfidInputDisplay: {
    fontSize: 12,
    textAlign: 'center',
    color: '#5469D4',
    fontFamily: 'monospace',
    marginTop: 4,
  },
  
  // Manual Login Styles
  inputContainer: {
    marginBottom: 20,
  },
  label: {
    marginBottom: 8,
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  inputWrapper: {
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  input: {
    height: 52,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    backgroundColor: '#FFFFFF',
    color: '#1F2937',
  },
  loginButton: {
    height: 52,
    borderRadius: 12,
    marginBottom: 32,
    shadowColor: '#5469D4',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  loginButtonDisabled: {
    shadowOpacity: 0.1,
  },
  loginButtonGradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 12,
  },
  loginButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  
});
