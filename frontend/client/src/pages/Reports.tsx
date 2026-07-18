import { AppLayout } from "@/components/layout/AppLayout";
import { useLanguage } from "@/contexts/LanguageContext";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, TrendingUp, DollarSign, Users, Package } from "lucide-react";

const reportCards = [
  {
    titleKey: "misc.reports.revenueReport",
    descriptionKey: "misc.reports.revenueReportDesc",
    icon: DollarSign,
    color: "bg-green-100 text-green-600"
  },
  {
    titleKey: "misc.reports.customerAnalytics",
    descriptionKey: "misc.reports.customerAnalyticsDesc",
    icon: Users,
    color: "bg-blue-100 text-blue-600"
  },
  {
    titleKey: "misc.reports.salesPerformance",
    descriptionKey: "misc.reports.salesPerformanceDesc",
    icon: TrendingUp,
    color: "bg-purple-100 text-purple-600"
  },
  {
    titleKey: "misc.reports.inventoryReport",
    descriptionKey: "misc.reports.inventoryReportDesc",
    icon: Package,
    color: "bg-orange-100 text-orange-600"
  }
];

export default function Reports() {
  const { t } = useLanguage();

  return (
    <AppLayout>
      <div className="flex-1 overflow-auto p-4 lg:p-6">
        {/* Header */}
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900">{t('misc.reports.title')}</h2>
          <p className="text-sm text-gray-600">{t('misc.reports.subtitle')}</p>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-900">$124,590</div>
                <div className="text-sm text-gray-600">{t('misc.reports.totalRevenue')}</div>
                <div className="text-xs text-green-600 mt-1">{t('misc.reports.revenueChange')}</div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-900">47</div>
                <div className="text-sm text-gray-600">{t('misc.reports.activeOrders')}</div>
                <div className="text-xs text-blue-600 mt-1">{t('misc.reports.pendingFulfillment')}</div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-900">234</div>
                <div className="text-sm text-gray-600">{t('misc.reports.totalCustomers')}</div>
                <div className="text-xs text-green-600 mt-1">{t('misc.reports.newThisWeek')}</div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-900">12</div>
                <div className="text-sm text-gray-600">{t('misc.reports.overdueInvoices')}</div>
                <div className="text-xs text-red-600 mt-1">{t('misc.reports.totalDue')}</div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Report Categories */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {reportCards.map((report, index) => (
            <Card key={index} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-4">
                <div className="flex items-center space-x-3 rtl:space-x-reverse">
                  <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${report.color}`}>
                    <report.icon className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">{t(report.titleKey)}</h3>
                    <p className="text-sm text-gray-600">{t(report.descriptionKey)}</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex space-x-2 rtl:space-x-reverse">
                  <Button variant="outline" className="flex-1">
                    {t('misc.reports.viewReport')}
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
              <h3 className="text-lg font-semibold text-gray-900">{t('misc.reports.revenueTrend')}</h3>
            </CardHeader>
            <CardContent>
              <div className="h-64 flex items-center justify-center bg-gray-50 rounded-lg">
                <div className="text-center">
                  <div className="text-gray-400 text-4xl mb-2">📈</div>
                  <p className="text-gray-500">{t('misc.reports.revenueChart')}</p>
                  <p className="text-xs text-gray-400">{t('misc.reports.chartPlaceholder')}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h3 className="text-lg font-semibold text-gray-900">{t('misc.reports.customerGrowth')}</h3>
            </CardHeader>
            <CardContent>
              <div className="h-64 flex items-center justify-center bg-gray-50 rounded-lg">
                <div className="text-center">
                  <div className="text-gray-400 text-4xl mb-2">📊</div>
                  <p className="text-gray-500">{t('misc.reports.customerGrowthChart')}</p>
                  <p className="text-xs text-gray-400">{t('misc.reports.chartPlaceholder')}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
