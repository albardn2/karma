import { useState } from "react";
import { Sidebar } from "./Sidebar";
import { MobileHeader } from "./MobileHeader";
import { MobileBottomNav } from "./MobileBottomNav";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { user } = useAuth();
  const { t } = useLanguage();
  // present only while a superuser is signed in with an impersonation token
  // (/auth/me returns impersonating_account_uuid + impersonating_company)
  const impersonatingCompany = (user as any)?.impersonating_company as string | undefined;

  const exitImpersonation = () => {
    const original = localStorage.getItem('auth_token_original');
    if (original) {
      localStorage.setItem('auth_token', original);
    } else {
      localStorage.removeItem('auth_token');
    }
    localStorage.removeItem('auth_token_original');
    window.location.href = '/accounts-admin';
  };

  return (
    <div className="min-h-screen flex flex-col">
      {impersonatingCompany && (
        <div
          data-testid="impersonation-banner"
          className="flex items-center justify-center gap-3 bg-amber-400 text-amber-950 text-sm font-medium px-4 py-1.5 z-50"
        >
          <span>{t('misc.accounts.viewingAs', { company: impersonatingCompany })}</span>
          <button
            data-testid="impersonation-exit"
            onClick={exitImpersonation}
            className="underline underline-offset-2 font-semibold hover:text-amber-800 transition-colors"
          >
            {t('misc.accounts.exit')}
          </button>
        </div>
      )}
      <div className="flex-1 flex flex-col lg:flex-row">
        <Sidebar isOpen={isMobileMenuOpen} onClose={() => setIsMobileMenuOpen(false)} />

        <MobileHeader onMenuToggle={() => setIsMobileMenuOpen(!isMobileMenuOpen)} />

        <main className="flex-1 flex flex-col overflow-hidden pb-16 lg:pb-0">
          {children}
        </main>

        <MobileBottomNav />
      </div>
    </div>
  );
}
