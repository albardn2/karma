import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

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
 * bilingual label for display. Custom tags aren't in the catalog and fall
 * through as-is — deliberately untranslated.
 */
export function useTagCatalog() {
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

  /** bilingual label for a predefined tag; the raw tag itself for custom ones */
  const labelFor = useCallback((tag: string) => byTag.get(tag) ?? tag, [byTag]);

  return { catalog, labelFor };
}
