import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { visibleDashboards } from "@/lib/dashboards";
import Dashboard from "@/pages/Dashboard";
import ProfitabilityDashboard from "@/pages/ProfitabilityDashboard";
import RevenueOverTimeDashboard from "@/pages/RevenueOverTimeDashboard";
import CustomerOrdersDashboard from "@/pages/CustomerOrdersDashboard";
import NewCustomersDashboard from "@/pages/NewCustomersDashboard";
import MaterialsSoldDashboard from "@/pages/MaterialsSoldDashboard";
import TripStopsDashboard from "@/pages/TripStopsDashboard";
import MyTripStopsDashboard from "@/pages/MyTripStopsDashboard";
import SpendDashboard from "@/pages/SpendDashboard";

// dashboard id -> its embedded panel. The personal trio reuses the global
// screens with `mine`; every panel brings its own title (the dashboard's name)
// and controls, so the feed needs no extra headers.
const PANELS: Record<string, () => JSX.Element> = {
  "business-overview": () => <Dashboard embedded />,
  profitability: () => <ProfitabilityDashboard embedded />,
  "revenue-over-time": () => <RevenueOverTimeDashboard embedded />,
  "customer-orders": () => <CustomerOrdersDashboard embedded />,
  "new-customers": () => <NewCustomersDashboard embedded />,
  "materials-sold": () => <MaterialsSoldDashboard embedded />,
  "trip-stops": () => <TripStopsDashboard embedded />,
  spend: () => <SpendDashboard embedded />,
  "my-revenue": () => <RevenueOverTimeDashboard mine embedded />,
  "my-materials-sold": () => <MaterialsSoldDashboard mine embedded />,
  "my-new-customers": () => <NewCustomersDashboard mine embedded />,
  "my-trip-stops": () => <MyTripStopsDashboard embedded />,
};

/**
 * Home: every dashboard the signed-in user's role allows, stacked in catalog
 * order, each titled by its dashboard name.
 *
 * The list comes from /auth/me `dashboards` (null = all, for admins) — the same
 * role assignment the hub and the app read — intersected with the dashboards
 * this client implements, so a role sees the same set everywhere and an id
 * without a screen never renders a hole. A role with nothing assigned gets an
 * honest empty card rather than a blank page.
 */
export default function Home() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const entries = visibleDashboards(user?.dashboards);

  return (
    <AppLayout>
      <div className="flex-1 overflow-auto p-4 lg:p-6">
        {entries.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-sm text-gray-500">
              {t("dashboards.none")}
            </CardContent>
          </Card>
        ) : (
          <div className="divide-y divide-gray-200">
            {entries.map((d) => (
              <div key={d.id} className="py-8 first:pt-0">
                {PANELS[d.id]?.() ?? null}
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
