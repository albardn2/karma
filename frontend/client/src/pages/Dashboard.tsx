import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { MetricsCards } from "@/components/dashboard/MetricsCards";
import { RecentOrders } from "@/components/dashboard/RecentOrders";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { RecentActivity } from "@/components/dashboard/RecentActivity";
import { Button } from "@/components/ui/button";
import { Bell, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { DashboardMetrics, RecentOrderWithCustomer } from "@/lib/types";

export default function Dashboard() {
  const { data: metrics, isLoading: metricsLoading } = useQuery<DashboardMetrics>({
    queryKey: ["/api/dashboard/metrics"],
  });

  const { data: recentOrders, isLoading: ordersLoading } = useQuery<RecentOrderWithCustomer[]>({
    queryKey: ["/api/dashboard/recent-orders"],
  });

  if (metricsLoading || ordersLoading) {
    return (
      <AppLayout>
        <div className="flex-1 p-6">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-gray-200 rounded w-1/4"></div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-32 bg-gray-200 rounded-xl"></div>
              ))}
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      {/* Top Bar - Desktop */}
      <div className="hidden lg:flex items-center justify-between h-16 px-6 bg-white border-b border-gray-200">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>
          <p className="text-sm text-gray-600">
            Welcome back! Here's what's happening with your manufacturing operations.
          </p>
        </div>
        <div className="flex items-center space-x-4">
          <Button variant="ghost" size="icon" className="relative text-gray-400 hover:text-gray-600">
            <Bell className="w-6 h-6" />
            <Badge className="absolute -top-1 -right-1 w-3 h-3 p-0 bg-red-500 text-white border-0">
              <span className="sr-only">3 notifications</span>
            </Badge>
          </Button>
          <Button className="brand-gradient hover:opacity-90">
            <Plus className="w-4 h-4 mr-2" />
            New Order
          </Button>
        </div>
      </div>

      {/* Dashboard Content */}
      <div className="flex-1 overflow-auto p-4 lg:p-6">
        {/* Metrics Cards */}
        {metrics && <MetricsCards metrics={metrics} />}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          {/* Recent Orders */}
          {recentOrders && <RecentOrders orders={recentOrders} />}

          {/* Quick Actions & Recent Activity */}
          <div className="space-y-6">
            <QuickActions />
            <RecentActivity />
          </div>
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Revenue Trend</h3>
            <div className="h-64 flex items-center justify-center bg-gray-50 rounded-lg">
              <div className="text-center">
                <div className="text-gray-400 text-4xl mb-2">📈</div>
                <p className="text-gray-500">Revenue Chart</p>
                <p className="text-xs text-gray-400">Chart implementation needed</p>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Order Status Distribution</h3>
            <div className="h-64 flex items-center justify-center bg-gray-50 rounded-lg">
              <div className="text-center">
                <div className="text-gray-400 text-4xl mb-2">📊</div>
                <p className="text-gray-500">Order Status Chart</p>
                <p className="text-xs text-gray-400">Chart implementation needed</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
