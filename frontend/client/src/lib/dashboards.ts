import {
  LayoutDashboard,
  BarChart3,
  TrendingUp,
  Receipt,
  ClipboardList,
  Package,
  UserPlus,
  MapPin,
  type LucideIcon,
} from "lucide-react";

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
    id: "customer-orders",
    href: "/dashboards/customer-orders",
    icon: ClipboardList,
    titleKey: "dashboards.customerOrders",
    descKey: "dashboards.customerOrdersDesc",
  },
  {
    id: "new-customers",
    href: "/dashboards/new-customers",
    icon: UserPlus,
    titleKey: "dashboards.newCustomers",
    descKey: "dashboards.newCustomersDesc",
  },
  {
    id: "materials-sold",
    href: "/dashboards/materials-sold",
    icon: Package,
    titleKey: "dashboards.materialsSold",
    descKey: "dashboards.materialsSoldDesc",
  },
  {
    id: "trip-stops",
    href: "/dashboards/trip-stops",
    icon: MapPin,
    titleKey: "dashboards.tripStops",
    descKey: "dashboards.tripStopsDesc",
  },
  // the personal set — the same charts filtered to the signed-in user's own
  // records, backed by self-scoped endpoints
  {
    id: "my-revenue",
    href: "/dashboards/my-revenue",
    icon: TrendingUp,
    titleKey: "dashboards.myRevenue",
    descKey: "dashboards.myRevenueDesc",
  },
  {
    id: "my-materials-sold",
    href: "/dashboards/my-materials-sold",
    icon: Package,
    titleKey: "dashboards.myMaterialsSold",
    descKey: "dashboards.myMaterialsSoldDesc",
  },
  {
    id: "my-new-customers",
    href: "/dashboards/my-new-customers",
    icon: UserPlus,
    titleKey: "dashboards.myNewCustomers",
    descKey: "dashboards.myNewCustomersDesc",
  },
  {
    id: "my-trip-stops",
    href: "/dashboards/my-trip-stops",
    icon: MapPin,
    titleKey: "dashboards.myTripStops",
    descKey: "dashboards.myTripStopsDesc",
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
