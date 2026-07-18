import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from 'react';
import { apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/contexts/AuthContext';
import { Lang, translations } from '@/i18n';
import { enumLabel, enumLabelPretty } from '@/i18n/enums';

// Web counterpart of the mobile app's LanguageContext: same t/te/tef API,
// same persistence (local choice wins, else the user's profile preference,
// best-effort PUT /auth/me on change). Arabic flips the document to RTL.

const STORAGE_KEY = 'app_language';

interface LanguageContextType {
  lang: Lang;
  /** switch the UI language, persist it locally and on the user profile */
  setLang: (l: Lang) => void;
  /** translate a key; {name} placeholders substituted from vars */
  t: (key: string, vars?: Record<string, string | number>) => string;
  /** translate a backend enum value for display (raw value stays in state/API) */
  te: (value: string | null | undefined) => string;
  /** te + English prettify — for field identifiers shown as labels */
  tef: (value: string | null | undefined) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const applyDocumentDirection = (lang: Lang) => {
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  document.documentElement.lang = lang;
};

const storedLang = (): Lang | null => {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === 'en' || stored === 'ar' ? stored : null;
};

export function LanguageProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [lang, setLangState] = useState<Lang>(() => storedLang() ?? 'en');

  // no locally stored choice → follow the user's saved profile preference
  useEffect(() => {
    if (storedLang()) return;
    const preferred = (user as any)?.language;
    if (preferred === 'ar' || preferred === 'en') setLangState(preferred);
  }, [user]);

  useEffect(() => {
    applyDocumentDirection(lang);
  }, [lang]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    localStorage.setItem(STORAGE_KEY, l);
    // persist the preference on the user profile; best-effort (skip when not
    // signed in — an unauthenticated PUT would trigger the 401 reload logic)
    if (localStorage.getItem('auth_token')) {
      apiRequest('/auth/me', { method: 'PUT', body: { language: l } }).catch(() => {});
    }
  }, []);

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

  return (
    <LanguageContext.Provider value={{ lang, setLang, t, te, tef }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
