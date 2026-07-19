import { useQuery } from "@tanstack/react-query";
import { Checkbox } from "@/components/ui/checkbox";
import { useLanguage } from "@/contexts/LanguageContext";
import { apiRequest } from "@/lib/queryClient";
import type { UserPermissions } from "@/lib/types";

interface PermissionCatalog {
  modules: string[];
  resources: string[];
  actions: string[];
}

interface PermissionsEditorProps {
  value: UserPermissions | null;
  onChange: (value: UserPermissions) => void;
}

// module id -> existing nav.* translation key (module id = href minus '/')
const MODULE_NAV_KEYS: Record<string, string> = {
  "dashboard": "nav.dashboard",
  "customers": "nav.customers",
  "vendors": "nav.vendors",
  "warehouses": "nav.warehouses",
  "employees": "nav.employees",
  "users": "nav.users",
  "vehicles": "nav.vehicles",
  "trips": "nav.trips",
  "financial-accounts": "nav.financialAccounts",
  "materials": "nav.materials",
  "pricing": "nav.pricing",
  "fixed-assets": "nav.fixedAssets",
  "inventory": "nav.inventory",
  "inventory-events": "nav.inventoryEvents",
  "service-areas": "nav.serviceAreas",
  "purchase-orders": "nav.purchaseOrders",
  "customer-orders": "nav.customerOrders",
  "payments": "nav.payments",
  "payouts": "nav.payouts",
  "expenses": "nav.expenses",
  "transactions": "nav.transactions",
  "credit-note-items": "nav.creditNoteItems",
  "debit-note-items": "nav.debitNoteItems",
  "processes": "nav.processes",
  "workflows": "nav.workflows",
  "workflow-execution": "nav.workflowExecution",
  "live-map": "nav.liveMap",
  "location-tracking": "nav.locationTracking",
};

const ACTION_LABEL_KEYS: Record<string, string> = {
  create: "users.permCreate",
  read: "users.permRead",
  update: "users.permUpdate",
  delete: "users.permDelete",
};

export function PermissionsEditor({ value, onChange }: PermissionsEditorProps) {
  const { t } = useLanguage();

  const { data: catalog, isLoading } = useQuery<PermissionCatalog>({
    queryKey: ["/auth/permission-catalog"],
    queryFn: async () => await apiRequest("/auth/permission-catalog"),
  });

  const current: UserPermissions = value ?? { modules: [], endpoints: {} };
  const modules = catalog?.modules ?? [];
  const resources = catalog?.resources ?? [];
  const actions = catalog?.actions ?? [];

  const moduleLabel = (id: string) => {
    const navKey = MODULE_NAV_KEYS[id];
    return navKey ? t(navKey) : id;
  };

  const resourceLabel = (resource: string) => {
    const key = `users.res_${resource}`;
    const label = t(key);
    return label === key ? resource : label;
  };

  const actionLabel = (action: string) => {
    const key = ACTION_LABEL_KEYS[action];
    return key ? t(key) : action;
  };

  // ----- module toggles -----

  const toggleModule = (id: string, checked: boolean) => {
    const next = checked
      ? Array.from(new Set([...current.modules, id]))
      : current.modules.filter((m) => m !== id);
    onChange({ ...current, modules: next });
  };

  const allModulesChecked =
    modules.length > 0 && modules.every((m) => current.modules.includes(m));

  const toggleAllModules = (checked: boolean) => {
    onChange({ ...current, modules: checked ? [...modules] : [] });
  };

  // ----- endpoint toggles -----

  const hasAction = (resource: string, action: string) =>
    (current.endpoints[resource] ?? []).includes(action);

  const setEndpoints = (endpoints: Record<string, string[]>) => {
    onChange({ ...current, endpoints });
  };

  const toggleEndpoint = (resource: string, action: string, checked: boolean) => {
    const existing = current.endpoints[resource] ?? [];
    const nextActions = checked
      ? Array.from(new Set([...existing, action]))
      : existing.filter((a) => a !== action);
    const endpoints = { ...current.endpoints };
    if (nextActions.length > 0) {
      endpoints[resource] = nextActions;
    } else {
      delete endpoints[resource];
    }
    setEndpoints(endpoints);
  };

  const rowChecked = (resource: string) =>
    actions.length > 0 && actions.every((a) => hasAction(resource, a));

  const toggleRow = (resource: string, checked: boolean) => {
    const endpoints = { ...current.endpoints };
    if (checked) {
      endpoints[resource] = [...actions];
    } else {
      delete endpoints[resource];
    }
    setEndpoints(endpoints);
  };

  const columnChecked = (action: string) =>
    resources.length > 0 && resources.every((r) => hasAction(r, action));

  const toggleColumn = (action: string, checked: boolean) => {
    const endpoints = { ...current.endpoints };
    for (const resource of resources) {
      const existing = endpoints[resource] ?? [];
      const nextActions = checked
        ? Array.from(new Set([...existing, action]))
        : existing.filter((a) => a !== action);
      if (nextActions.length > 0) {
        endpoints[resource] = nextActions;
      } else {
        delete endpoints[resource];
      }
    }
    setEndpoints(endpoints);
  };

  const allEndpointsChecked =
    resources.length > 0 && resources.every((r) => rowChecked(r));

  const toggleAllEndpoints = (checked: boolean) => {
    if (checked) {
      const endpoints: Record<string, string[]> = {};
      for (const resource of resources) {
        endpoints[resource] = [...actions];
      }
      setEndpoints(endpoints);
    } else {
      setEndpoints({});
    }
  };

  if (isLoading) {
    return (
      <p className="text-sm text-gray-500 py-2">{t("users.permLoadingCatalog")}</p>
    );
  }

  if (!catalog) return null;

  return (
    <div className="space-y-4">
      {/* Section 1: menu modules */}
      <div className="rounded-lg border">
        <div className="flex items-center justify-between px-3 py-2 border-b bg-gray-50">
          <span className="text-sm font-medium">{t("users.permMenuModules")}</span>
          <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
            <Checkbox
              checked={allModulesChecked}
              onCheckedChange={(c) => toggleAllModules(c === true)}
              data-testid="perm-modules-all"
            />
            {t("users.permSelectAll")}
          </label>
        </div>
        <div className="max-h-48 overflow-y-auto p-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-2">
            {modules.map((id) => (
              <label
                key={id}
                className="flex items-center gap-2 text-sm text-start cursor-pointer"
              >
                <Checkbox
                  checked={current.modules.includes(id)}
                  onCheckedChange={(c) => toggleModule(id, c === true)}
                  data-testid={`perm-module-${id}`}
                />
                <span className="truncate">{moduleLabel(id)}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* Section 2: endpoint permissions */}
      <div className="rounded-lg border">
        <div className="flex items-center justify-between px-3 py-2 border-b bg-gray-50">
          <span className="text-sm font-medium">{t("users.permEndpoints")}</span>
          <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
            <Checkbox
              checked={allEndpointsChecked}
              onCheckedChange={(c) => toggleAllEndpoints(c === true)}
              data-testid="perm-endpoints-all"
            />
            {t("users.permSelectAll")}
          </label>
        </div>
        <div className="max-h-64 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-50 z-10">
              <tr className="border-b">
                <th className="text-start font-medium ps-3 pe-2 py-2">
                  {t("users.permResource")}
                </th>
                {actions.map((action) => (
                  <th key={action} className="font-medium px-2 py-2">
                    <div className="flex flex-col items-center gap-1">
                      <span className="text-xs">{actionLabel(action)}</span>
                      <Checkbox
                        checked={columnChecked(action)}
                        onCheckedChange={(c) => toggleColumn(action, c === true)}
                        data-testid={`perm-col-${action}`}
                      />
                    </div>
                  </th>
                ))}
                <th className="font-medium px-2 py-2">
                  <span className="text-xs">{t("users.permAll")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {resources.map((resource) => (
                <tr key={resource} className="border-b last:border-b-0 hover:bg-gray-50">
                  <td className="text-start ps-3 pe-2 py-1.5">
                    {resourceLabel(resource)}
                  </td>
                  {actions.map((action) => (
                    <td key={action} className="text-center px-2 py-1.5">
                      <Checkbox
                        checked={hasAction(resource, action)}
                        onCheckedChange={(c) => toggleEndpoint(resource, action, c === true)}
                        data-testid={`perm-res-${resource}-${action}`}
                      />
                    </td>
                  ))}
                  <td className="text-center px-2 py-1.5">
                    <Checkbox
                      checked={rowChecked(resource)}
                      onCheckedChange={(c) => toggleRow(resource, c === true)}
                      data-testid={`perm-res-${resource}-all`}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
