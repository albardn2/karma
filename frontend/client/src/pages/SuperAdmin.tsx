import { AppLayout } from "@/components/layout/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { AccountsPanel } from "@/pages/AccountsAdmin";
import { LocationTrackingPanel } from "@/pages/LocationTrackingSettings";

// Platform-owner console shell: one page, tabbed sections. Superuser only —
// future superuser tools land here as additional tabs.
export default function SuperAdmin() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const isSuperuser = (
    (user as any)?.permissionScope ?? (user as any)?.permission_scope ?? ""
  ).includes("superuser");

  return (
    <AppLayout>
      <div className="flex-1 overflow-auto p-4 lg:p-6">
        {!isSuperuser ? (
          <div className="text-center py-12">
            <p className="text-gray-600">{t("common.accessDenied")}</p>
          </div>
        ) : (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{t("misc.superAdmin.title")}</h1>
              <p className="text-gray-600">{t("misc.superAdmin.subtitle")}</p>
            </div>

            <Tabs defaultValue="accounts">
              <TabsList>
                <TabsTrigger value="accounts" data-testid="superadmin-tab-accounts">
                  {t("nav.accounts")}
                </TabsTrigger>
                <TabsTrigger
                  value="location-tracking"
                  data-testid="superadmin-tab-location"
                >
                  {t("nav.locationTracking")}
                </TabsTrigger>
              </TabsList>
              <TabsContent value="accounts" className="mt-4">
                <AccountsPanel />
              </TabsContent>
              <TabsContent value="location-tracking" className="mt-4">
                <LocationTrackingPanel />
              </TabsContent>
            </Tabs>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
