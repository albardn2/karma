import { useAuth } from '@/contexts/AuthContext';
import Login from '@/pages/Login';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen brand-gradient flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 brand-gradient rounded-full animate-pulse mx-auto mb-4"></div>
          <p className="text-white font-medium">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Login />;
  }

  return <>{children}</>;
}