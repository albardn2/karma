import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from 'react';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useAuth } from '@/contexts/AuthContext';
import { Lang, translations } from '@/i18n';
import { enumLabel, enumLabelPretty } from '@/i18n/enums';

// Web counterpart of the mobile app's LanguageContext: same t/te/tef API.
// The signed-in user's PROFILE language is the single source of truth for the
// UI language — the sidebar toggle and the user form both drive it, and it is
// persisted on the profile (PUT /auth/me). localStorage is only a pre-auth
// cache so the login screen paints in the last-used language. Arabic → RTL.

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
  const { user, setUserLanguage } = useAuth();
  const [lang, setLangState] = useState<Lang>(() => storedLang() ?? 'en');

  // the signed-in user's profile language wins: adopt it whenever it changes
  // (login, sidebar toggle, or a self-edit in the user form all flow through
  // the in-memory user.language)
  const profileLang = (user as any)?.language;
  useEffect(() => {
    if (profileLang === 'ar' || profileLang === 'en') {
      setLangState(profileLang);
      localStorage.setItem(STORAGE_KEY, profileLang);
    }
  }, [profileLang]);

  useEffect(() => {
    applyDocumentDirection(lang);
  }, [lang]);

  const setLang = useCallback(
    (l: Lang) => {
      setLangState(l);
      localStorage.setItem(STORAGE_KEY, l);
      // keep the in-memory profile in sync (source of truth) and persist it —
      // best-effort, skipped when signed out (an unauthenticated PUT would
      // trigger the 401 reload logic)
      if (localStorage.getItem('auth_token')) {
        setUserLanguage(l);
        apiRequest('/auth/me', { method: 'PUT', body: { language: l } })
          .then(() => {
            // refresh any user views so their shown language stays in sync
            queryClient.invalidateQueries({ queryKey: ['/auth/user'], exact: false });
            queryClient.invalidateQueries({ queryKey: ['/auth/users'], exact: false });
          })
          .catch(() => {});
      }
    },
    [setUserLanguage]
  );

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
