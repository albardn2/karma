// App-wide UI strings, merged from per-domain modules in ./translations/.
// Keys are grouped by domain with a dot prefix (e.g. "nav.customers",
// "trips.analytics"). Arabic is Modern Standard Arabic, terminology kept
// consistent with the mobile app (expo_app/i18n/translations.ts).
// Placeholders use {name} syntax and are substituted by t(key, vars).

import * as common from './translations/common';
import * as nav from './translations/nav';
import * as dashboard from './translations/dashboard';
import * as customers from './translations/customers';
import * as customerOrders from './translations/customerOrders';
import * as vendors from './translations/vendors';
import * as warehouses from './translations/warehouses';
import * as employees from './translations/employees';
import * as users from './translations/users';
import * as vehicles from './translations/vehicles';
import * as trips from './translations/trips';
import * as financial from './translations/financial';
import * as materials from './translations/materials';
import * as pricing from './translations/pricing';
import * as fixedAssets from './translations/fixedAssets';
import * as inventory from './translations/inventory';
import * as inventoryEvents from './translations/inventoryEvents';
import * as serviceAreas from './translations/serviceAreas';
import * as purchaseOrders from './translations/purchaseOrders';
import * as payments from './translations/payments';
import * as payouts from './translations/payouts';
import * as expenses from './translations/expenses';
import * as notes from './translations/notes';
import * as processes from './translations/processes';
import * as workflows from './translations/workflows';
import * as location from './translations/location';
import * as misc from './translations/misc';

export type Lang = 'en' | 'ar';

export const LANGUAGE_LABELS: Record<Lang, string> = {
  en: 'English',
  ar: 'العربية',
};

const modules = [
  common,
  nav,
  dashboard,
  customers,
  customerOrders,
  vendors,
  warehouses,
  employees,
  users,
  vehicles,
  trips,
  financial,
  materials,
  pricing,
  fixedAssets,
  inventory,
  inventoryEvents,
  serviceAreas,
  purchaseOrders,
  payments,
  payouts,
  expenses,
  notes,
  processes,
  workflows,
  location,
  misc,
];

export const translations: Record<Lang, Record<string, string>> = {
  en: Object.assign({}, ...modules.map((m) => m.en)),
  ar: Object.assign({}, ...modules.map((m) => m.ar)),
};
