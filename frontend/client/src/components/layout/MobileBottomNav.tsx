import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { 
  LayoutDashboard, 
  Users, 
  UserCheck,
  Building2,
  Warehouse,
  Package,
  Calendar,
  MapPin,
  Wallet,
  ClipboardList, 
  FileText, 
  ShoppingCart,
  CreditCard,
  MoreHorizontal
} from "lucide-react";

const navigation = [
  { key: "nav.dashboard", href: "/", icon: LayoutDashboard },
  { key: "nav.customers", href: "/customers", icon: Users },
  { key: "nav.materials", href: "/materials", icon: Package },
  { key: "nav.purchase", href: "/purchase-orders", icon: ShoppingCart },
  { key: "nav.payments", href: "/payments", icon: CreditCard },
];

export function MobileBottomNav() {
  const [location] = useLocation();
  const { user } = useAuth();
  const { t } = useLanguage();

  const permissionScope = (user as any)?.permissionScope ?? (user as any)?.permission_scope ?? '';
  const isAdmin = permissionScope.includes('admin') || permissionScope.includes('superuser');
  // menu visibility = user-level grants (admins exempt) intersected with the
  // tenant feature cap (binds admins too; platform owner exempt)
  const userModules: string[] | null =
    !isAdmin && Array.isArray((user as any)?.effective_permissions?.modules)
      ? (user as any).effective_permissions.modules
      : null;
  const accountModules: string[] | null = Array.isArray(
    (user as any)?.account_permissions?.modules
  )
    ? (user as any).account_permissions.modules
    : null;
  const grantedModules: string[] | null =
    userModules && accountModules
      ? userModules.filter((m: string) => accountModules.includes(m))
      : userModules ?? accountModules;
  const visibleNavigation = grantedModules
    ? navigation.filter((item) => {
        const moduleId = item.href === '/' ? 'dashboard' : item.href.slice(1);
        return grantedModules.includes(moduleId);
      })
    : navigation;

  return (
    <nav className="lg:hidden fixed bottom-0 start-0 end-0 bg-white border-t border-gray-200 px-4 py-2">
      <div className="flex items-center justify-around">
        {visibleNavigation.map((item) => {
          const isActive = location === item.href;
          return (
            <Link
              key={item.key}
              href={item.href}
              className={cn(
                "flex flex-col items-center py-2 px-3 transition-colors",
                isActive ? "text-[hsl(245,58%,57%)]" : "text-gray-400"
              )}
            >
              <item.icon className="w-5 h-5" />
              <span className="text-xs mt-1">{t(item.key)}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
