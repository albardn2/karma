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

/**
 * Keep the native layout direction in step with the language — Arabic is
 * right-to-left. I18nManager's flag is persisted natively, so it survives
 * reinstalls and login changes and can easily disagree with the language we
 * resolved (an admin edits the profile on the web, a previous session left the
 * flag set, …). Call this from EVERY path that adopts a language, not just the
 * in-app switcher, or the app renders English text in a mirrored layout.
 *
 * React Native only applies a direction change on the next app start, so we
 * reload — but only when the direction actually changed, otherwise the app
 * would reload-loop on every launch.
 */
function syncLayoutDirection(l: Lang) {
  const wantRTL = l === 'ar';
  if (I18nManager.isRTL === wantRTL) return;
  I18nManager.allowRTL(wantRTL);
  I18nManager.forceRTL(wantRTL);
  try {
    DevSettings.reload();
  } catch {
    // release build without dev menu — direction applies on next launch
  }
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [lang, setLangState] = useState<Lang>('en');

  // the signed-in user's PROFILE language is the source of truth: adopt it
  // whenever it changes (e.g. login, or an admin changed it on the web).
  // AsyncStorage is only a pre-auth cache for the very first paint. Whichever
  // language wins, reconcile the native layout direction with it — the flag
  // persists across launches and reinstalls, so it may well contradict us.
  useEffect(() => {
    (async () => {
      let resolved: Lang = 'en';
      if (user?.language === 'ar' || user?.language === 'en') {
        resolved = user.language;
        await AsyncStorage.setItem(STORAGE_KEY, resolved);
      } else {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored === 'en' || stored === 'ar') resolved = stored;
      }
      setLangState(resolved);
      // after the cache write above, so a reload can't drop the language
      syncLayoutDirection(resolved);
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

    syncLayoutDirection(l);
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
