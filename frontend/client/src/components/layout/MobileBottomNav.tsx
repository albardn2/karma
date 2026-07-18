import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
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
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Customers", href: "/customers", icon: Users },
  { name: "Materials", href: "/materials", icon: Package },
  { name: "Purchase", href: "/purchase-orders", icon: ShoppingCart },
  { name: "Payments", href: "/payments", icon: CreditCard },
];

export function MobileBottomNav() {
  const [location] = useLocation();

  return (
    <nav className="lg:hidden fixed bottom-0 start-0 end-0 bg-white border-t border-gray-200 px-4 py-2">
      <div className="flex items-center justify-around">
        {navigation.map((item) => {
          const isActive = location === item.href;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex flex-col items-center py-2 px-3 transition-colors",
                isActive ? "text-[hsl(245,58%,57%)]" : "text-gray-400"
              )}
            >
              <item.icon className="w-5 h-5" />
              <span className="text-xs mt-1">{item.name}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
