import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ModuleForm, FormField } from '@/components/ModuleForm';
import { useLanguage } from '@/contexts/LanguageContext';

/**
 * Whether this person's phone publishes its position at all.
 *
 * Just the per-person switch now: the publish cadence is a single global setting
 * (super-admin → Location Tracking), no longer chosen per user. This decides
 * whether a given driver is followed; the cadence is applied to everyone.
 *
 * Seeded from router params rather than a fetch, which is why there is no loading gate
 * here — ModuleForm consumes `initial` once, in a state initialiser, so a screen that
 * seeds from a request has to wait for it before mounting the form. The value is
 * already in hand from the detail screen, so there is nothing to race.
 */
export default function UserTrackingScreen() {
  const { uuid, track_location } = useLocalSearchParams<{
    uuid: string;
    track_location?: string;
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
  ];

  return (
    <ModuleForm
      requireAdmin
      title={t('users.editTracking')}
      note={t('users.trackingNote')}
      fields={fields}
      initial={{
        track_location: track_location ?? 'false',
      }}
      method="PUT"
      endpoint={`/auth/user/${uuid}`}
    />
  );
}
