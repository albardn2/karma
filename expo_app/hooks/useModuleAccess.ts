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
