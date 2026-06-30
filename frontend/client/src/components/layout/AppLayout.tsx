import { useState } from "react";
import { Sidebar } from "./Sidebar";
import { MobileHeader } from "./MobileHeader";
import { MobileBottomNav } from "./MobileBottomNav";

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      <Sidebar isOpen={isMobileMenuOpen} onClose={() => setIsMobileMenuOpen(false)} />
      
      <MobileHeader onMenuToggle={() => setIsMobileMenuOpen(!isMobileMenuOpen)} />
      
      <main className="flex-1 flex flex-col overflow-hidden pb-16 lg:pb-0">
        {children}
      </main>

      <MobileBottomNav />
    </div>
  );
}
