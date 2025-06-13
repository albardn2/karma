import React, { useState, useEffect } from 'react';
import { StyleSheet, ScrollView, TextInput, TouchableOpacity, Alert, Platform, Dimensions, Animated } from 'react-native';
import { View } from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useRouter } from 'expo-router';
import { apiCall } from '@/utils/api';
import { LinearGradient } from 'expo-linear-gradient';
import { NativeHeader } from '@/components/layout/NativeHeader';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface UserForm {
  username: string;
  first_name: string;
  last_name: string;
  password: string;
  email: string;
  phone_number: string;
  language: string;
  permission_scope: string;
  rfid_token: string;
}

export default function CreateUserScreen() {
  const insets = useSafeAreaInsets();
  const [form, setForm] = useState<UserForm>({
    username: '',
    first_name: '',
    last_name: '',
    password: '',
    email: '',
    phone_number: '',
    language: '',
    permission_scope: '',
    rfid_token: '',
  });
  const [loading, setLoading] = useState(false);
  const [availablePermissions, setAvailablePermissions] = useState<string[]>([]);
  const [permissionsLoading, setPermissionsLoading] = useState(true);
  const [screenData, setScreenData] = useState(Dimensions.get('window'));
  const [banner, setBanner] = useState<{type: 'success' | 'error', message: string} | null>(null);
  const bannerAnimation = useState(new Animated.Value(0))[0];
  const [errors, setErrors] = useState<Partial<Record<keyof UserForm, string>>>({});
  const router = useRouter();

  // Platform detection
  const isWeb = Platform.OS === 'web';
  const isNative = Platform.OS === 'ios' || Platform.OS === 'android';
  const isMobileWeb = isWeb && screenData.width < 768;
  const isDesktop = isWeb && screenData.width >= 768;

  useEffect(() => {
    const fetchPermissions = async () => {
      try {
        setPermissionsLoading(true);
        const response = await apiCall('/auth/permissions');
        if (response.status === 200 && response.data) {
          setAvailablePermissions(response.data);
        } else {
          console.error('Failed to fetch permissions:', response.error);
          setAvailablePermissions([]);
        }
      } catch (error) {
        console.error('Error fetching permissions:', error);
        setAvailablePermissions([]);
      } finally {
        setPermissionsLoading(false);
      }
    };

    fetchPermissions();
  }, []);

  const updateForm = (field: keyof UserForm, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const showBanner = (type: 'success' | 'error', message: string) => {
    setBanner({ type, message });
    Animated.sequence([
      Animated.timing(bannerAnimation, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.delay(3000),
      Animated.timing(bannerAnimation, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => setBanner(null));
  };

  const validateForm = (): boolean => {
    const newErrors: Partial<Record<keyof UserForm, string>> = {};

    if (!form.username.trim()) {
      newErrors.username = 'Username is required';
    } else if (form.username.includes('@')) {
      newErrors.username = 'Username cannot be an email address';
    }

    if (!form.first_name.trim()) {
      newErrors.first_name = 'First name is required';
    }
    if (!form.last_name.trim()) {
      newErrors.last_name = 'Last name is required';
    }
    if (!form.password.trim()) {
      newErrors.password = 'Password is required';
    } else if (form.password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters';
    }

    if (!form.permission_scope.trim()) {
      newErrors.permission_scope = 'At least one permission level is required';
    }

    // Email validation only if provided
    if (form.email.trim() && !/\S+@\S+\.\S+/.test(form.email)) {
      newErrors.email = 'Please enter a valid email address';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    console.log('▶️ handleSubmit');
    if (!validateForm()) return;

    setLoading(true);
    try {
      const payload: any = {
        username: form.username.trim(),
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        password: form.password.trim(),
        permission_scope: form.permission_scope,
      };

      if (form.email.trim()) payload.email = form.email.trim();
      if (form.phone_number.trim()) payload.phone_number = form.phone_number.trim();
      if (form.language.trim()) payload.language = form.language.trim();
      if (form.rfid_token.trim()) payload.rfid_token = form.rfid_token.trim();

      console.log('Submitting payload:', payload);
      const response = await apiCall('/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      console.log('API response:', response);
      if (response.status === 200 || response.status === 201) {
        showBanner('success', 'User created successfully!');
        const redirectUrl = isNative ? '/users' : '/?section=users';
        setTimeout(() => router.replace(redirectUrl), 1500);
        return;
      }

      let errorMsg = 'Failed to create user';
      if (response.error) {
        try {
          const err = typeof response.error === 'string' ? JSON.parse(response.error) : response.error;
          errorMsg = err.detail || err.message || errorMsg;
        } catch {}
      }
      showBanner('error', errorMsg);

    } catch (e) {
      console.error('Network error:', e);
      showBanner('error', 'Network error – please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => router.back();

  const getPermissionLabel = (permission: string) => {
    // Convert snake_case to Title Case dynamically
    return permission
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  return (
    <ThemedView style={[styles.container, isNative && { paddingTop: insets.top }]}>
      {/* Native Header for mobile */}
      {isNative && (
        <NativeHeader
          title="Create User"
          onBack={handleCancel}
        />
      )}

      {banner && (
        <Animated.View style={[
          styles.banner,
          banner.type === 'success' ? styles.successBanner : styles.errorBanner,
          { 
            opacity: bannerAnimation, 
            transform: [{ translateY: bannerAnimation.interpolate({ inputRange: [0,1], outputRange: [-100,0] }) }],
            top: isNative ? insets.top : 0, // Use safe area for native, 0 for web
            position: isNative ? 'absolute' : 'fixed' // Fixed positioning for web
          }
        ]}>
          <ThemedText style={styles.bannerText}>{banner.message}</ThemedText>
        </Animated.View>
      )}

      {/* Desktop/Web Header */}
      {!isNative && (
        <View style={[
          styles.header,
          isDesktop ? styles.desktopHeader : isMobileWeb ? styles.mobileHeader : undefined
        ]}>
          <TouchableOpacity onPress={handleCancel} style={styles.backButton}>
            <ThemedText style={styles.backButtonText}>← Back</ThemedText>
          </TouchableOpacity>
          <ThemedText style={[
            styles.title,
            isDesktop ? styles.desktopTitle : styles.mobileTitle
          ]}>
            Create User
          </ThemedText>
          <View style={styles.placeholder} />
        </View>
      )}

      <ScrollView style={styles.scrollView} contentContainerStyle={[
        styles.formContainer,
        isDesktop ? styles.desktopForm : 
        isNative ? styles.nativeForm : styles.mobileForm
      ]} showsVerticalScrollIndicator={false}>
        <View style={styles.formCard}>
          {/* Username */}
          <View style={styles.fieldContainer}>
            <ThemedText style={styles.label}>Username *</ThemedText>
            <TextInput style={[styles.input, errors.username && styles.inputError]}
              value={form.username}
              onChangeText={(v) => updateForm('username', v)}
              placeholder="Enter username (not email)"
              placeholderTextColor="#9ca3af"
              autoCapitalize="none"
              autoCorrect={false} />
            {errors.username && <ThemedText style={styles.errorText}>{errors.username}</ThemedText>}
          </View>

          {/* First Name */}
          <View style={styles.fieldContainer}>
            <ThemedText style={styles.label}>First Name *</ThemedText>
            <TextInput style={[styles.input, errors.first_name && styles.inputError]}
              value={form.first_name}
              onChangeText={(v) => updateForm('first_name', v)}
              placeholder="Enter first name"
              placeholderTextColor="#9ca3af" />
            {errors.first_name && <ThemedText style={styles.errorText}>{errors.first_name}</ThemedText>}
          </View>

          {/* Last Name */}
          <View style={styles.fieldContainer}>
            <ThemedText style={styles.label}>Last Name *</ThemedText>
            <TextInput style={[styles.input, errors.last_name && styles.inputError]}
              value={form.last_name}
              onChangeText={(v) => updateForm('last_name', v)}
              placeholder="Enter last name"
              placeholderTextColor="#9ca3af" />
            {errors.last_name && <ThemedText style={styles.errorText}>{errors.last_name}</ThemedText>}
          </View>

          {/* Password */}
          <View style={styles.fieldContainer}>
            <ThemedText style={styles.label}>Password *</ThemedText>
            <TextInput style={[styles.input, errors.password && styles.inputError]}
              value={form.password}
              onChangeText={(v) => updateForm('password', v)}
              placeholder="Enter password (min 6 characters)"
              secureTextEntry
              placeholderTextColor="#9ca3af" />
            {errors.password && <ThemedText style={styles.errorText}>{errors.password}</ThemedText>}
          </View>

          {/* Email */}
          <View style={styles.fieldContainer}>
            <ThemedText style={styles.label}>Email Address</ThemedText>
            <TextInput style={[styles.input, errors.email && styles.inputError]}
              value={form.email}
              onChangeText={(v) => updateForm('email', v)}
              placeholder="Enter email address (optional)"
              keyboardType="email-address"
              autoCapitalize="none"
              placeholderTextColor="#9ca3af" />
            {errors.email && <ThemedText style={styles.errorText}>{errors.email}</ThemedText>}
          </View>

          {/* Phone */}
          <View style={styles.fieldContainer}>
            <ThemedText style={styles.label}>Phone Number</ThemedText>
            <TextInput style={[styles.input, errors.phone_number && styles.inputError]}
              value={form.phone_number}
              onChangeText={(v) => updateForm('phone_number', v)}
              placeholder="Enter phone number"
              keyboardType="phone-pad"
              placeholderTextColor="#9ca3af" />
            {/*errors.phone_number && <ThemedText style={styles.errorText}>{errors.phone_number}</ThemedText>*/}
          </View>

          {/* Permission Scope */}
          <View style={styles.fieldContainer}>
            <ThemedText style={styles.label}>Permission Level *</ThemedText>
            {permissionsLoading ? (
              <ThemedText style={styles.loadingText}>Loading permissions...</ThemedText>
            ) : (
              <View style={styles.permissionContainer}>
                {availablePermissions.map(permission => {
                const selectedPermissions = form.permission_scope.split(',').filter(p => p.trim());
                const isSelected = selectedPermissions.includes(permission);
                
                return (
                  <TouchableOpacity 
                    key={permission}
                    style={[styles.permissionButton, isSelected && styles.activePermissionButton]}
                    onPress={() => {
                      const currentPermissions = form.permission_scope.split(',').filter(p => p.trim());
                      let newPermissions;
                      
                      if (isSelected) {
                        // Remove permission
                        newPermissions = currentPermissions.filter(p => p !== permission);
                      } else {
                        // Add permission
                        newPermissions = [...currentPermissions, permission];
                      }
                      
                      updateForm('permission_scope', newPermissions.join(','));
                    }}
                  >
                    <ThemedText style={[styles.permissionButtonText, isSelected && styles.activePermissionButtonText]}>
                      {getPermissionLabel(permission)}
                    </ThemedText>
                  </TouchableOpacity>
                );
              })}
              </View>
            )}
            {form.permission_scope && (
              <ThemedText style={styles.selectedPermissionsText}>
                Selected: {form.permission_scope.split(',').filter(p => p.trim()).map(p => getPermissionLabel(p)).join(', ')}
              </ThemedText>
            )}
          </View>

          {/* Language */}
          <View style={styles.fieldContainer}>
            <ThemedText style={styles.label}>Language</ThemedText>
            <TextInput style={styles.input}
              value={form.language}
              onChangeText={(v) => updateForm('language', v)}
              placeholder="Language preference (optional)"
              placeholderTextColor="#9ca3af" />
          </View>

          {/* RFID Token */}
          <View style={styles.fieldContainer}>
            <ThemedText style={styles.label}>RFID Token</ThemedText>
            <TextInput style={styles.input}
              value={form.rfid_token}
              onChangeText={(v) => updateForm('rfid_token', v)}
              placeholder="RFID token for identification (optional)"
              placeholderTextColor="#9ca3af" />
          </View>

          {/* Action Buttons */}
          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={handleCancel}
              disabled={loading}
            >
              <ThemedText style={styles.cancelButtonText}>Cancel</ThemedText>
            </TouchableOpacity>

            <TouchableOpacity onPress={handleSubmit} disabled={loading}>
              <LinearGradient
                colors={loading ? ['#9ca3af', '#6b7280'] : ['#5469D4', '#4F46E5']}
                style={styles.submitButton}
              >
                <ThemedText style={styles.submitButtonText}>
                  {loading ? 'Creating...' : 'Create User'}
                </ThemedText>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  desktopHeader: {
    paddingHorizontal: 32,
    paddingVertical: 24,
  },
  mobileHeader: {
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  backButton: {
    padding: 4,
  },
  backButtonText: {
    fontSize: 16,
    color: '#5469D4',
    fontWeight: '500',
  },
  title: {
    fontWeight: 'bold',
    color: '#1f2937',
  },
  desktopTitle: {
    fontSize: 32,
  },
  mobileTitle: {
    fontSize: 24,
  },
  placeholder: {
    width: 60,
  },
  scrollView: {
    flex: 1,
  },
  formContainer: {
    paddingBottom: Platform.OS === 'ios' || Platform.OS === 'android' ? 120 : 100,
  },
  desktopForm: {
    paddingHorizontal: 32,
    paddingTop: 32,
  },
  mobileForm: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  nativeForm: {
    paddingHorizontal: 12,
    paddingTop: 12,
  },
  formCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: Platform.OS === 'ios' || Platform.OS === 'android' ? 16 : 24,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  fieldContainer: {
    marginBottom: Platform.OS === 'ios' || Platform.OS === 'android' ? 16 : 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingVertical: Platform.OS === 'ios' || Platform.OS === 'android' ? 14 : 12,
    paddingHorizontal: 16,
    fontSize: 16,
    backgroundColor: '#fff',
    color: '#1f2937',
    minHeight: Platform.OS === 'ios' || Platform.OS === 'android' ? 48 : 'auto',
  },
  permissionContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  permissionButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#fff',
  },
  activePermissionButton: {
    backgroundColor: '#5469D4',
    borderColor: '#5469D4',
  },
  permissionButtonText: {
    fontSize: 14,
    color: '#6b7280',
  },
  activePermissionButtonText: {
    color: '#fff',
  },
  buttonContainer: {
    flexDirection: Platform.OS === 'ios' || Platform.OS === 'android' ? 'column' : 'row',
    gap: 12,
    marginTop: Platform.OS === 'ios' || Platform.OS === 'android' ? 24 : 32,
  },
  cancelButton: {
    flex: Platform.OS === 'ios' || Platform.OS === 'android' ? 0 : 1,
    paddingVertical: Platform.OS === 'ios' || Platform.OS === 'android' ? 16 : 14,
    paddingHorizontal: 24,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#fff',
    alignItems: 'center',
    minHeight: Platform.OS === 'ios' || Platform.OS === 'android' ? 48 : 'auto',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6b7280',
  },
  submitButton: {
    flex: Platform.OS === 'ios' || Platform.OS === 'android' ? 0 : 1,
    paddingVertical: Platform.OS === 'ios' || Platform.OS === 'android' ? 16 : 14,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
    minHeight: Platform.OS === 'ios' || Platform.OS === 'android' ? 48 : 'auto',
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  banner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingVertical: 16,
    paddingHorizontal: 20,
    zIndex: 99999,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 20,
  },
  successBanner: {
    backgroundColor: '#10b981',
  },
  errorBanner: {
    backgroundColor: '#ef4444',
  },
  bannerText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  contactNote: {
    fontSize: 14,
    color: '#6b7280',
    fontStyle: 'italic',
    marginTop: -10,
  },
  inputError: {
    borderColor: '#ef4444',
    borderWidth: 2,
  },
  errorText: {
    fontSize: 14,
    color: '#ef4444',
    marginTop: 4,
    fontWeight: '500',
  },
  selectedPermissionsText: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 8,
    fontStyle: 'italic',
  },
  loadingText: {
    fontSize: 14,
    color: '#6b7280',
    fontStyle: 'italic',
    padding: 16,
    textAlign: 'center',
  },
});