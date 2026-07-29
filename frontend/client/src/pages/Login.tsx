import { useState } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { LanguageSwitch } from '@/components/LanguageSwitch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { User, Lock } from 'lucide-react';

export default function Login() {
  const [, setLocation] = useLocation();
  const { login, isLoading } = useAuth();
  const { toast } = useToast();
  const { t } = useLanguage();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const handleManualLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!username || !password) {
      toast({
        title: t('common.error'),
        description: t('misc.login.fillAllFields'),
        variant: "destructive",
      });
      return;
    }

    try {
      const success = await login(username, password);
      if (success) {
        setLocation('/');
      } else {
        toast({
          title: t('misc.login.failedTitle'),
          description: t('misc.login.invalidCredentials'),
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: t('misc.login.networkErrorTitle'),
        description: t('misc.login.networkErrorDesc'),
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen brand-gradient flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-white/95 backdrop-blur-sm shadow-2xl">
        <CardContent className="p-8">
          {/* Language toggle */}
          <div className="flex justify-end mb-2">
            <LanguageSwitch testId="login-language-toggle" />
          </div>

          {/* Logo and Title */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 brand-gradient rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl text-white">👋</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              {t('misc.login.welcomeBack')}
            </h1>
            <p className="text-gray-600">
              {t('misc.login.subtitle')}
            </p>
          </div>

          <form onSubmit={handleManualLogin} className="space-y-6">
            <div className="space-y-4">
              <div>
                <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-2">
                  {t('misc.login.usernameOrEmail')}
                </label>
                <div className="relative">
                  <User className="absolute start-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <Input
                    id="username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder={t('misc.login.usernamePlaceholder')}
                    className="ps-10"
                    disabled={isLoading}
                    autoComplete="username"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                  {t('common.password')}
                </label>
                <div className="relative">
                  <Lock className="absolute start-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t('misc.login.passwordPlaceholder')}
                    className="ps-10"
                    disabled={isLoading}
                    autoComplete="current-password"
                  />
                </div>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full brand-gradient hover:opacity-90 text-white"
              disabled={isLoading || !username || !password}
            >
              {isLoading ? t('misc.login.signingIn') : t('common.signIn')}
            </Button>
          </form>

          {/* Company signup */}
          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={() => setLocation('/signup')}
              className="text-sm text-gray-600 hover:text-gray-900 underline"
              disabled={isLoading}
              data-testid="login-signup-link"
            >
              {t('misc.login.createCompanyAccount')}
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
