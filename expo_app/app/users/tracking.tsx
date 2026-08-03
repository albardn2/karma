import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ModuleForm, FormField } from '@/components/ModuleForm';
import { useLanguage } from '@/contexts/LanguageContext';

/**
 * Whether this person's phone publishes its position, and how often.
 *
 * The two fields live on the user row rather than in the account-wide tracking config, so
 * this is the per-person switch: the platform setting decides the cadence stored for
 * everyone, this decides whether a given driver is followed at all.
 *
 * Seeded from router params rather than a fetch, which is why there is no loading gate
 * here — ModuleForm consumes `initial` once, in a state initialiser, so a screen that
 * seeds from a request has to wait for it before mounting the form. These values are
 * already in hand from the detail screen, so there is nothing to race.
 *
 * The bounds are enforced client-side because the server's are hard 422s at 0 and 3601
 * rather than clamps, and its rejection does not say which field was at fault.
 */
export default function UserTrackingScreen() {
  const { uuid, track_location, location_ping_seconds } = useLocalSearchParams<{
    uuid: string;
    track_location?: string;
    location_ping_seconds?: string;
  }>();
  const { t } = useLanguage();

  const fields: FormField[] = [
    {
      name: 'track_location',
      label: t('users.trackOn'),
      kind: 'boolean',
      options: [
        { value: 'true', label: t('users.enabled') },
        { value: 'false', label: t('users.disabled') },
      ],
    },
    {
      name: 'location_ping_seconds',
      label: t('users.pingSeconds'),
      kind: 'number',
      integer: true,
      min: 1,
      max: 3600,
    },
  ];

  return (
    <ModuleForm
      requireAdmin
      title={t('users.editTracking')}
      note={t('users.trackingNote')}
      fields={fields}
      initial={{
        track_location: track_location ?? 'false',
        location_ping_seconds: location_ping_seconds ?? '15',
      }}
      method="PUT"
      endpoint={`/auth/user/${uuid}`}
    />
  );
}
