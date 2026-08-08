import { LayoutDashboard, BarChart3, TrendingUp, Receipt, type LucideIcon } from "lucide-react";

export interface DashboardEntry {
  /** shared id — matches permissions.py DASHBOARD_CATALOG and the app registry */
  id: string;
  href: string;
  icon: LucideIcon;
  titleKey: string;
  descKey: string;
}

/**
 * Dashboards actually implemented in the web client, in catalog order.
 *
 * The backend DASHBOARD_CATALOG lists six ids; these are the two that have a screen
 * today (business-overview is the existing overview at "/"). The hub renders the
 * INTERSECTION of this list with the role's assignment, so a role granted an id we
 * have not built yet simply shows nothing for it rather than a dead link — and a new
 * dashboard becomes visible the moment its entry is added here.
 */
export const IMPLEMENTED_DASHBOARDS: DashboardEntry[] = [
  {
    id: "business-overview",
    href: "/",
    icon: LayoutDashboard,
    titleKey: "dashboards.businessOverview",
    descKey: "dashboards.businessOverviewDesc",
  },
  {
    id: "profitability",
    href: "/dashboards/profitability",
    icon: BarChart3,
    titleKey: "dashboards.profitability",
    descKey: "dashboards.profitabilityDesc",
  },
  {
    id: "revenue-over-time",
    href: "/dashboards/revenue-over-time",
    icon: TrendingUp,
    titleKey: "dashboards.revenueOverTime",
    descKey: "dashboards.revenueOverTimeDesc",
  },
  {
    id: "spend",
    href: "/dashboards/spend",
    icon: Receipt,
    titleKey: "dashboards.spend",
    descKey: "dashboards.spendDesc",
  },
];

/**
 * Which dashboards to show a user.
 *
 * `null`/absent assignment means unrestricted — admins and the platform owner carry
 * no dashboard list and must see everything, the same null-means-allow rule the
 * module and endpoint gates use. A list means exactly those ids.
 */
export function visibleDashboards(
  assigned: string[] | null | undefined,
): DashboardEntry[] {
  if (!assigned) return IMPLEMENTED_DASHBOARDS;
  const set = new Set(assigned);
  return IMPLEMENTED_DASHBOARDS.filter((d) => set.has(d.id));
}
