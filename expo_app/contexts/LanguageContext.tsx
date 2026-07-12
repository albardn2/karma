import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { DevSettings, I18nManager } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiCall } from '@/utils/api';
import { useAuth } from '@/contexts/AuthContext';
import { Lang, translations } from '@/i18n/translations';
import { enumLabel, enumLabelPretty } from '@/i18n/enums';

const STORAGE_KEY = 'app_language';

interface LanguageContextType {
  lang: Lang;
  /** switch the UI language, persist it locally and on the user profile */
  setLang: (l: Lang) => Promise<void>;
  /** translate a key; {name} placeholders substituted from vars */
  t: (key: string, vars?: Record<string, string | number>) => string;
  /** translate a backend enum value for display (raw value stays in state/API) */
  te: (value: string | null | undefined) => string;
  /** te + English prettify — for field identifiers shown as labels */
  tef: (value: string | null | undefined) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [lang, setLangState] = useState<Lang>('en');

  // initial language: locally stored choice wins, else the user's saved
  // profile preference, else English
  useEffect(() => {
    (async () => {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored === 'en' || stored === 'ar') {
        setLangState(stored);
      } else if (user?.language === 'ar' || user?.language === 'en') {
        setLangState(user.language);
      }
    })();
  }, [user?.language]);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      let s = translations[lang][key] ?? translations.en[key] ?? key;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          s = s.split(`{${k}}`).join(String(v));
        }
      }
      return s;
    },
    [lang]
  );

  const te = useCallback(
    (value: string | null | undefined) => enumLabel(value, lang),
    [lang]
  );
  const tef = useCallback(
    (value: string | null | undefined) => enumLabelPretty(value, lang),
    [lang]
  );

  const setLang = useCallback(async (l: Lang) => {
    setLangState(l);
    await AsyncStorage.setItem(STORAGE_KEY, l);
    // persist the preference on the user profile; best-effort
    apiCall('/auth/me', { method: 'PUT', body: JSON.stringify({ language: l }) }).catch(() => {});

    // Arabic is a right-to-left language: flip the layout direction. React
    // Native only applies the flip on the next app start, so reload when the
    // direction actually changes (DevSettings.reload works in dev clients and
    // release builds pick it up on next launch).
    const wantRTL = l === 'ar';
    if (I18nManager.isRTL !== wantRTL) {
      I18nManager.allowRTL(wantRTL);
      I18nManager.forceRTL(wantRTL);
      try {
        DevSettings.reload();
      } catch {
        // release build without dev menu — direction applies on next launch
      }
    }
  }, []);

  return (
    <LanguageContext.Provider value={{ lang, setLang, t, te, tef }}>{children}</LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
