import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useLanguage } from "@/contexts/LanguageContext";

export interface PredefinedTag {
  /** the clean machine string that gets STORED, e.g. "customer_sale:no_sale" */
  tag: string;
  /** bilingual composite "<tag> - <arabic>" — same pattern as trip-stop
   *  outcomes; enumLabel/te splits it (English before " - ", Arabic after) */
  label: string;
}

/**
 * The predefined distribution-analytics tags, served by /customer/tag-catalog.
 *
 * Single source of truth on the server (like the trip-stop outcome list): the
 * picker renders from it and `labelFor` translates a stored tag back to its
 * per-language display text. Custom tags aren't in the catalog and are
 * returned VERBATIM — they must never pass through te()/enumLabel, whose
 * composite split and dictionary fallbacks would mangle a custom tag that
 * happens to contain " - "+Arabic or collide with an enum key.
 */
export function useTagCatalog() {
  const { te } = useLanguage();
  const { data } = useQuery<{ tags: PredefinedTag[] }>({
    queryKey: ["/customer/tag-catalog"],
    queryFn: () => apiRequest("/customer/tag-catalog"),
    // static platform data — refetching per mount would be noise
    staleTime: Infinity,
  });

  const catalog = data?.tags ?? [];

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
