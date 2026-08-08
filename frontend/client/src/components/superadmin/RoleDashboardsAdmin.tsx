import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface CatalogEntry {
  id: string;
  title_key: string;
  order: number;
}
interface RoleRow {
  dashboards: string[];
  baseline: string[];
  is_overridden: boolean;
  following_count: number;
}
interface Payload {
  catalog: CatalogEntry[];
  roles: Record<string, RoleRow>;
}

const KEY = ["/super-admin/settings/role-dashboards"];

const sameSet = (a: string[], b: string[]) =>
  a.length === b.length && a.every((x) => b.includes(x));

/**
 * Platform-wide assignment of which dashboards each role sees.
 *
 * One config for all tenants (per the design decision), not per-tenant. Each role is
 * a row of toggles over the shared catalog; admins and the platform owner are absent
 * because they see every dashboard by construction. Saving folds into the
 * perms-version fingerprint, so a following user's app and web both re-read their set
 * on the next request — the same immediate-effect path the role presets use.
 */
export function RoleDashboardsAdmin() {
  const { t, te } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  // per-role pending edits, keyed by role; absent means "no pending edit, use saved"
  const [drafts, setDrafts] = useState<Record<string, string[]>>({});

  const { data, isLoading, error } = useQuery<Payload>({
    queryKey: KEY,
    queryFn: async () => await apiRequest("/super-admin/settings/role-dashboards"),
  });

  const catalog = useMemo(
    () => [...(data?.catalog ?? [])].sort((a, b) => a.order - b.order),
    [data],
  );
  const roles = useMemo(() => Object.keys(data?.roles ?? {}).sort(), [data]);

  const afterWrite = (label: string, role: string) => {
    queryClient.invalidateQueries({ queryKey: KEY });
    setDrafts((d) => {
      const next = { ...d };
      delete next[role];
      return next;
    });
    toast({ title: t("common.success"), description: label });
  };

  const saveMutation = useMutation({
    mutationFn: async ({ role, dashboards }: { role: string; dashboards: string[] }) =>
      await apiRequest(`/super-admin/settings/role-dashboards/${role}`, {
        method: "PUT",
        body: { dashboards },
      }),
    onSuccess: (_r, v) => afterWrite(t("roleDashboards.saved"), v.role),
    onError: (e: any) =>
      toast({
        title: t("common.error"),
        description: e?.message ?? t("roleDashboards.saveFailed"),
        variant: "destructive",
      }),
  });

  const resetMutation = useMutation({
    mutationFn: async (role: string) =>
      await apiRequest(`/super-admin/settings/role-dashboards/${role}`, { method: "DELETE" }),
    onSuccess: (_r, role) => afterWrite(t("roleDashboards.reset"), role),
    onError: (e: any) =>
      toast({
        title: t("common.error"),
        description: e?.message ?? t("roleDashboards.saveFailed"),
        variant: "destructive",
      }),
  });

  if (isLoading) return <p className="text-sm text-gray-500">{t("common.loading")}</p>;
  if (error) return <p className="text-sm text-red-600">{t("roleDashboards.loadFailed")}</p>;

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600 dark:text-gray-300">{t("roleDashboards.intro")}</p>

      {roles.map((role) => {
        const row = data!.roles[role];
        const draft = drafts[role] ?? row.dashboards;
        const dirty = !sameSet(draft, row.dashboards);
        const toggle = (id: string) =>
          setDrafts((d) => {
            const cur = d[role] ?? row.dashboards;
            const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
            return { ...d, [role]: next };
          });

        return (
          <Card key={role} data-testid={`role-dashboards-${role}`}>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <CardTitle className="text-base flex flex-wrap items-center gap-2">
                  {te(role)}
                  {row.is_overridden ? (
                    <Badge
                      variant="outline"
                      className="border-amber-300 bg-amber-50 text-amber-700"
                      data-testid={`role-dashboards-overridden-${role}`}
                    >
                      {t("roleDashboards.customised")}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-gray-500">
                      {t("roleDashboards.default")}
                    </Badge>
                  )}
                  <span className="text-xs font-normal text-gray-500">
                    {t("roleDashboards.following", { count: row.following_count })}
                  </span>
                </CardTitle>
                <span className="text-xs text-gray-500">
                  {t("roleDashboards.assignedCount", {
                    count: draft.length,
                    total: catalog.length,
                  })}
                </span>
              </div>
            </CardHeader>

            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {catalog.map((c) => {
                  const on = draft.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      onClick={() => toggle(c.id)}
                      data-testid={`role-dashboards-${role}-${c.id}`}
                      aria-pressed={on}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                        on
                          ? "brand-gradient text-white border-transparent"
                          : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      {t(c.title_key)}
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  disabled={!dirty || saveMutation.isPending}
                  onClick={() => saveMutation.mutate({ role, dashboards: draft })}
                  data-testid={`role-dashboards-save-${role}`}
                >
                  {t("common.save")}
                </Button>
                {dirty && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setDrafts((d) => {
                        const next = { ...d };
                        delete next[role];
                        return next;
                      })
                    }
                  >
                    {t("common.cancel")}
                  </Button>
                )}
                {row.is_overridden && !dirty && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => resetMutation.mutate(role)}
                    disabled={resetMutation.isPending}
                    data-testid={`role-dashboards-reset-${role}`}
                  >
                    {t("roleDashboards.resetToDefault")}
                  </Button>
                )}
              </div>

              {dirty && row.following_count > 0 && (
                <p className="text-xs text-amber-700" data-testid={`role-dashboards-warn-${role}`}>
                  {t("roleDashboards.affectsWarning", { count: row.following_count })}
                </p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
