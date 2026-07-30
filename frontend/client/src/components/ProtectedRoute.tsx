import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import Login from '@/pages/Login';
import { AccountUnverified } from '@/components/AccountUnverified';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const { t } = useLanguage();

  if (isLoading) {
    return (
      <div className="min-h-screen brand-gradient flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 brand-gradient rounded-full animate-pulse mx-auto mb-4"></div>
          <p className="text-white font-medium">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Login />;
  }

  // An unverified company can sign in and gets told why, and nothing else. This
  // sits here rather than in AppLayout because every authenticated route in
  // App.tsx is wrapped in ProtectedRoute — gating the layout instead would let
  // any page that renders outside it through.
  //
  // Compared against `false` explicitly, not falsy: an older backend that does
  // not send the field yet leaves it undefined, and that must keep working
  // rather than lock every tenant out of a newer frontend.
  if ((user as any)?.account_verified === false) {
    return <AccountUnverified />;
  }

  return <>{children}</>;
}