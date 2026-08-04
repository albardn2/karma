import { useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Which menu modules this user may actually use.
 *
 * ONE definition, deliberately. The menu grid and the route guard both need this
 * answer, and if they compute it separately they will eventually disagree — the
 * failure mode being a tile that is hidden but whose screen still opens, or the
 * reverse. Everything that gates on a module reads it from here.
 *
 * `null` means unrestricted: admins and the platform owner carry no permissions
 * object at all, and an account with no feature cap is not capped. Callers must
 * treat null as "allow", not as "deny everything" — reading it the other way locks
 * out precisely the people with the most access.
 */
export function useGrantedModules(): string[] | null {
  const { user } = useAuth();

  return useMemo(() => {
    const scopes: string[] = (user?.permission_scope || '')
      .split(',')
      .map((s: string) => s.trim())
      .filter(Boolean);
    const isAdmin = scopes.includes('admin') || scopes.includes('superuser');

    const userModules: string[] | null =
      !isAdmin && Array.isArray(user?.effective_permissions?.modules)
        ? user.effective_permissions.modules
        : null;
    const accountModules: string[] | null = Array.isArray(user?.account_permissions?.modules)
      ? user.account_permissions.modules
      : null;

    // the user's own grants intersected with the account's feature cap
    return userModules && accountModules
      ? userModules.filter((m: string) => accountModules.includes(m))
      : userModules ?? accountModules;
  }, [user?.permission_scope, user?.effective_permissions, user?.account_permissions]);
}

/** Whether this user may use a given menu module. */
export function useHasModule(module: string): boolean {
  const granted = useGrantedModules();
  return granted ? granted.includes(module) : true;
}

/**
 * Whether this user may perform one verb on one API resource.
 *
 * A MODULE GRANT IS NOT AN ENDPOINT GRANT, and conflating the two is the bug this
 * exists to fix. A driver holds the `purchase-orders` module and reads the list
 * happily, but has no `purchase_order_item` key at all — so a Receive button gated on
 * the module renders for them and answers 403. The server checks `endpoints`; only
 * `endpoints` predicts what it will do.
 *
 * Nor is a role string a substitute. An accountant carries the ACCOUNTANT scope named
 * in the purchase-order decorators and is nonetheless 403 on every one of them,
 * because the per-user ACL is the gate and the decorator is not.
 *
 * The two null cases are asymmetric, deliberately:
 *   - no `effective_permissions` at all → allow. Admins and the platform owner carry
 *     none, and reading that as "deny" locks out exactly the people with full access.
 *   - permissions present but this resource absent → deny. That is a grant that was
 *     never made, not an absent restriction.
 */
export function useHasEndpoint(
  resource: string,
  verb: 'create' | 'read' | 'update' | 'delete',
): boolean {
  const { user } = useAuth();
  const endpoints = user?.effective_permissions?.endpoints;
  if (!endpoints) return true;
  const verbs = endpoints[resource];
  return Array.isArray(verbs) && verbs.includes(verb);
}
