import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, TrendingUp, DollarSign, Users, Package } from "lucide-react";

export default function Reports() {
  const reportCards = [
    {
      title: "Revenue Report",
      description: "Monthly and yearly revenue analysis",
      icon: DollarSign,
      color: "bg-green-100 text-green-600"
    },
    {
      title: "Customer Analytics",
      description: "Customer acquisition and retention metrics",
      icon: Users,
      color: "bg-blue-100 text-blue-600"
    },
    {
      title: "Sales Performance",
      description: "Sales trends and performance indicators",
      icon: TrendingUp,
      color: "bg-purple-100 text-purple-600"
    },
    {
      title: "Inventory Report",
      description: "Material usage and inventory levels",
      icon: Package,
      color: "bg-orange-100 text-orange-600"
    }
  ];

  return (
    <AppLayout>
      <div className="flex-1 overflow-auto p-4 lg:p-6">
        {/* Header */}
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Reports</h2>
          <p className="text-sm text-gray-600">Analyze your business performance and trends</p>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-900">$124,590</div>
                <div className="text-sm text-gray-600">Total Revenue</div>
                <div className="text-xs text-green-600 mt-1">+12.5% from last month</div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-900">47</div>
                <div className="text-sm text-gray-600">Active Orders</div>
                <div className="text-xs text-blue-600 mt-1">8 pending fulfillment</div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-900">234</div>
                <div className="text-sm text-gray-600">Total Customers</div>
                <div className="text-xs text-green-600 mt-1">+6 new this week</div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-900">12</div>
                <div className="text-sm text-gray-600">Overdue Invoices</div>
                <div className="text-xs text-red-600 mt-1">$8,450 total due</div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Report Categories */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {reportCards.map((report, index) => (
            <Card key={index} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-4">
                <div className="flex items-center space-x-3">
                  <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${report.color}`}>
                    <report.icon className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">{report.title}</h3>
                    <p className="text-sm text-gray-600">{report.description}</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex space-x-2">
                  <Button variant="outline" className="flex-1">
                    View Report
                  </Button>
                  <Button variant="outline" size="icon">
                    <Download className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Charts Placeholder */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <h3 className="text-lg font-semibold text-gray-900">Revenue Trend</h3>
            </CardHeader>
            <CardContent>
              <div className="h-64 flex items-center justify-center bg-gray-50 rounded-lg">
                <div className="text-center">
                  <div className="text-gray-400 text-4xl mb-2">📈</div>
                  <p className="text-gray-500">Revenue Chart</p>
                  <p className="text-xs text-gray-400">Chart implementation needed</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h3 className="text-lg font-semibold text-gray-900">Customer Growth</h3>
            </CardHeader>
            <CardContent>
              <div className="h-64 flex items-center justify-center bg-gray-50 rounded-lg">
                <div className="text-center">
                  <div className="text-gray-400 text-4xl mb-2">📊</div>
                  <p className="text-gray-500">Customer Growth Chart</p>
                  <p className="text-xs text-gray-400">Chart implementation needed</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
