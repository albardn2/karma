import React, { useCallback, useEffect, useState } from 'react';
import { ModuleForm, FormField } from '@/components/ModuleForm';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiCall, isOk } from '@/utils/api';

interface Config {
  trip_cadence_seconds?: number | null;
  history_cadence_seconds?: number | null;
  history_retention_days?: number | null;
}

/**
 * How often driver positions are stored, and how long history is kept.
 *
 * Three numbers, and each one costs money or fidelity: a tighter cadence stores more
 * rows, a longer retention keeps them longer. That is the whole panel on the web too.
 *
 * WHOSE CONFIG THIS IS, which the web panel does not say and which matters: the route
 * resolves the config with `LocationTrackingConfig.account_uuid == uow.account_uuid`, so
 * it reads and writes THE CALLER'S OWN account. It cannot configure another tenant's
 * tracking — there is no per-account parameter and no route that takes one. In this
 * deployment every superuser sits inside the operator's own company, so in practice this
 * is that company's setting, and the screen says so rather than implying it is
 * platform-wide.
 *
 * The route is superuser-only on both verbs, so even a tenant admin is refused; the
 * screen is gated to match.
 *
 * The form is seeded from the current values because a PUT that omits a field leaves it
 * unchanged — showing empty inputs over live settings would invite someone to "fill in"
 * a number they never meant to change.
 */
export default function TrackingConfigScreen() {
  const { t } = useLanguage();
  const [config, setConfig] = useState<Config | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const res = await apiCall<Config>('/location/config');
    if (isOk(res.status) && res.data) setConfig(res.data);
    setLoaded(true);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const fields: FormField[] = [
    { name: 'trip_cadence_seconds', label: t('tracking.tripCadence'), kind: 'number' },
    { name: 'history_cadence_seconds', label: t('tracking.historyCadence'), kind: 'number' },
    { name: 'history_retention_days', label: t('tracking.retention'), kind: 'number' },
  ];

  // wait for the current values before mounting the form: ModuleForm seeds its state once,
  // from `initial`, so rendering it early would leave the inputs permanently blank
  if (!loaded) return null;

  return (
    <ModuleForm
      requireScope="superuser"
      title={t('superAdmin.tabTracking')}
      note={t('tracking.note')}
      fields={fields}
      initial={{
        trip_cadence_seconds: config?.trip_cadence_seconds ?? '',
        history_cadence_seconds: config?.history_cadence_seconds ?? '',
        history_retention_days: config?.history_retention_days ?? '',
      }}
      method="PUT"
      endpoint="/location/config"
    />
  );
}
