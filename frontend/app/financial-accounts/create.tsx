
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

interface FinancialAccountForm {
  account_name: string;
  currency: string;
  notes: string;
}

export default function CreateFinancialAccountScreen() {
  const insets = useSafeAreaInsets();
  const [form, setForm] = useState<FinancialAccountForm>({
    account_name: '',
    currency: '',
    notes: '',
  });
  const [loading, setLoading] = useState(false);
  const [currencies, setCurrencies] = useState<string[]>([]);
  const [currenciesLoading, setCurrenciesLoading] = useState(true);
  const [screenData, setScreenData] = useState(Dimensions.get('window'));
  const [banner, setBanner] = useState<{type: 'success' | 'error', message: string} | null>(null);
  const bannerAnimation = useState(new Animated.Value(0))[0];
  const [errors, setErrors] = useState<Partial<Record<keyof FinancialAccountForm, string>>>({});
  const router = useRouter();

  // Platform detection
  const isWeb = Platform.OS === 'web';
  const isNative = Platform.OS === 'ios' || Platform.OS === 'android';
  const isMobileWeb = isWeb && screenData.width < 768;
  const isDesktop = isWeb && screenData.width >= 768;

  useEffect(() => {
    const fetchCurrencies = async () => {
      try {
        setCurrenciesLoading(true);
        const response = await apiCall('/payment/currencies');
        if (response.status === 200 && response.data) {
          setCurrencies(response.data);
          if (response.data.length > 0) {
            setForm(prev => ({ ...prev, currency: response.data[0] }));
          }
        } else {
          console.error('Failed to fetch currencies:', response.error);
          setCurrencies([]);
        }
      } catch (error) {
        console.error('Error fetching currencies:', error);
        setCurrencies([]);
      } finally {
        setCurrenciesLoading(false);
      }
    };

    fetchCurrencies();
  }, []);

  const updateForm = (field: keyof FinancialAccountForm, value: string) => {
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
    const newErrors: Partial<Record<keyof FinancialAccountForm, string>> = {};

    if (!form.account_name.trim()) {
      newErrors.account_name = 'Account name is required';
    }

    if (!form.currency.trim()) {
      newErrors.currency = 'Currency is required';
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
        account_name: form.account_name.trim(),
        currency: form.currency,
      };

      if (form.notes.trim()) payload.notes = form.notes.trim();

      console.log('Submitting payload:', payload);
      const response = await apiCall('/financial-account/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      console.log('API response:', response);
      if (response.status === 200 || response.status === 201) {
        showBanner('success', 'Financial account created successfully!');
        const redirectUrl = isNative ? '/financial-accounts' : '/?section=financial-accounts';
        setTimeout(() => router.replace(redirectUrl), 1500);
        return;
      }

      let errorMsg = 'Failed to create financial account';
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
          title="Create Account"
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
            top: isNative ? insets.top : 0,
            position: isNative ? 'absolute' : 'fixed'
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
            Create Financial Account
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
          {/* Account Name */}
          <View style={styles.fieldContainer}>
            <ThemedText style={styles.label}>Account Name *</ThemedText>
            <TextInput style={[styles.input, errors.account_name && styles.inputError]}
              value={form.account_name}
              onChangeText={(v) => updateForm('account_name', v)}
              placeholder="Enter account name"
              placeholderTextColor="#9ca3af" />
            {errors.account_name && <ThemedText style={styles.errorText}>{errors.account_name}</ThemedText>}
          </View>

          

          {/* Currency */}
          <View style={styles.fieldContainer}>
            <ThemedText style={styles.label}>Currency *</ThemedText>
            {currenciesLoading ? (
              <ThemedText style={styles.loadingText}>Loading currencies...</ThemedText>
            ) : (
              <View style={styles.currencyContainer}>
                {currencies.map(currency => (
                  <TouchableOpacity 
                    key={currency}
                    style={[styles.currencyButton, form.currency === currency && styles.activeCurrencyButton]}
                    onPress={() => updateForm('currency', currency)}
                  >
                    <ThemedText style={[styles.currencyButtonText, form.currency === currency && styles.activeCurrencyButtonText]}>
                      {currency.toUpperCase()}
                    </ThemedText>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            {errors.currency && <ThemedText style={styles.errorText}>{errors.currency}</ThemedText>}
          </View>

          {/* Notes */}
          <View style={styles.fieldContainer}>
            <ThemedText style={styles.label}>Notes</ThemedText>
            <TextInput style={[styles.input, styles.textArea]}
              value={form.notes}
              onChangeText={(v) => updateForm('notes', v)}
              placeholder="Additional notes about this account (optional)"
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
                  {loading ? 'Creating...' : 'Create Account'}
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
  helpText: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 4,
    fontStyle: 'italic',
  },
  currencyContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  currencyButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#fff',
  },
  activeCurrencyButton: {
    backgroundColor: '#5469D4',
    borderColor: '#5469D4',
  },
  currencyButtonText: {
    fontSize: 14,
    color: '#6b7280',
    fontWeight: '500',
  },
  activeCurrencyButtonText: {
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
  loadingText: {
    fontSize: 14,
    color: '#6b7280',
    fontStyle: 'italic',
    padding: 16,
    textAlign: 'center',
  },
});
