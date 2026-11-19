import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  TextInputProps,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  EMPTY_SIGNUP_FORM,
  type SignupForm,
  requiredFilled,
  signupProblem,
  toSignupPayload,
} from '@/utils/signupForm';

/**
 * Company sign-up: creates the company and its first admin, as on the web.
 *
 * A successful sign-up signs the new admin in. The company starts unverified, so
 * the root layout replaces the app with the verification notice until a platform
 * owner verifies it; this screen never navigates anywhere itself on success.
 */
export default function SignupScreen() {
  const { signup } = useAuth();
  const { t, lang } = useLanguage();
  const router = useRouter();
  const [form, setForm] = useState<SignupForm>(EMPTY_SIGNUP_FORM);
  const [submitting, setSubmitting] = useState(false);

  const set = (field: keyof SignupForm) => (value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const submit = async () => {
    const problem = signupProblem(form);
    if (problem) {
      Alert.alert(t('signup.failedTitle'), t(problem));
      return;
    }
    setSubmitting(true);
    try {
      const result = await signup(toSignupPayload(form, lang));
      if (!result.ok) {
        Alert.alert(t('signup.failedTitle'), result.error || t('signup.failedMessage'));
      }
    } catch {
      Alert.alert(t('login.networkErrorTitle'), t('login.networkErrorMessage'));
    } finally {
      setSubmitting(false);
    }
  };

  const field = (
    key: keyof SignupForm,
    label: string,
    placeholder: string,
    props: TextInputProps = {},
  ) => (
    <View style={styles.inputContainer}>
      <ThemedText style={styles.label}>{label}</ThemedText>
      <TextInput
        style={styles.input}
        placeholder={placeholder}
        placeholderTextColor="#9CA3AF"
        value={form[key]}
        onChangeText={set(key)}
        editable={!submitting}
        testID={`signup-${key}`}
        {...props}
      />
    </View>
  );

  const canSubmit = requiredFilled(form) && !submitting;

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#5469D4', '#6B73E0', '#8B5CF6']} style={styles.gradient}>
        <KeyboardAvoidingView
          style={styles.keyboardContainer}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <ThemedView style={styles.formContainer}>
              <View style={styles.logoContainer}>
                <View style={styles.logoCircle}>
                  <ThemedText style={styles.logoText}>🏢</ThemedText>
                </View>
              </View>

              <ThemedText type="title" style={styles.title}>
                {t('signup.title')}
              </ThemedText>
              <ThemedText style={styles.subtitle}>{t('signup.subtitle')}</ThemedText>

              {field('companyName', t('signup.companyName'), t('signup.companyNamePlaceholder'), {
                autoComplete: 'organization',
                textContentType: 'organizationName',
              })}
              <View style={styles.row}>
                <View style={styles.rowItem}>
                  {field('firstName', t('signup.firstName'), t('signup.firstName'), {
                    autoComplete: 'name-given',
                    textContentType: 'givenName',
                  })}
                </View>
                <View style={styles.rowItem}>
                  {field('lastName', t('signup.lastName'), t('signup.lastName'), {
                    autoComplete: 'name-family',
                    textContentType: 'familyName',
                  })}
                </View>
              </View>
              {field('username', t('signup.username'), t('signup.usernamePlaceholder'), {
                autoCapitalize: 'none',
                autoCorrect: false,
                autoComplete: 'username-new',
                textContentType: 'username',
              })}
              {field('email', `${t('signup.email')} (${t('signup.optional')})`, t('signup.emailPlaceholder'), {
                autoCapitalize: 'none',
                autoCorrect: false,
                keyboardType: 'email-address',
                autoComplete: 'email',
                textContentType: 'emailAddress',
              })}
              {field('password', t('login.password'), t('signup.passwordPlaceholder'), {
                secureTextEntry: true,
                autoCapitalize: 'none',
                autoCorrect: false,
                autoComplete: 'new-password',
                textContentType: 'newPassword',
              })}
              {field('confirmPassword', t('signup.confirmPassword'), t('signup.confirmPasswordPlaceholder'), {
                secureTextEntry: true,
                autoCapitalize: 'none',
                autoCorrect: false,
                autoComplete: 'new-password',
                textContentType: 'newPassword',
              })}
              {field('phone', `${t('signup.phone')} (${t('signup.optional')})`, t('signup.phonePlaceholder'), {
                keyboardType: 'phone-pad',
                autoComplete: 'tel',
                textContentType: 'telephoneNumber',
              })}

              <TouchableOpacity
                style={[styles.submitButton, !canSubmit && styles.submitButtonDisabled]}
                onPress={submit}
                disabled={!canSubmit}
                testID="signup-submit"
              >
                <LinearGradient
                  colors={canSubmit ? ['#5469D4', '#6B73E0'] : ['#9CA3AF', '#9CA3AF']}
                  style={styles.submitButtonGradient}
                >
                  <ThemedText style={styles.submitButtonText}>
                    {submitting ? t('signup.creating') : t('signup.submit')}
                  </ThemedText>
                </LinearGradient>
              </TouchableOpacity>

              <View style={styles.footer}>
                <ThemedText style={styles.footerText}>{t('signup.haveAccount')} </ThemedText>
                <TouchableOpacity
                  onPress={() => router.replace('/login')}
                  disabled={submitting}
                  hitSlop={8}
                  testID="signup-login-link"
                >
                  <ThemedText style={styles.footerLink}>{t('login.signIn')}</ThemedText>
                </TouchableOpacity>
              </View>
            </ThemedView>
          </ScrollView>
        </KeyboardAvoidingView>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  gradient: { flex: 1 },
  keyboardContainer: { flex: 1 },
  scrollContent: { flexGrow: 1, justifyContent: 'center', padding: 24, paddingVertical: 64 },
  formContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 24,
    padding: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
    maxWidth: 400,
    alignSelf: 'center',
    width: '100%',
  },
  logoContainer: { alignItems: 'center', marginBottom: 20 },
  logoCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoText: { fontSize: 30, lineHeight: 36 },
  title: {
    textAlign: 'center',
    marginBottom: 8,
    fontSize: 24,
    fontWeight: '700',
    color: '#1F2937',
  },
  subtitle: { textAlign: 'center', marginBottom: 24, fontSize: 15, color: '#6B7280', lineHeight: 22 },
  row: { flexDirection: 'row', gap: 12 },
  rowItem: { flex: 1 },
  inputContainer: { marginBottom: 16 },
  label: { marginBottom: 6, fontSize: 14, fontWeight: '600', color: '#374151' },
  input: {
    height: 50,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 16,
    backgroundColor: '#FFFFFF',
    color: '#1F2937',
  },
  submitButton: {
    height: 52,
    borderRadius: 12,
    marginTop: 8,
    marginBottom: 16,
    shadowColor: '#5469D4',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  submitButtonDisabled: { shadowOpacity: 0.1 },
  submitButtonGradient: { flex: 1, justifyContent: 'center', alignItems: 'center', borderRadius: 12 },
  submitButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap' },
  footerText: { fontSize: 14, color: '#6B7280' },
  footerLink: { fontSize: 14, color: '#5469D4', fontWeight: '600' },
});
