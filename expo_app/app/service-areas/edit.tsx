import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ModuleForm, FormField } from '@/components/ModuleForm';
import { useLanguage } from '@/contexts/LanguageContext';

/**
 * Rename a service area, or reword its description. Nothing else.
 *
 * GEOMETRY IS NOT A FIELD HERE, but not because the endpoint refuses one. An earlier
 * version of this file claimed PUT accepts only {name, description}; that was wrong, and
 * the mistake came from generalising a single probe. `{"geometry": null}` is indeed a
 * 400 — but `{"geometry": "POLYGON((…))"}` returns 200 and really does replace the
 * stored ring, leaving name and description untouched. The boundary lives on its own
 * screen (`boundary.tsx`) because it needs a map, not because it is read-only.
 *
 * What this form still protects against is real: `ModuleForm` sends only the keys that
 * changed and drops empty values rather than nulling them, so a two-string field list
 * cannot send `{"name": null}` (422), cannot echo the read model back (422 on
 * `uuid`/`created_at`/`is_deleted`), and — sharpest of all — cannot send
 * `created_by_uuid`, which IS accepted on PUT and silently reassigns authorship.
 *
 * A separate file from create, unlike vendors which uses one screen for both. Two
 * reasons, both structural: create is a bespoke map rather than a `ModuleForm`, and the
 * vendors pattern carries the whole record through router params — a boundary is about a
 * kilobyte of coordinates and has no business in a URL. So this screen takes only the
 * three short fields it can actually edit.
 *
 * Neither field is `required`. A PUT of just the changed one is supported, and marking
 * them required would force the user to retype the other; `ModuleForm` short-circuits an
 * empty diff straight back rather than sending a pointless request.
 */
export default function ServiceAreaEditScreen() {
  const { uuid, name, description } = useLocalSearchParams<{
    uuid: string;
    name?: string;
    description?: string;
  }>();
  const { t } = useLanguage();

  const fields: FormField[] = [
    { name: 'name', label: t('serviceAreas.name'), kind: 'text' },
    { name: 'description', label: t('serviceAreas.description'), kind: 'multiline' },
  ];

  return (
    <ModuleForm
      module="service-areas"
      requireAdmin
      title={t('serviceAreas.editTitle')}
      // the rename warning is not decoration: trips record the area by a NAME
      // snapshot with no foreign key, so renaming silently drops every historical
      // trip out of that area's trip filter
      note={t('serviceAreas.renameWarning')}
      fields={fields}
      initial={{ name: name ?? '', description: description ?? '' }}
      method="PUT"
      endpoint={`/service-area/${uuid}`}
      errorMessages={{
        409: t('serviceAreas.nameTaken'),
        403: t('serviceAreas.notAllowed'),
      }}
    />
  );
}
