import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { WelcomeContent } from '@/components/WelcomeContent';
import { DashboardScreenImpl } from '@/app/dashboard';
import { ProfitabilityScreenImpl } from '@/app/dashboards/profitability';
import { RevenueOverTimeScreenImpl } from '@/app/dashboards/revenue-over-time';
import { CustomerOrdersScreenImpl } from '@/app/dashboards/customer-orders';
import { NewCustomersScreenImpl } from '@/app/dashboards/new-customers';
import { MaterialsSoldScreenImpl } from '@/app/dashboards/materials-sold';
import { TripStopsScreenImpl } from '@/app/dashboards/trip-stops';
import { MyTripStopsScreenImpl } from '@/app/dashboards/my-trip-stops';
import { SpendScreenImpl } from '@/app/dashboards/spend';

// dashboard id -> its embedded panel. The personal trio reuses the global
// screens with `mine`; every panel brings its own section title (the
// dashboard's name) and controls, mirroring the web Home feed exactly.
const PANELS: Record<string, () => React.ReactElement> = {
  'business-overview': () => <DashboardScreenImpl embedded />,
  profitability: () => <ProfitabilityScreenImpl embedded />,
  'revenue-over-time': () => <RevenueOverTimeScreenImpl embedded />,
  'customer-orders': () => <CustomerOrdersScreenImpl embedded />,
  'new-customers': () => <NewCustomersScreenImpl embedded />,
  'materials-sold': () => <MaterialsSoldScreenImpl embedded />,
  'trip-stops': () => <TripStopsScreenImpl embedded />,
  spend: () => <SpendScreenImpl embedded />,
  'my-revenue': () => <RevenueOverTimeScreenImpl mine embedded />,
  'my-materials-sold': () => <MaterialsSoldScreenImpl mine embedded />,
  'my-new-customers': () => <NewCustomersScreenImpl mine embedded />,
  'my-trip-stops': () => <MyTripStopsScreenImpl embedded />,
};

// implemented dashboards in catalog order — an assigned id without a screen
// simply doesn't appear, same rule as the hub
const ORDER = [
  'business-overview',
  'profitability',
  'revenue-over-time',
  'customer-orders',
  'new-customers',
  'materials-sold',
  'trip-stops',
  'my-revenue',
  'my-materials-sold',
  'my-new-customers',
  'my-trip-stops',
  'spend',
];

/**
 * The Home tab's content: every dashboard the signed-in user's role allows,
 * stacked in catalog order — the app twin of the web Home feed.
 *
 * The list is /auth/me `dashboards` (null = all, for admins) intersected with
 * the dashboards this client implements. A user with nothing assigned keeps
 * the old welcome screen rather than an empty feed.
 */
export function HomeDashboards() {
  const { user } = useAuth();
  const assigned: string[] | null | undefined = (user as any)?.dashboards;
  const ids = assigned ? ORDER.filter((id) => assigned.includes(id)) : ORDER;

  if (ids.length === 0) return <WelcomeContent />;

  return (
    <View style={styles.feed}>
      {ids.map((id) => (
        <View key={id} style={styles.section}>
          {PANELS[id]?.() ?? null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  feed: { paddingTop: 14 },
  section: {
    marginBottom: 22,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#d1d5db',
    paddingBottom: 22,
  },
});
