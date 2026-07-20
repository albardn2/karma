import { AppLayout } from "@/components/layout/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLanguage } from "@/contexts/LanguageContext";
import { AccountsPanel } from "@/pages/AccountsAdmin";

// Platform-owner console shell: one page, tabbed sections. "Accounts" is the
// first tab; future superuser tools land here as additional tabs.
export default function SuperAdmin() {
  const { t } = useLanguage();

  return (
    <AppLayout>
      <div className="flex-1 overflow-auto p-4 lg:p-6">
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
            </TabsList>
            <TabsContent value="accounts" className="mt-4">
              <AccountsPanel />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </AppLayout>
  );
}
