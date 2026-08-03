import React, { useState } from 'react';
import { Alert, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ThemedText } from '@/components/ThemedText';
import { ModuleDetailScreen, DetailAction, DetailRow } from '@/components/ModuleDetailScreen';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { apiCall, isOk } from '@/utils/api';
import { formatNumericDate } from '@/utils/date';
import { LANGUAGE_LABELS } from '@/i18n/translations';

interface Permissions {
  modules?: string[] | null;
  endpoints?: Record<string, string[]> | null;
}

interface User {
  uuid: string;
  username: string;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone_number?: string | null;
  permission_scope?: string | null;
  language?: string | null;
  is_active?: boolean | null;
  track_location?: boolean | null;
  location_ping_seconds?: number | null;
  /** the role preset merged with any per-user override; null means unrestricted */
  effective_permissions?: Permissions | null;
  created_at: string;
}

/**
 * One login, with the two levers that are safe to pull from a phone.
 *
 * WHAT THIS SCREEN WILL NOT DO, and why each one is a refusal rather than an omission:
 *
 * NO PASSWORD FIELD, ever. There is no dedicated endpoint and no current-password
 * challenge — the same PUT that edits a phone number silently rotates a working
 * credential. Decisively for this app: a 422 response body echoes the submitted input
 * back, and ModuleForm displays the server's message verbatim in an Alert. A password
 * field would therefore print the plaintext password on screen at the first validation
 * error. That is not a risk worth a convenience.
 *
 * NO ROLE CHANGE. It is the highest-blast-radius single tap in the API and it is
 * unguarded in both directions: an admin can demote itself and then cannot undo it,
 * because the restoring request needs the permission it just gave away. Setting the
 * scope to null returns 200 and bricks the account outright — login 500s afterwards, and
 * so does every token already issued. Roles are changed at a desk.
 *
 * NO DELETE. It is soft but terminal: there is no restore route anywhere, and the
 * username is burned permanently. Deactivation has the same operational effect — the
 * person cannot sign in, and their live session ends on their next request — and any
 * admin can undo it. Shipping delete would put the app's highest-regret tap a
 * thumb-width from a reversible one that does the same job.
 *
 * THE PERMISSION CHECKLIST IS A SUMMARY, NOT AN EDITOR. The web matrix is 29 modules
 * plus 38 resources by 4 actions, and one of its aggregate toggles flips 152 grants at
 * once. Two behaviours make an unattended phone edit unrecoverable: an empty object
 * silently reverts the user to their role preset rather than clearing them, and a partial
 * one stores a shape with no endpoints key at all, so the menu offers modules whose every
 * request then fails. Neither state is visible on the screen that caused it. The sibling
 * role-presets screen refused the same matrix for the same reason.
 *
 * Contact details and language are on the web too: nothing in this app reads a user's
 * email or phone, while `email` is globally unique across every tenant and the update DTO
 * types it as a plain string where registration uses a validated address — so the phone
 * would be the one surface that can write a malformed value into a unique column.
 */
export default function UserDetailScreen() {
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  const router = useRouter();
  const { t, tef } = useLanguage();
  const { user: me } = useAuth();
  const [reloadKey, setReloadKey] = useState(0);

  const roleLabel = (scope?: string | null) =>
    String(scope ?? '')
      .split(',')
      .map((s) => tef(s.trim()))
      .filter(Boolean)
      .join(' · ') || '—';

  /** One field, one PUT — the read model cannot be echoed back, so nothing else is sent. */
  const setActive = async (value: boolean, label: string) => {
    const res = await apiCall(`/auth/user/${uuid}`, {
      method: 'PUT',
      // a real JSON boolean: an explicit null on this field means "leave unchanged"
      body: JSON.stringify({ is_active: value }),
    });
    if (isOk(res.status)) setReloadKey((k) => k + 1);
    else Alert.alert(label, String(res.error ?? '').slice(0, 300) || t('form.tryAgain'));
  };

  const rows = (u: User): DetailRow[] => [
    [t('users.username'), `@${u.username}`],
    [t('users.role'), roleLabel(u.permission_scope)],
    [t('users.state'), u.is_active === false ? t('users.deactivated') : t('users.active')],
    [t('users.phone'), u.phone_number || '—'],
    [t('users.email'), u.email || '—'],
    [
      t('users.language'),
      // the update DTO accepts any string here, so this cannot assume the enum
      (u.language && LANGUAGE_LABELS[u.language as 'en' | 'ar']) || u.language || '—',
    ],
    [
      t('users.tracking'),
      u.track_location
        ? t('users.trackingOn', { n: u.location_ping_seconds ?? 15 })
        : t('users.trackingOff'),
    ],
    [t('users.created'), u.created_at ? formatNumericDate(new Date(u.created_at)) : '—'],
  ];

  const actions: DetailAction<User>[] = [
    {
      label: t('users.editTracking'),
      testID: 'users-tracking',
      onPress: (u) =>
        router.push({
          pathname: '/users/tracking',
          params: {
            uuid: u.uuid,
            track_location: String(!!u.track_location),
            location_ping_seconds: String(u.location_ping_seconds ?? 15),
          },
        }),
    },
    {
      label: t('users.deactivate'),
      destructive: true,
      // the default confirm says the change cannot be undone; this one can, and
      // overstating it would teach people to ignore the dialog
      confirmText: t('users.deactivateConfirm'),
      testID: 'users-deactivate',
      visible: (u) => u.is_active !== false && u.uuid !== me?.uuid,
      onPress: () => setActive(false, t('users.deactivate')),
    },
    {
      label: t('users.reactivate'),
      testID: 'users-reactivate',
      visible: (u) => u.is_active === false && u.uuid !== me?.uuid,
      onPress: () => setActive(true, t('users.reactivate')),
    },
  ];

  return (
    <ModuleDetailScreen<User>
      requireAdmin
      title={t('menu.users')}
      endpoint={`/auth/user/${uuid}`}
      reloadKey={reloadKey}
      heading={(u) => `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() || u.username}
      rows={rows}
      sections={[
        {
          title: t('users.permissions'),
          render: (u) => {
            const ep = u.effective_permissions;
            // null means unrestricted — every admin and the platform owner read as null
            if (ep == null) {
              return <ThemedText style={styles.perm}>{t('users.fullAccess')}</ThemedText>;
            }
            const modules = Array.isArray(ep.modules) ? ep.modules.length : 0;
            // `?? {}` is load-bearing: a partially-written override stores an object with
            // no endpoints key at all, and it comes back in that same truncated shape
            const grants = Object.values(ep.endpoints ?? {}).reduce(
              (n, a) => n + (Array.isArray(a) ? a.length : 0),
              0,
            );
            return (
              <>
                <ThemedText style={styles.perm}>
                  {t('roles.breadth', { modules, grants })}
                </ThemedText>
                <ThemedText style={styles.permNote}>{t('users.permissionsWeb')}</ThemedText>
              </>
            );
          },
        },
      ]}
      actions={actions}
      footer={(u) => (
        <>
          {u.uuid === me?.uuid && (
            <ThemedText style={styles.footer}>{t('users.selfNote')}</ThemedText>
          )}
          <ThemedText style={styles.footer}>{t('users.webOnly')}</ThemedText>
        </>
      )}
    />
  );
}

const styles = StyleSheet.create({
  perm: { fontSize: 14, fontWeight: '600', color: '#1f2937' },
  permNote: { fontSize: 12, opacity: 0.6, lineHeight: 18, marginTop: 4 },
  footer: { fontSize: 12, opacity: 0.6, lineHeight: 18, marginTop: 16 },
});
