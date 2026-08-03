import React from 'react';
import { StyleSheet, View } from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { ModuleListScreen } from '@/components/ModuleListScreen';
import { useLanguage } from '@/contexts/LanguageContext';
import { formatNumericDate } from '@/utils/date';

interface Workflow {
  uuid: string;
  name: string;
  description?: string | null;
  tags?: string[] | null;
  created_at: string;
}

/**
 * The templates behind distribution runs. READ ONLY, deliberately.
 *
 * A workflow is not tenant data: the table has no account_uuid at all, so one row is
 * inherited by every tenant on the platform, and the name is globally unique. Authoring
 * or deleting one from a phone would be editing every customer's process at once.
 *
 * Each write is refused for a specific reason rather than for scope:
 *  - CREATE means naming a platform-global template under a global uniqueness constraint,
 *    with a JSONB parameters blob and a callback list that have no phone-shaped editor.
 *  - EDIT takes tags as free text and the DTO accepts an unvalidated List[str], so one
 *    bad value puts a row outside the two legal tags and out of reach of its own filter.
 *  - DELETE is a soft delete with no cascade to tasks and no check for in-flight
 *    executions, so a mis-tap orphans work that is already running.
 * All three stay on the web, where a diff is visible before you commit to it.
 *
 * Rows are not tappable: there is a GET by uuid, but the only extra it carries is a wide
 * parameters blob and a callback list, which is reference material rather than something
 * to read on a phone. A row that opens a screen with nothing new on it is worse than a
 * row that does not open.
 *
 * The task count is deliberately absent. The list envelope has no tasks field, so showing
 * "N tasks" would mean one extra request per row purely for a subtitle.
 *
 * Note the page count here is `pages`, the default — the OPPOSITE of the accounts list in
 * this same console, which uses `total_pages`.
 */
export default function WorkflowsScreen() {
  const { t, tef } = useLanguage();

  return (
    <ModuleListScreen<Workflow>
      requireScope="superuser"
      title={t('superAdmin.tabWorkflows')}
      endpoint="/workflow/"
      itemsKey="workflows"
      searchParam="name"
      searchPlaceholder={t('workflows.searchPlaceholder')}
      filters={[
        // the two legal WorkflowTags values; the param is a comma-joined string with no
        // spaces, and matching is overlap (any), not all
        { id: 'distribution', label: tef('distribution'), params: { tags: 'distribution' } },
        { id: 'coated_peanuts', label: tef('coated_peanuts'), params: { tags: 'coated_peanuts' } },
      ]}
      header={<ThemedText style={styles.note}>{t('workflows.note')}</ThemedText>}
      keyExtractor={(w) => w.uuid}
      renderItem={(w) => (
        <View style={styles.row}>
          <View style={styles.rowLeft}>
            <ThemedText style={styles.name} numberOfLines={1}>
              {w.name}
            </ThemedText>
            {!!w.description && (
              <ThemedText style={styles.desc} numberOfLines={2}>
                {w.description}
              </ThemedText>
            )}
            {!!w.tags?.length && (
              <View style={styles.tags}>
                {w.tags.map((tag) => (
                  <ThemedText key={tag} style={styles.tag}>
                    {tef(tag)}
                  </ThemedText>
                ))}
              </View>
            )}
          </View>
          <ThemedText style={styles.when}>
            {w.created_at ? formatNumericDate(new Date(w.created_at)) : ''}
          </ThemedText>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  note: { fontSize: 12, opacity: 0.6, lineHeight: 18, marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 12 },
  rowLeft: { flex: 1, gap: 3 },
  name: { fontSize: 15, fontWeight: '600', color: '#1f2937' },
  desc: { fontSize: 12, opacity: 0.6, lineHeight: 17 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  tag: {
    fontSize: 10,
    fontWeight: '700',
    color: '#3730a3',
    backgroundColor: '#e0e7ff',
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  when: { fontSize: 11, opacity: 0.5, marginTop: 2 },
});
