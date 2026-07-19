import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useEffect } from "react";
import { 
  LayoutDashboard, 
  Users, 
  UserCheck,
  Building2,
  Warehouse,
  Wallet,
  ClipboardList, 
  Package, 
  DollarSign,
  Package2,
  Calendar,
  MapPin,
  FileText, 
  ShoppingCart,
  CreditCard,
  ArrowUpRight,
  Receipt,
  ArrowRightLeft,
  Factory,
  GitBranch,
  BarChart3,
  LogOut,
  Play,
  Car,
  Truck,
  Globe
} from "lucide-react";

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

const navigation = [
  { key: "nav.dashboard", href: "/", icon: LayoutDashboard },
  { key: "nav.customers", href: "/customers", icon: Users },
  { key: "nav.vendors", href: "/vendors", icon: Building2 },
  { key: "nav.warehouses", href: "/warehouses", icon: Warehouse },
  { key: "nav.employees", href: "/employees", icon: UserCheck },
  { key: "nav.users", href: "/users", icon: UserCheck },
  { key: "nav.vehicles", href: "/vehicles", icon: Car },
  { key: "nav.trips", href: "/trips", icon: Truck },
  { key: "nav.financialAccounts", href: "/financial-accounts", icon: Wallet },
  { key: "nav.materials", href: "/materials", icon: Package },
  { key: "nav.pricing", href: "/pricing", icon: DollarSign },
  { key: "nav.fixedAssets", href: "/fixed-assets", icon: Package2 },
  { key: "nav.inventory", href: "/inventory", icon: Package },
  { key: "nav.inventoryEvents", href: "/inventory-events", icon: Calendar },
  { key: "nav.serviceAreas", href: "/service-areas", icon: MapPin },
  { key: "nav.purchaseOrders", href: "/purchase-orders", icon: ShoppingCart },
  { key: "nav.customerOrders", href: "/customer-orders", icon: ClipboardList },
  { key: "nav.payments", href: "/payments", icon: CreditCard },
  { key: "nav.payouts", href: "/payouts", icon: ArrowUpRight },
  { key: "nav.expenses", href: "/expenses", icon: Receipt },
  { key: "nav.transactions", href: "/transactions", icon: ArrowRightLeft },
  { key: "nav.creditNoteItems", href: "/credit-note-items", icon: FileText },
  { key: "nav.debitNoteItems", href: "/debit-note-items", icon: FileText },
  { key: "nav.processes", href: "/processes", icon: Factory },
  { key: "nav.workflows", href: "/workflows", icon: GitBranch },
  { key: "nav.workflowExecution", href: "/workflow-execution", icon: Play },
  // adminOnly entries are filtered out for non-admin users below
  { key: "nav.liveMap", href: "/live-map", icon: MapPin, adminOnly: true },
  { key: "nav.locationTracking", href: "/location-tracking", icon: MapPin, adminOnly: true },
];

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const { t, lang, setLang } = useLanguage();
  // /auth/me returns snake_case; the typed camelCase field is never populated
  const permissionScope = (user as any)?.permissionScope ?? (user as any)?.permission_scope ?? '';
  const isAdmin = permissionScope.includes('admin') || permissionScope.includes('superuser');
  // effective permissions govern menu visibility: non-admins only see the
  // modules their role preset (or explicit override) grants; admins see all
  const grantedModules: string[] | null =
    !isAdmin && Array.isArray((user as any)?.effective_permissions?.modules)
      ? (user as any).effective_permissions.modules
      : null;
  const visibleNavigation = navigation.filter((item: any) => {
    if (item.adminOnly && !isAdmin) return false;
    if (grantedModules) {
      const moduleId = item.href === '/' ? 'dashboard' : item.href.slice(1);
      return grantedModules.includes(moduleId);
    }
    return true;
  });

  // Prevent body scroll when mobile sidebar is open
  useEffect(() => {
    if (isOpen && window.innerWidth < 1024) {
      document.body.style.overflow = 'hidden';
      document.body.style.touchAction = 'none';
    } else {
      document.body.style.overflow = '';
      document.body.style.touchAction = '';
    }

    // Cleanup on unmount
    return () => {
      document.body.style.overflow = '';
      document.body.style.touchAction = '';
    };
  }, [isOpen]);

  const handleLogout = () => {
    logout();
    if (onClose) onClose();
  };

  const getUserInitials = (user: any) => {
    if (!user) return 'U';
    const firstInitial = user.firstName?.[0] || '';
    const lastInitial = user.lastName?.[0] || '';
    return `${firstInitial}${lastInitial}`.toUpperCase() || user.username?.[0]?.toUpperCase() || 'U';
  };

  const getUserDisplayName = (user: any) => {
    if (!user) return t('common.user');
    return user.firstName && user.lastName
      ? `${user.firstName} ${user.lastName}`
      : user.username || t('common.user');
  };

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 start-0 z-50 w-64 bg-white border-e border-gray-200 shadow-sm transform transition-transform duration-200 ease-in-out lg:translate-x-0 lg:static lg:inset-0",
        isOpen ? "translate-x-0" : "max-lg:-translate-x-full max-lg:rtl:translate-x-full",
        "flex flex-col h-screen touch-none"
      )}
        onTouchMove={(e) => {
          // Prevent touch events from bubbling to the main page when sidebar is open on mobile
          if (isOpen && window.innerWidth < 1024) {
            e.stopPropagation();
          }
        }}
      >
        {/* Fixed Header */}
        <div className="flex items-center justify-center h-16 px-6 brand-gradient flex-shrink-0">
          <h1 className="text-xl font-bold text-white">ManufactureCRM</h1>
        </div>
        
        {/* Scrollable Navigation */}
        <div 
          className={cn(
            "flex-1 overflow-y-auto sidebar-scroll overscroll-contain",
            "mobile-sidebar"
          )}
          onTouchStart={(e) => e.stopPropagation()}
          onTouchMove={(e) => {
            // Allow scrolling within the navigation area but prevent body scroll
            const element = e.currentTarget;
            const { scrollTop, scrollHeight, clientHeight } = element;
            
            // If at top and scrolling up, prevent default
            if (scrollTop === 0 && e.touches[0].clientY > e.touches[0].target.getBoundingClientRect().top) {
              e.preventDefault();
            }
            
            // If at bottom and scrolling down, prevent default
            if (scrollTop + clientHeight >= scrollHeight && e.touches[0].clientY < e.touches[0].target.getBoundingClientRect().bottom) {
              e.preventDefault();
            }
            
            e.stopPropagation();
          }}
        >
          <nav className="px-4 py-6 space-y-2">
            {visibleNavigation.map((item) => {
              const isActive = location === item.href;
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  onClick={onClose}
                  className={cn(
                    "flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors",
                    isActive
                      ? "text-white brand-gradient"
                      : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                  )}
                >
                  <item.icon className="w-5 h-5 me-3" />
                  {t(item.key)}
                </Link>
              );
            })}
          </nav>
        </div>
        
        {/* Fixed Footer */}
        <div className="px-4 py-4 border-t border-gray-200 flex-shrink-0 space-y-3">
          <button
            onClick={() => setLang(lang === "en" ? "ar" : "en")}
            className="flex items-center w-full px-2 py-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            data-testid="language-toggle"
          >
            <Globe className="w-4 h-4 me-2" />
            {lang === "en" ? "العربية" : "English"}
          </button>
          <div className="flex items-center space-x-3 rtl:space-x-reverse">
            <div className="w-8 h-8 brand-gradient rounded-full flex items-center justify-center">
              <span className="text-sm font-medium text-white">{getUserInitials(user)}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{getUserDisplayName(user)}</p>
              <p className="text-xs text-gray-500 truncate">
                {isAdmin ? t('common.administrator') : t('common.user')}
              </p>
            </div>
            <button 
              onClick={handleLogout}
              className="text-gray-400 hover:text-gray-600 transition-colors"
              title={t('common.signOut')}
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
