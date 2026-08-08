import { Link } from "wouter";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { visibleDashboards } from "@/lib/dashboards";

/**
 * The dashboards hub: the pre-defined set of reports assigned to this user's role.
 *
 * Role assignment is resolved server-side and arrives on /auth/me as `dashboards`
 * (a list of ids, or null for admins who see all). We intersect that with the
 * dashboards the client actually implements, so this is the single place a user
 * discovers what they can open — the app has the mirror of it. Adding a dashboard is
 * one entry in lib/dashboards.ts plus its route.
 */
export default function Dashboards() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const entries = visibleDashboards(user?.dashboards);

  return (
    <AppLayout>
      <div className="flex-1 overflow-auto p-4 lg:p-6 space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{t("dashboards.hubTitle")}</h2>
          <p className="text-sm text-gray-600">{t("dashboards.hubSubtitle")}</p>
        </div>

        {entries.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-sm text-gray-500">
              {t("dashboards.none")}
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {entries.map((d) => (
              <Link key={d.id} href={d.href} data-testid={`dashboard-card-${d.id}`}>
                <Card className="h-full cursor-pointer transition-colors hover:border-gray-300 hover:shadow-sm">
                  <CardContent className="pt-6 flex items-start gap-4">
                    <div className="w-10 h-10 rounded-lg brand-gradient flex items-center justify-center flex-shrink-0">
                      <d.icon className="w-5 h-5 text-white" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900">{t(d.titleKey)}</p>
                      <p className="text-sm text-gray-500 mt-0.5">{t(d.descKey)}</p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
