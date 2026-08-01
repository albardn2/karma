import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PermissionsEditor } from "@/components/users/PermissionsEditor";
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient as qc } from "@/lib/queryClient";
import type { UserPermissions } from "@/lib/types";

interface RolePreset {
  role: string;
  permissions: UserPermissions;
  baseline: UserPermissions;
  is_overridden: boolean;
  /** users who inherit this role's defaults right now (no per-user override) */
  following: number;
}

const KEY = ["/super-admin/settings/role-presets"];

/**
 * Editable per-role default permissions, platform-wide.
 *
 * Roles have always carried a full fine-grained default set, but it was generated
 * from the route decorators into a JSON file in the repo and read once at import,
 * so changing what a role means required a commit, a deploy and a restart. This is
 * that same set, editable at runtime.
 *
 * Two things this screen deliberately shows, because editing a role is not like
 * editing one user:
 *
 *   - HOW MANY USERS FOLLOW IT. That is the blast radius. Users with their own
 *     checklist are excluded from the count, because a role edit does not touch
 *     them — counting them would overstate the impact.
 *   - WHETHER IT DIFFERS FROM THE GENERATED BASELINE, with a way back. The
 *     baseline is derived from what the routes actually require, so it is the
 *     known-good floor to return to after a bad edit.
 */
export function RolePresetsAdmin() {
  const { t, te } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<UserPermissions>({ modules: [], endpoints: {} });

  const { data, isLoading, error } = useQuery<{ roles: RolePreset[] }>({
    queryKey: KEY,
    queryFn: async () => await apiRequest("/super-admin/settings/role-presets"),
  });

  const roles = data?.roles ?? [];

  /**
   * Open a role's editor, seeding the draft from THAT role's saved permissions.
   *
   * Seeded here, at the moment of opening, rather than from an effect watching the
   * open role: the draft belongs to one specific row, so deriving it where that row
   * is in hand leaves no question about which role a pending edit applies to. The
   * editor is also keyed by role below, so switching roles remounts it rather than
   * reusing a tree that was rendered for a different permission set.
   */
  const toggleEditor = (r: RolePreset) => {
    if (editing === r.role) {
      setEditing(null);
      return;
    }
    setDraft(r.permissions);
    setEditing(r.role);
  };

  const afterWrite = (label: string) => {
    queryClient.invalidateQueries({ queryKey: KEY });
    // The role checklist the USER editor prefills from comes from the permission
    // catalog, which now serves resolved presets — so it is stale the moment a
    // role changes here, and a stale catalog makes "unchanged from preset" compare
    // against the wrong set.
    qc.invalidateQueries({ queryKey: ["/auth/permission-catalog"] });
    setEditing(null);
    toast({ title: t("common.success"), description: label });
  };

  const saveMutation = useMutation({
    mutationFn: async (role: string) =>
      await apiRequest(`/super-admin/settings/role-presets/${role}`, {
        method: "PUT",
        body: { permissions: draft },
      }),
    onSuccess: () => afterWrite(t("rolePresets.saved")),
    onError: (e: any) =>
      toast({
        title: t("common.error"),
        description: e?.message ?? t("rolePresets.saveFailed"),
        variant: "destructive",
      }),
  });

  const resetMutation = useMutation({
    mutationFn: async (role: string) =>
      await apiRequest(`/super-admin/settings/role-presets/${role}`, { method: "DELETE" }),
    onSuccess: () => afterWrite(t("rolePresets.reset")),
    onError: (e: any) =>
      toast({
        title: t("common.error"),
        description: e?.message ?? t("rolePresets.saveFailed"),
        variant: "destructive",
      }),
  });

  if (isLoading) return <p className="text-sm text-gray-500">{t("common.loading")}</p>;
  if (error) return <p className="text-sm text-red-600">{t("rolePresets.loadFailed")}</p>;

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600 dark:text-gray-300">
        {t("rolePresets.intro")}
      </p>

      {roles.map((r) => (
        <Card key={r.role} data-testid={`role-preset-${r.role}`}>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="text-base flex flex-wrap items-center gap-2">
                {/* same enum-label helper the user pages use, so a role reads
                    "Warehouse Keeper" / "أمين مستودع" rather than raw snake_case */}
                {te(r.role)}
                {r.is_overridden ? (
                  <Badge
                    variant="outline"
                    className="border-amber-300 bg-amber-50 text-amber-700"
                    data-testid={`role-overridden-${r.role}`}
                  >
                    {t("rolePresets.customised")}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-gray-500">
                    {t("rolePresets.default")}
                  </Badge>
                )}
                {/* the number that matters before widening or narrowing a role */}
                <span className="text-xs font-normal text-gray-500">
                  {t("rolePresets.following", { count: r.following })}
                </span>
              </CardTitle>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant={editing === r.role ? "secondary" : "outline"}
                  onClick={() => toggleEditor(r)}
                  data-testid={`role-edit-${r.role}`}
                >
                  {editing === r.role ? t("common.cancel") : t("common.edit")}
                </Button>
                {r.is_overridden && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => resetMutation.mutate(r.role)}
                    disabled={resetMutation.isPending}
                    data-testid={`role-reset-${r.role}`}
                  >
                    {t("rolePresets.resetToDefault")}
                  </Button>
                )}
              </div>
            </div>
            <p className="text-xs text-gray-500">
              {t("rolePresets.summary", {
                modules: r.permissions.modules.length,
                resources: Object.keys(r.permissions.endpoints ?? {}).length,
              })}
            </p>
          </CardHeader>

          {editing === r.role && (
            <CardContent className="space-y-4">
              <PermissionsEditor key={r.role} value={draft} onChange={setDraft} />
              <div className="flex items-center gap-2">
                <Button
                  onClick={() => saveMutation.mutate(r.role)}
                  disabled={saveMutation.isPending}
                  data-testid={`role-save-${r.role}`}
                >
                  {t("common.save")}
                </Button>
                <Button variant="ghost" onClick={() => setDraft(r.baseline)}>
                  {t("rolePresets.loadBaseline")}
                </Button>
              </div>
              {r.following > 0 && (
                <p className="text-xs text-amber-700" data-testid={`role-warn-${r.role}`}>
                  {t("rolePresets.affectsWarning", { count: r.following })}
                </p>
              )}
            </CardContent>
          )}
        </Card>
      ))}
    </div>
  );
}
