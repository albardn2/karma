import { ShieldAlert, LogOut, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';

/**
 * What a company sees before a platform owner has verified it.
 *
 * This is the whole application for an unverified account: it renders instead of
 * every authenticated route (see ProtectedRoute), and the backend independently
 * refuses every resource endpoint with 403 `account_unverified`, so the notice is
 * not the security boundary — it is the explanation. If it were only a UI gate,
 * anyone could call the API directly.
 *
 * Sign out stays available because the alternative is a dead end: without it a
 * user on an unverified account could not switch to another login.
 */
export function AccountUnverified() {
  const { user, logout } = useAuth();
  const { t } = useLanguage();
  const company = (user as any)?.account_company_name as string | undefined;

  return (
    <div className="min-h-screen brand-gradient flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl p-8 text-center dark:bg-gray-900">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/40">
          <ShieldAlert className="h-7 w-7 text-amber-600 dark:text-amber-400" />
        </div>

        <h1 className="text-xl font-semibold text-gray-900 dark:text-white" data-testid="unverified-title">
          {t('misc.unverified.title')}
        </h1>

        <p className="mt-3 text-sm leading-relaxed text-gray-600 dark:text-gray-300">
          {t('misc.unverified.body')}
        </p>
        <p className="mt-2 text-sm font-medium leading-relaxed text-gray-800 dark:text-gray-200">
          {t('misc.unverified.contact')}
        </p>

        {(company || user?.username) && (
          <div className="mt-6 space-y-1 rounded-lg bg-gray-50 p-3 text-start text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-400">
            {company && (
              <div>
                <span className="font-semibold">{t('misc.unverified.company')}:</span> {company}
              </div>
            )}
            {user?.username && (
              <div>
                <span className="font-semibold">{t('misc.unverified.signedInAs')}:</span> {user.username}
              </div>
            )}
          </div>
        )}

        <div className="mt-6 flex gap-3">
          {/* A full reload is deliberate: it re-runs the /auth/me fetch on mount,
              which is the only way this screen learns it has been verified. */}
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => window.location.reload()}
            data-testid="button-unverified-recheck"
          >
            <RefreshCw className="me-2 h-4 w-4" />
            {t('misc.unverified.recheck')}
          </Button>
          <Button
            variant="ghost"
            className="flex-1"
            onClick={logout}
            data-testid="button-unverified-signout"
          >
            <LogOut className="me-2 h-4 w-4" />
            {t('misc.unverified.signOut')}
          </Button>
        </div>
      </div>
    </div>
  );
}
