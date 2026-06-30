import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";

interface MobileHeaderProps {
  onMenuToggle: () => void;
}

export function MobileHeader({ onMenuToggle }: MobileHeaderProps) {
  const { user } = useAuth();

  const getUserInitials = (user: any) => {
    if (!user) return 'U';
    const firstInitial = user.firstName?.[0] || '';
    const lastInitial = user.lastName?.[0] || '';
    return `${firstInitial}${lastInitial}`.toUpperCase() || user.username?.[0]?.toUpperCase() || 'U';
  };

  return (
    <header className="lg:hidden bg-white border-b border-gray-200 shadow-sm">
      <div className="flex items-center justify-between h-16 px-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={onMenuToggle}
          className="text-gray-600"
        >
          <Menu className="w-6 h-6" />
        </Button>
        
        <h1 className="text-lg font-bold brand-gradient-text">
          ManufactureCRM
        </h1>
        
        <div className="w-8 h-8 brand-gradient rounded-full flex items-center justify-center">
          <span className="text-sm font-medium text-white">{getUserInitials(user)}</span>
        </div>
      </div>
    </header>
  );
}
