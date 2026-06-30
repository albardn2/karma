import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
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
  Truck
} from "lucide-react";

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

const navigation = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Customers", href: "/customers", icon: Users },
  { name: "Vendors", href: "/vendors", icon: Building2 },
  { name: "Warehouses", href: "/warehouses", icon: Warehouse },
  { name: "Employees", href: "/employees", icon: UserCheck },
  { name: "Users", href: "/users", icon: UserCheck },
  { name: "Vehicles", href: "/vehicles", icon: Car },
  { name: "Trips", href: "/trips", icon: Truck },
  { name: "Financial Accounts", href: "/financial-accounts", icon: Wallet },
  { name: "Materials", href: "/materials", icon: Package },
  { name: "Pricing", href: "/pricing", icon: DollarSign },
  { name: "Fixed Assets", href: "/fixed-assets", icon: Package2 },
  { name: "Inventory", href: "/inventory", icon: Package },
  { name: "Inventory Events", href: "/inventory-events", icon: Calendar },
  { name: "Service Areas", href: "/service-areas", icon: MapPin },
  { name: "Purchase Orders", href: "/purchase-orders", icon: ShoppingCart },
  { name: "Customer Orders", href: "/customer-orders", icon: ClipboardList },
  { name: "Payments", href: "/payments", icon: CreditCard },
  { name: "Payouts", href: "/payouts", icon: ArrowUpRight },
  { name: "Expenses", href: "/expenses", icon: Receipt },
  { name: "Transactions", href: "/transactions", icon: ArrowRightLeft },
  { name: "Credit Note Items", href: "/credit-note-items", icon: FileText },
  { name: "Debit Note Items", href: "/debit-note-items", icon: FileText },
  { name: "Processes", href: "/processes", icon: Factory },
  { name: "Workflows", href: "/workflows", icon: GitBranch },
  { name: "Workflow Execution", href: "/workflow-execution", icon: Play },
];

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const [location] = useLocation();
  const { user, logout } = useAuth();

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
    if (!user) return 'User';
    return user.firstName && user.lastName 
      ? `${user.firstName} ${user.lastName}`
      : user.username || 'User';
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
        "fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200 shadow-sm transform transition-transform duration-200 ease-in-out lg:translate-x-0 lg:static lg:inset-0",
        isOpen ? "translate-x-0" : "-translate-x-full",
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
            {navigation.map((item) => {
              const isActive = location === item.href;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={onClose}
                  className={cn(
                    "flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors",
                    isActive
                      ? "text-white brand-gradient"
                      : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                  )}
                >
                  <item.icon className="w-5 h-5 mr-3" />
                  {item.name}
                </Link>
              );
            })}
          </nav>
        </div>
        
        {/* Fixed Footer */}
        <div className="px-4 py-4 border-t border-gray-200 flex-shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 brand-gradient rounded-full flex items-center justify-center">
              <span className="text-sm font-medium text-white">{getUserInitials(user)}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{getUserDisplayName(user)}</p>
              <p className="text-xs text-gray-500 truncate">
                {user?.permissionScope?.includes('admin') ? 'Administrator' : 'User'}
              </p>
            </div>
            <button 
              onClick={handleLogout}
              className="text-gray-400 hover:text-gray-600 transition-colors"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
