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

interface CustomerForm {
  full_name: string;
  email_address: string;
  phone_number: string;
  company_name: string;
  full_address: string;
  category: 'roastery' | 'restaurant' | 'minimarket' | 'supermarket' | 'distributer';
  business_cards: string;
  notes: string;
  coordinates: string;
}

export default function CreateCustomerScreen() {
  const insets = useSafeAreaInsets();
  const [form, setForm] = useState<CustomerForm>({
    full_name: '',
    email_address: '',
    phone_number: '',
    company_name: '',
    full_address: '',
    category: 'restaurant',
    business_cards: '',
    notes: '',
    coordinates: '',
  });
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<string[]>(['restaurant', 'roastery', 'minimarket', 'supermarket', 'distributer']);
  const [screenData, setScreenData] = useState(Dimensions.get('window'));
  const [banner, setBanner] = useState<{type: 'success' | 'error', message: string} | null>(null);
  const bannerAnimation = useState(new Animated.Value(0))[0];
  const [errors, setErrors] = useState<Partial<Record<keyof CustomerForm, string>>>({});
  const router = useRouter();

  // Platform detection
  const isWeb = Platform.OS === 'web';
  const isNative = Platform.OS === 'ios' || Platform.OS === 'android';
  const isMobileWeb = isWeb && screenData.width < 768;
  const isDesktop = isWeb && screenData.width >= 768;

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    try {
      const response = await apiCall<string[]>('/customer/categories');

      if (response.status === 200 && response.data) {
        setCategories(response.data);
        if (response.data.length > 0 && !response.data.includes(form.category)) {
          setForm(prev => ({ ...prev, category: response.data[0] as any }));
        }
      } else {
        console.error('Error fetching categories:', response.error);
      }
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  };

  const updateForm = (field: keyof CustomerForm, value: string) => {
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
    const newErrors: Partial<Record<keyof CustomerForm, string>> = {};

    if (!form.full_name.trim()) {
      newErrors.full_name = 'Customer name is required';
    }
    if (!form.company_name.trim()) {
      newErrors.company_name = 'Company name is required';
    }
    
    const hasPhone = form.phone_number.trim().length > 0;
    const hasEmail = form.email_address.trim().length > 0;

    if (!hasPhone && !hasEmail) {
      newErrors.phone_number = 'Either phone number or email is required';
      newErrors.email_address = 'Either phone number or email is required';
    }
    
    if (form.email_address.trim() && !/\S+@\S+\.\S+/.test(form.email_address)) {
      newErrors.email_address = 'Please enter a valid email address';
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
        company_name: form.company_name.trim(),
        full_name:    form.full_name.trim(),
        phone_number: form.phone_number.trim(),
        full_address: form.full_address.trim(),
        category:     form.category,
      };
      if (form.email_address.trim())  payload.email_address   = form.email_address.trim();
      if (form.business_cards.trim()) payload.business_cards  = form.business_cards.trim();
      if (form.notes.trim())          payload.notes           = form.notes.trim();
      if (form.coordinates.trim())    payload.coordinates     = form.coordinates.trim();

      console.log('Submitting payload:', payload);
      const response = await apiCall('/customer/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      console.log('API response:', response);
      if (response.status === 200 || response.status === 201) {
        showBanner('success', 'Customer created successfully!');
        setTimeout(() => {
          if (isNative) {
            router.replace('/customers');
          } else {
            router.replace('/?section=customers');
          }
        }, 1500);
        return;
      }

      let errorMsg = 'Failed to create customer';
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

  return (
    <ThemedView style={[styles.container, isNative && { paddingTop: insets.top }]}>
      {/* Native Header for mobile */}
      {isNative && (
        <NativeHeader
          title="Create Customer"
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
            Create Customer
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
          {/* Customer Name */}
          <View style={styles.fieldContainer}>
            <ThemedText style={styles.label}>Customer Name *</ThemedText>
            <TextInput style={[styles.input, errors.full_name && styles.inputError]}
              value={form.full_name}
              onChangeText={(v) => updateForm('full_name', v)}
              placeholder="Enter customer full name"
              placeholderTextColor="#9ca3af" />
            {errors.full_name && <ThemedText style={styles.errorText}>{errors.full_name}</ThemedText>}
          </View>

          {/* Company Name */}
          <View style={styles.fieldContainer}>
            <ThemedText style={styles.label}>Company Name *</ThemedText>
            <TextInput style={[styles.input, errors.company_name && styles.inputError]}
              value={form.company_name}
              onChangeText={(v) => updateForm('company_name', v)}
              placeholder="Enter company name"
              placeholderTextColor="#9ca3af" />
            {errors.company_name && <ThemedText style={styles.errorText}>{errors.company_name}</ThemedText>}
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
            {errors.phone_number && <ThemedText style={styles.errorText}>{errors.phone_number}</ThemedText>}
          </View>

          {/* Email */}
          <View style={styles.fieldContainer}>
            <ThemedText style={styles.label}>Email Address</ThemedText>
            <TextInput style={[styles.input, errors.email_address && styles.inputError]}
              value={form.email_address}
              onChangeText={(v) => updateForm('email_address', v)}
              placeholder="Enter email address (optional)"
              keyboardType="email-address"
              autoCapitalize="none"
              placeholderTextColor="#9ca3af" />
            {errors.email_address && <ThemedText style={styles.errorText}>{errors.email_address}</ThemedText>}
          </View>

          {/* Contact Note */}
          <View style={styles.fieldContainer}>
            <ThemedText style={styles.contactNote}>
              * If you don't have an email, phone number is required.
            </ThemedText>
          </View>

          {/* Category */}
          <View style={styles.fieldContainer}>
            <ThemedText style={styles.label}>Customer Category *</ThemedText>
            <View style={styles.categoryContainer}>
              {categories.map(cat => (
                <TouchableOpacity key={cat}
                  style={[styles.categoryButton, form.category===cat && styles.activeCategoryButton]}
                  onPress={()=>updateForm('category',cat as any)}>
                  <ThemedText style={[styles.categoryButtonText, form.category===cat && styles.activeCategoryButtonText]}>
                    {cat.charAt(0).toUpperCase()+cat.slice(1)}
                  </ThemedText>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Full Address */}
          <View style={styles.fieldContainer}>
            <ThemedText style={styles.label}>Full Address</ThemedText>
            <TextInput style={[styles.input, styles.textArea]}
              value={form.full_address}
              onChangeText={(v)=>updateForm('full_address',v)}
              placeholder="Enter full address"
              multiline numberOfLines={3}
              placeholderTextColor="#9ca3af" />
          </View>

          {/* Business Cards */}
          <View style={styles.fieldContainer}>
            <ThemedText style={styles.label}>Business Cards</ThemedText>
            <TextInput style={styles.input}
              value={form.business_cards}
              onChangeText={(v) => updateForm('business_cards', v)}
              placeholder="Business card information (optional)"
              placeholderTextColor="#9ca3af" />
          </View>

          {/* Coordinates */}
          <View style={styles.fieldContainer}>
            <ThemedText style={styles.label}>Coordinates</ThemedText>
            <TextInput style={styles.input}
              value={form.coordinates}
              onChangeText={(v) => updateForm('coordinates', v)}
              placeholder="Latitude,Longitude (e.g., 29.7604,-95.3698)"
              placeholderTextColor="#9ca3af" />
          </View>

          {/* Notes */}
          <View style={styles.fieldContainer}>
            <ThemedText style={styles.label}>Notes</ThemedText>
            <TextInput style={[styles.input, styles.textArea]}
              value={form.notes}
              onChangeText={(v) => updateForm('notes', v)}
              placeholder="Additional notes (optional)"
              multiline numberOfLines={4}
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
                  {loading ? 'Creating...' : 'Create Customer'}
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
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  categoryContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#fff',
  },
  activeCategoryButton: {
    backgroundColor: '#5469D4',
    borderColor: '#5469D4',
  },
  categoryButtonText: {
    fontSize: 14,
    color: '#6b7280',
  },
  activeCategoryButtonText: {
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
});