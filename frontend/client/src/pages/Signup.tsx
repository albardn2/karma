import { useState } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Building2, User, Lock, Globe, Mail, Phone } from 'lucide-react';

export default function Signup() {
  const [, setLocation] = useLocation();
  const { signup, isLoading } = useAuth();
  const { toast } = useToast();
  const { t, lang, setLang } = useLanguage();

  const [companyName, setCompanyName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [phone, setPhone] = useState('');

  const requiredFilled =
    !!companyName.trim() &&
    !!firstName.trim() &&
    !!lastName.trim() &&
    !!username.trim() &&
    !!password &&
    !!confirmPassword;

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!requiredFilled) {
      toast({
        title: t('common.error'),
        description: t('misc.login.fillAllFields'),
        variant: 'destructive',
      });
      return;
    }

    if (username.includes('@')) {
      toast({
        title: t('common.error'),
        description: t('misc.signup.usernameNoAt'),
        variant: 'destructive',
      });
      return;
    }

    if (password.length < 6) {
      toast({
        title: t('common.error'),
        description: t('misc.signup.passwordTooShort'),
        variant: 'destructive',
      });
      return;
    }

    if (password !== confirmPassword) {
      toast({
        title: t('common.error'),
        description: t('misc.signup.passwordMismatch'),
        variant: 'destructive',
      });
      return;
    }

    try {
      const result = await signup({
        company_name: companyName.trim(),
        username: username.trim(),
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        password,
        ...(email.trim() ? { email: email.trim() } : {}),
        ...(phone.trim() ? { phone_number: phone.trim() } : {}),
        language: lang,
      });

      if (result.success) {
        toast({
          title: t('misc.signup.successTitle'),
          description: t('misc.signup.successDesc'),
        });
        setLocation('/');
      } else {
        toast({
          title: t('misc.signup.failedTitle'),
          description: result.error || t('misc.signup.failedDesc'),
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: t('misc.login.networkErrorTitle'),
        description: t('misc.login.networkErrorDesc'),
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="min-h-screen brand-gradient flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-white/95 backdrop-blur-sm shadow-2xl">
        <CardContent className="p-8">
          {/* Language toggle */}
          <div className="flex justify-end mb-2">
            <button
              type="button"
              onClick={() => setLang(lang === 'en' ? 'ar' : 'en')}
              className="flex items-center px-2 py-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              data-testid="signup-language-toggle"
            >
              <Globe className="w-4 h-4 me-2" />
              {lang === 'en' ? 'العربية' : 'English'}
            </button>
          </div>

          {/* Logo and Title */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 brand-gradient rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl text-white">🏢</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              {t('misc.signup.title')}
            </h1>
            <p className="text-gray-600">
              {t('misc.signup.subtitle')}
            </p>
          </div>

          {/* Signup Form */}
          <form onSubmit={handleSignup} className="space-y-6">
            <div className="space-y-4">
              <div>
                <label htmlFor="signup-company" className="block text-sm font-medium text-gray-700 mb-2">
                  {t('misc.signup.companyName')}
                </label>
                <div className="relative">
                  <Building2 className="absolute start-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <Input
                    id="signup-company"
                    type="text"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder={t('misc.signup.companyNamePlaceholder')}
                    className="ps-10"
                    disabled={isLoading}
                    autoComplete="organization"
                    data-testid="signup-company"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="signup-firstname" className="block text-sm font-medium text-gray-700 mb-2">
                    {t('misc.signup.firstName')}
                  </label>
                  <Input
                    id="signup-firstname"
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder={t('misc.signup.firstNamePlaceholder')}
                    disabled={isLoading}
                    autoComplete="given-name"
                    data-testid="signup-firstname"
                  />
                </div>
                <div>
                  <label htmlFor="signup-lastname" className="block text-sm font-medium text-gray-700 mb-2">
                    {t('misc.signup.lastName')}
                  </label>
                  <Input
                    id="signup-lastname"
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder={t('misc.signup.lastNamePlaceholder')}
                    disabled={isLoading}
                    autoComplete="family-name"
                    data-testid="signup-lastname"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="signup-username" className="block text-sm font-medium text-gray-700 mb-2">
                  {t('common.username')}
                </label>
                <div className="relative">
                  <User className="absolute start-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <Input
                    id="signup-username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder={t('misc.signup.usernamePlaceholder')}
                    className="ps-10"
                    disabled={isLoading}
                    autoComplete="username"
                    data-testid="signup-username"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="signup-email" className="block text-sm font-medium text-gray-700 mb-2">
                  {t('common.email')} ({t('common.optional')})
                </label>
                <div className="relative">
                  <Mail className="absolute start-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <Input
                    id="signup-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t('misc.signup.emailPlaceholder')}
                    className="ps-10"
                    disabled={isLoading}
                    autoComplete="email"
                    data-testid="signup-email"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="signup-password" className="block text-sm font-medium text-gray-700 mb-2">
                  {t('common.password')}
                </label>
                <div className="relative">
                  <Lock className="absolute start-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <Input
                    id="signup-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t('misc.signup.passwordPlaceholder')}
                    className="ps-10"
                    disabled={isLoading}
                    autoComplete="new-password"
                    data-testid="signup-password"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="signup-confirm" className="block text-sm font-medium text-gray-700 mb-2">
                  {t('misc.signup.confirmPassword')}
                </label>
                <div className="relative">
                  <Lock className="absolute start-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <Input
                    id="signup-confirm"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder={t('misc.signup.confirmPasswordPlaceholder')}
                    className="ps-10"
                    disabled={isLoading}
                    autoComplete="new-password"
                    data-testid="signup-confirm"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="signup-phone" className="block text-sm font-medium text-gray-700 mb-2">
                  {t('common.phone')} ({t('common.optional')})
                </label>
                <div className="relative">
                  <Phone className="absolute start-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <Input
                    id="signup-phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder={t('misc.signup.phonePlaceholder')}
                    className="ps-10"
                    disabled={isLoading}
                    autoComplete="tel"
                    data-testid="signup-phone"
                  />
                </div>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full brand-gradient hover:opacity-90 text-white"
              disabled={isLoading || !requiredFilled}
              data-testid="signup-submit"
            >
              {isLoading ? t('misc.signup.creating') : t('misc.signup.submit')}
            </Button>
          </form>

          {/* Back to sign in */}
          <div className="mt-6 text-center">
            <span className="text-sm text-gray-600">
              {t('misc.signup.haveAccount')}{' '}
            </span>
            <button
              type="button"
              onClick={() => setLocation('/login')}
              className="text-sm text-gray-600 hover:text-gray-900 underline"
              disabled={isLoading}
              data-testid="signup-login-link"
            >
              {t('common.signIn')}
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
