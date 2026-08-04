import React from 'react';
import { ModuleGuard } from '@/components/ModuleGuard';
import CreateOrderScreen from '../distribution/create-order';

/**
 * Standalone order creation, from the list's + button or a customer's detail screen.
 *
 * This is the SAME component as the trip-stop checkout — with no tripStopUuid param it
 * renders a customer picker and a notes field, and defaults fulfil/pay off. One
 * implementation of the money path rather than a second that drifts; ModuleForm cannot
 * express N line items, which is why that screen is hand-rolled in the first place.
 *
 * The distribution flow reaches the shared screen through its own guarded navigation;
 * this route is reachable from the menu and by deep link, so it carries the module gate
 * itself.
 */
export default function CustomerOrderCreateScreen() {
  return (
    <ModuleGuard module="customer-orders">
      <CreateOrderScreen />
    </ModuleGuard>
  );
}
