import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import L from "leaflet";
import { apiRequest } from "@/lib/queryClient";
import { quantizeViewport, viewportToWKT } from "@/lib/geo";
import { setPaneInert } from "./inertPane";

export const CUSTOMER_PIN_COLOR = "#059669"; // emerald

interface CustomerCluster {
  latitude: number;
  longitude: number;
  count: number;
  customer_uuid?: string | null;
  company_name?: string | null;
}

export interface CustomerPinStatus {
  /** customers in view — a FLOOR, see the note on total_count below */
  count: number | null;
  loading: boolean;
  failed: boolean;
}

interface CustomerPinLayerProps {
  map: L.Map;
  enabled: boolean;
  /**
   * False makes the pins click-through. Drive this from the host's own state
   * (e.g. "an edit session is open"), NOT from leaflet-draw's draw:* events —
   * those come from the draw TOOLBAR and never fire on a map without one.
   */
  interactive?: boolean;
  /** Tooltip text. Kept as props so this shared layer owns no i18n namespace. */
  labels: { one: string; many: (count: number) => string };
  onStatus?: (status: CustomerPinStatus) => void;
}

const PANE = "map-customer-pins";

/**
 * Customer pins for any Leaflet map, as a viewport-driven overlay.
 *
 * Clusters come from /customer/map-clusters, NOT the customer list. The list
 * route forces per_page to 10000 under a polygon filter and serialises a full
 * CustomerRead per row (balance_per_currency walks every order) — the documented
 * reason the map used to kill the app. The cluster route answers any viewport in
 * at most 100 rows, so panning costs the same whether the account has 200
 * customers or 200,000.
 */
export function CustomerPinLayer({
  map,
  enabled,
  interactive = true,
  labels,
  onStatus,
}: CustomerPinLayerProps) {
  const [viewport, setViewport] = useState<string>("");
  const layerRef = useRef<L.LayerGroup | null>(null);

  // Above the overlay pane (400) so pins read on top of polygons, but below
  // popups (700).
  useEffect(() => {
    if (!map.getPane(PANE)) {
      const pane = map.createPane(PANE);
      pane.style.zIndex = "595";
    }
    if (!layerRef.current) layerRef.current = L.layerGroup().addTo(map);
    return () => {
      layerRef.current?.remove();
      layerRef.current = null;
    };
  }, [map]);

  // Track the viewport, debounced — every pan would otherwise be a request.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const update = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        try {
          // quantised so a one-pixel pan does not mint a new cache entry that
          // then sits for the default gcTime
          setViewport(quantizeViewport(viewportToWKT(map.getBounds())));
        } catch {
          /* map torn down mid-debounce */
        }
      }, 500);
    };
    update();
    map.on("moveend zoomend", update);
    return () => {
      clearTimeout(timer);
      map.off("moveend zoomend", update);
    };
  }, [map]);

  const { data, isFetching, isError } = useQuery<{
    clusters: CustomerCluster[];
    total_count: number;
  }>({
    // element 0 is the resource the rest of the app invalidates, so adding a
    // customer refreshes this instead of serving a 30s-stale snapshot. The
    // "map-clusters" discriminator is shared with every other map that draws
    // these pins, so one viewport is cached once rather than per screen.
    queryKey: ["/customer/", "map-clusters", viewport],
    enabled: enabled && !!viewport,
    queryFn: () =>
      apiRequest(`/customer/map-clusters?within_polygon=${encodeURIComponent(viewport)}`),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    layer.clearLayers();
    if (!enabled) return;

    (data?.clusters ?? []).forEach((c) => {
      if (typeof c.latitude !== "number" || typeof c.longitude !== "number") return;
      const single = c.count === 1;
      const label = single ? "" : String(c.count);
      const size = single ? 12 : c.count > 99 ? 34 : 26;
      const marker = L.marker([c.latitude, c.longitude], {
        pane: PANE,
        keyboard: false,
        icon: L.divIcon({
          className: "",
          html: `<div style="width:${size}px;height:${size}px;border-radius:9999px;background:${CUSTOMER_PIN_COLOR};opacity:.85;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;color:#fff;font-size:11px;font-weight:600;line-height:1">${label}</div>`,
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
        }),
      });
      marker.bindTooltip(single ? c.company_name || labels.one : labels.many(c.count), {
        direction: "top",
      });
      layer.addLayer(marker);
    });
    // labels is a fresh object each render by design (it closes over t); the
    // data and enabled deps are what actually change the pins.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, enabled]);

  useEffect(() => {
    setPaneInert(map, PANE, !interactive);
  }, [map, interactive, enabled, data]);

  useEffect(() => {
    // null, not 0, until the data is actually here — a confident "(0)" on a
    // request still in flight (or one that failed) reads as "nothing out there".
    //
    // total_count is a FLOOR, not the exact number in view: the route truncates
    // the cluster list at MAX_MAP_POINTS and sums over what survived.
    onStatus?.({
      count: enabled && data ? data.total_count : null,
      loading: enabled && isFetching,
      failed: enabled && isError,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, data, isFetching, isError]);

  return null;
}
