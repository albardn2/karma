import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiCall, isOk } from '@/utils/api';
import { useLanguage } from '@/contexts/LanguageContext';

export interface PredefinedTag {
  /** the clean machine string that gets STORED, e.g. "customer_sale:no_sale" */
  tag: string;
  /** bilingual composite "<tag> - <arabic>" — same pattern as trip-stop
   *  outcomes; enumLabel/te splits it (English before " - ", Arabic after) */
  label: string;
}

// static platform data — fetched once per app session, shared across screens
let cached: PredefinedTag[] | null = null;

/**
 * The predefined distribution-analytics tags, served by /customer/tag-catalog.
 * Single source of truth on the server: pickers render from it and `labelFor`
 * translates a stored tag back to its per-language display text. Custom tags
 * aren't in the catalog and are returned VERBATIM — they must never pass
 * through te()/enumLabel, whose composite split and dictionary fallbacks would
 * mangle a custom tag containing " - "+Arabic or colliding with an enum key.
 */
export function useTagCatalog() {
  const { te } = useLanguage();
  const [catalog, setCatalog] = useState<PredefinedTag[]>(cached ?? []);

  useEffect(() => {
    if (cached) return;
    let dead = false;
    (async () => {
      const res = await apiCall<{ tags: PredefinedTag[] }>('/customer/tag-catalog');
      if (!dead && isOk(res.status) && res.data?.tags) {
        cached = res.data.tags;
        setCatalog(cached);
      }
    })();
    return () => {
      dead = true;
    };
  }, []);

  const byTag = useMemo(
    () => new Map(catalog.map((entry) => [entry.tag, entry.label])),
    [catalog],
  );

  /** display text: translated label for a predefined tag, the raw tag itself
   *  for custom ones. Render the result DIRECTLY — do not wrap it in te(). */
  const labelFor = useCallback(
    (tag: string) => {
      const label = byTag.get(tag);
      return label ? te(label) : tag;
    },
    [byTag, te],
  );

  return { catalog, labelFor };
}
