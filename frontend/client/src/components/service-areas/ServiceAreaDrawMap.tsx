import { useCallback, useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import { useQuery } from "@tanstack/react-query";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Users, Shapes, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useLanguage } from "@/contexts/LanguageContext";

// Track if leaflet-draw is already loaded globally
let isLeafletDrawLoaded = false;

// Use script loading approach for leaflet-draw
const loadLeafletDraw = () => {
  return new Promise<void>((resolve) => {
    if (isLeafletDrawLoaded && (window as any).L && (window as any).L.Control && (window as any).L.Control.Draw) {
      resolve();
      return;
    }

    if ((window as any).L && (window as any).L.Control && (window as any).L.Control.Draw) {
      isLeafletDrawLoaded = true;
      resolve();
      return;
    }

    // Load CSS only once
    if (!document.querySelector('link[href*="leaflet.draw.css"]')) {
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet.draw/1.0.4/leaflet.draw.css';
      document.head.appendChild(css);
    }

    // Load JS only once
    if (!document.querySelector('script[src*="leaflet.draw"]')) {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet.draw/1.0.4/leaflet.draw.js';
      script.onload = () => {
        isLeafletDrawLoaded = true;
        resolve();
      };
      document.head.appendChild(script);
    } else {
      // Script already loaded
      isLeafletDrawLoaded = true;
      resolve();
    }
  });
};

// Fix for default markers
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface ServiceAreaDrawMapProps {
  onGeometryChange: (geometry: string) => void;
  initialGeometry?: string;
  /**
   * The area being EDITED. It is already on the map as the editable polygon, so
   * excluding it from the reference overlay stops it being drawn twice (the
   * amber reference sitting under your own indigo shape reads as a bug).
   */
  excludeServiceAreaUuid?: string;
}

/** Reference overlays are drawn in these colours; the shape you are drawing
 *  stays #5469D4 so it is never confused with something already on the map. */
const CUSTOMER_COLOR = "#059669"; // emerald
const AREA_COLOR = "#D97706"; // amber

// Parse WKT polygon to Leaflet polygon
function parsePolygonWKT(wkt: string): L.LatLng[] {
  try {
    if (!wkt || typeof wkt !== 'string') {
      console.error('Invalid WKT input:', wkt);
      return [];
    }
    
    const coordString = wkt.replace(/POLYGON\(\(|\)\)/g, '');
    const coords = coordString.split(',').map(coord => {
      const parts = coord.trim().split(' ');
      if (parts.length !== 2) {
        console.error('Invalid coordinate format:', coord);
        return null;
      }
      const [lng, lat] = parts.map(Number);
      if (isNaN(lng) || isNaN(lat)) {
        console.error('Invalid coordinate values:', lng, lat);
        return null;
      }
      return new L.LatLng(lat, lng);
    }).filter(coord => coord !== null) as L.LatLng[];
    
    return coords;
  } catch (error) {
    console.error('Error parsing WKT:', error);
    return [];
  }
}

// Convert Leaflet polygon to WKT
function polygonToWKT(polygon: L.Polygon): string {
  const latlngs = polygon.getLatLngs()[0] as L.LatLng[];
  const coords = latlngs.map(latlng => `${latlng.lng} ${latlng.lat}`);
  
  // Ensure the polygon is closed by adding the first coordinate at the end if needed
  const firstCoord = coords[0];
  const lastCoord = coords[coords.length - 1];
  if (firstCoord !== lastCoord) {
    coords.push(firstCoord);
  }
  
  return `POLYGON((${coords.join(',')}))`;
}

/**
 * Leaflet sets `pointer-events` on each interactive path/marker ELEMENT, which
 * overrides `pointer-events:none` set on their pane — so gating the pane alone
 * does not stop a reference polygon from swallowing a click meant for the draw
 * canvas. This rule targets the descendants too, and !important is what makes it
 * win. Injected once, on first use.
 */
const INERT_CLASS = "sa-ref-inert";
let inertStyleInjected = false;
function ensureInertStyle() {
  if (inertStyleInjected || typeof document === "undefined") return;
  inertStyleInjected = true;
  const style = document.createElement("style");
  style.textContent =
    `.leaflet-pane.${INERT_CLASS},.leaflet-pane.${INERT_CLASS} *{pointer-events:none !important;}`;
  document.head.appendChild(style);
}

/** Map viewport -> WKT polygon, the shape both reference endpoints filter on. */
function boundsToWKT(b: L.LatLngBounds): string {
  const sw = b.getSouthWest();
  const ne = b.getNorthEast();
  // Leaflet does NOT wrap getBounds(): pan onto the next world copy and you get
  // lng 300..340, which intersects nothing and silently empties both overlays
  // while the map still shows Damascus. Zoomed fully out the span exceeds 360,
  // where wrapping each corner would instead produce a backwards ring.
  let west = sw.lng;
  let east = ne.lng;
  if (east - west >= 360) {
    west = -180;
    east = 180;
  } else {
    const shift = 360 * Math.floor((west + 180) / 360);
    west -= shift;
    east -= shift;
  }
  return `POLYGON((${west} ${sw.lat},${east} ${sw.lat},${east} ${ne.lat},${west} ${ne.lat},${west} ${sw.lat}))`;
}

interface CustomerCluster {
  latitude: number;
  longitude: number;
  count: number;
  customer_uuid?: string | null;
  company_name?: string | null;
}

interface ReferenceArea {
  uuid: string;
  name: string;
  description?: string | null;
  geometry: string;
}

interface ReferenceOverlaysProps {
  showCustomers: boolean;
  showAreas: boolean;
  excludeServiceAreaUuid?: string;
  onStatus: (s: {
    customers: number | null;
    areas: number | null;
    loading: boolean;
    failed: boolean;
  }) => void;
}

/**
 * Read-only context for the shape being drawn: where the customers are, and
 * which areas already cover them.
 *
 * Customers come from /customer/map-clusters, NOT the customer list. The list
 * route forces per_page to 10000 under a polygon filter and serialises a full
 * CustomerRead per row (balance_per_currency walks every order) — the documented
 * reason the map used to kill the app. The cluster route answers any viewport in
 * at most 100 rows, so panning here costs the same whether the account has 200
 * customers or 200,000.
 *
 * Both overlays live in their own panes UNDER the drawn shape, and their
 * pointer-events are cut while a draw/edit is in progress: a reference polygon
 * that swallows the click you meant for the canvas is worse than no reference
 * at all.
 */
function ReferenceOverlays({
  showCustomers,
  showAreas,
  excludeServiceAreaUuid,
  onStatus,
}: ReferenceOverlaysProps) {
  const { t } = useLanguage();
  const map = useMap();
  const [viewport, setViewport] = useState<string>("");
  const customerLayerRef = useRef<L.LayerGroup | null>(null);
  const areaLayerRef = useRef<L.LayerGroup | null>(null);

  // Panes: areas below the drawn shape (overlayPane is 400), customer pins above
  // it but below popups, so your own polygon always reads on top of the context.
  useEffect(() => {
    if (!map.getPane("sa-ref-areas")) {
      const pane = map.createPane("sa-ref-areas");
      pane.style.zIndex = "390";
    }
    if (!map.getPane("sa-ref-customers")) {
      const pane = map.createPane("sa-ref-customers");
      pane.style.zIndex = "595";
    }
    if (!customerLayerRef.current) customerLayerRef.current = L.layerGroup().addTo(map);
    if (!areaLayerRef.current) areaLayerRef.current = L.layerGroup().addTo(map);

    return () => {
      customerLayerRef.current?.remove();
      areaLayerRef.current?.remove();
      customerLayerRef.current = null;
      areaLayerRef.current = null;
    };
  }, [map]);

  // Track the viewport, debounced — every pan would otherwise be a request.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const update = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        try {
          setViewport(boundsToWKT(map.getBounds()));
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

  // While drawing/editing, the overlays must not intercept clicks.
  useEffect(() => {
    ensureInertStyle();
    const setInteractive = (on: boolean) => {
      ["sa-ref-areas", "sa-ref-customers"].forEach((name) => {
        const pane = map.getPane(name);
        // class, not pane.style: Leaflet re-creates paths on pan/zoom and stamps
        // pointer-events on each one, so only a descendant rule holds.
        if (pane) pane.classList.toggle(INERT_CLASS, !on);
      });
    };
    const disable = () => setInteractive(false);
    const enable = () => setInteractive(true);
    map.on("draw:drawstart draw:editstart draw:deletestart", disable);
    map.on("draw:drawstop draw:editstop draw:deletestop", enable);
    return () => {
      map.off("draw:drawstart draw:editstart draw:deletestart", disable);
      map.off("draw:drawstop draw:editstop draw:deletestop", enable);
      setInteractive(true);
    };
  }, [map]);

  const { data: clusterData, isFetching: customersFetching, isError: customersError } = useQuery<{
    clusters: CustomerCluster[];
    total_count: number;
  }>({
    // prefixed with the resource the rest of the app invalidates, so adding a
    // customer refreshes this overlay instead of serving a 30s-stale snapshot
    queryKey: ["/customer/", "draw-overlay", viewport],
    enabled: showCustomers && !!viewport,
    queryFn: () =>
      apiRequest(`/customer/map-clusters?within_polygon=${encodeURIComponent(viewport)}`),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });

  const { data: areaData, isFetching: areasFetching, isError: areasError } = useQuery<{
    items: ReferenceArea[];
    total_count: number;
  }>({
    // same: AddServiceAreaDialog / ServiceAreaDetail invalidate ["/service-area/"],
    // so the area you just created shows up when you reopen to draw its neighbour
    queryKey: ["/service-area/", "draw-overlay", viewport],
    enabled: showAreas && !!viewport,
    queryFn: () =>
      apiRequest(
        `/service-area/?per_page=100&intersects_polygon=${encodeURIComponent(viewport)}`,
      ),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });

  // Customer pins
  useEffect(() => {
    const layer = customerLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    if (!showCustomers) return;

    (clusterData?.clusters ?? []).forEach((c) => {
      if (typeof c.latitude !== "number" || typeof c.longitude !== "number") return;
      const single = c.count === 1;
      const label = single ? "" : String(c.count);
      const size = single ? 12 : c.count > 99 ? 34 : 26;
      const marker = L.marker([c.latitude, c.longitude], {
        pane: "sa-ref-customers",
        keyboard: false,
        icon: L.divIcon({
          className: "",
          html: `<div style="width:${size}px;height:${size}px;border-radius:9999px;background:${CUSTOMER_COLOR};opacity:.85;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;color:#fff;font-size:11px;font-weight:600;line-height:1">${label}</div>`,
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
        }),
      });
      marker.bindTooltip(
        single
          ? c.company_name || t("serviceAreas.overlayCustomer")
          : t("serviceAreas.overlayCustomersHere", { count: c.count }),
        { direction: "top" },
      );
      layer.addLayer(marker);
    });
  }, [clusterData, showCustomers, t]);

  // Existing area polygons
  useEffect(() => {
    const layer = areaLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    if (!showAreas) return;

    (areaData?.items ?? [])
      .filter((a) => a.uuid !== excludeServiceAreaUuid)
      .forEach((area) => {
        const coords = parsePolygonWKT(area.geometry);
        if (coords.length === 0) return;
        const polygon = L.polygon(coords, {
          pane: "sa-ref-areas",
          color: AREA_COLOR,
          fillColor: AREA_COLOR,
          fillOpacity: 0.1,
          weight: 2,
          dashArray: "6 4",
        });
        polygon.bindTooltip(area.name, { sticky: true });
        layer.addLayer(polygon);
      });
  }, [areaData, showAreas, excludeServiceAreaUuid]);

  // Report counts to the toggle buttons. The cluster route's total_count is the
  // real number of customers in view, not the number of pins.
  // null, not 0, until the data is actually here — a confident "(0)" on a
  // request still in flight (or one that failed) reads as "nothing out there".
  const shownAreas =
    showAreas && areaData
      ? areaData.items.filter((a) => a.uuid !== excludeServiceAreaUuid).length
      : null;
  const shownCustomers = showCustomers ? clusterData?.total_count ?? null : null;
  useEffect(() => {
    onStatus({
      customers: shownCustomers,
      areas: shownAreas,
      loading: (showCustomers && customersFetching) || (showAreas && areasFetching),
      failed: (showCustomers && customersError) || (showAreas && areasError),
    });
  }, [shownCustomers, shownAreas, customersFetching, areasFetching, customersError,
      areasError, showCustomers, showAreas, onStatus]);

  return null;
}

function DrawControl({ onGeometryChange, initialGeometry }: ServiceAreaDrawMapProps) {
  const { t } = useLanguage();
  const map = useMap();
  const drawnItemsRef = useRef<L.FeatureGroup>(new L.FeatureGroup());
  const drawControlRef = useRef<any>(null);
  const initializedRef = useRef<boolean>(false);

  useEffect(() => {
    const initializeDrawControl = async () => {
      // Prevent double initialization
      if (initializedRef.current) return;
      initializedRef.current = true;

      await loadLeafletDraw();
      
      const drawnItems = drawnItemsRef.current;
      map.addLayer(drawnItems);

      // Remove existing draw control if it exists
      if (drawControlRef.current) {
        map.removeControl(drawControlRef.current);
      }

      // Create draw control using window.L to avoid type issues
      const L_global = (window as any).L;
      const drawControl = new L_global.Control.Draw({
        edit: {
          featureGroup: drawnItems,
          edit: {},
          remove: {}
        },
        draw: {
          rectangle: false,
          circle: false,
          circlemarker: false,
          marker: false,
          polyline: false,
          polygon: {
            allowIntersection: false,
            showArea: true,
            drawError: {
              color: '#e1e100',
              message: t('serviceAreas.drawError')
            },
            shapeOptions: {
              color: '#5469D4',
              fillOpacity: 0.3
            }
          }
        }
      });

      drawControlRef.current = drawControl;
      map.addControl(drawControl);

      // Load initial geometry if provided
      if (initialGeometry && drawnItems.getLayers().length === 0) {
        try {
          const coords = parsePolygonWKT(initialGeometry);
          if (coords.length > 0) {
            const polygon = L.polygon(coords, {
              color: '#5469D4',
              fillOpacity: 0.3
            });
            drawnItems.addLayer(polygon);
            map.fitBounds(polygon.getBounds());
          }
        } catch (error) {
          console.error('Error loading initial geometry:', error);
        }
      }

      // Handle drawing events with proper event names
      const handleDrawCreated = (event: any) => {
        console.log('Draw created event:', event);
        const layer = event.layer;
        
        // Remove existing polygons (only allow one)
        drawnItems.clearLayers();
        drawnItems.addLayer(layer);
        
        if (layer instanceof L.Polygon) {
          const wkt = polygonToWKT(layer);
          console.log('New polygon created with WKT:', wkt);
          onGeometryChange(wkt);
        }
      };

      const handleDrawEdited = (event: any) => {
        console.log('Draw edited event:', event);
        const layers = event.layers;
        
        // Get the first edited polygon and update geometry
        layers.eachLayer((layer: L.Layer) => {
          console.log('Edited layer:', layer);
          if (layer instanceof L.Polygon) {
            const wkt = polygonToWKT(layer);
            console.log('Generated WKT from edited polygon:', wkt);
            onGeometryChange(wkt);
          }
        });
        
        // Also check if we need to update from the drawn items
        if (layers.getLayers().length === 0) {
          drawnItems.eachLayer((layer: L.Layer) => {
            if (layer instanceof L.Polygon) {
              const wkt = polygonToWKT(layer);
              console.log('Generated WKT from drawn items:', wkt);
              onGeometryChange(wkt);
            }
          });
        }
      };

      const handleDrawDeleted = () => {
        onGeometryChange('');
      };

      map.on('draw:created', handleDrawCreated);
      map.on('draw:edited', handleDrawEdited);
      map.on('draw:deleted', handleDrawDeleted);

      return () => {
        if (drawControlRef.current) {
          map.removeControl(drawControlRef.current);
          drawControlRef.current = null;
        }
        map.removeLayer(drawnItems);
        map.off('draw:created', handleDrawCreated);
        map.off('draw:edited', handleDrawEdited);
        map.off('draw:deleted', handleDrawDeleted);
        initializedRef.current = false;
      };
    };

    initializeDrawControl();
  }, [map, onGeometryChange, initialGeometry]);

  return null;
}

export function ServiceAreaDrawMap({
  onGeometryChange,
  initialGeometry = "",
  excludeServiceAreaUuid,
}: ServiceAreaDrawMapProps) {
  const { t } = useLanguage();
  const [showCustomers, setShowCustomers] = useState(false);
  const [showAreas, setShowAreas] = useState(false);
  const [status, setStatus] = useState<{
    customers: number | null;
    areas: number | null;
    loading: boolean;
    failed: boolean;
  }>({ customers: null, areas: null, loading: false, failed: false });

  // Identity-stable so the overlay's reporting effect does not re-run per render.
  const handleStatus = useCallback(
    (s: { customers: number | null; areas: number | null; loading: boolean; failed: boolean }) =>
      setStatus((prev) =>
        prev.customers === s.customers &&
        prev.areas === s.areas &&
        prev.loading === s.loading &&
        prev.failed === s.failed
          ? prev
          : s,
      ),
    [],
  );

  const toggleClass = (on: boolean) =>
    [
      "flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium shadow-sm transition-colors",
      on
        ? "text-white border-transparent"
        : "bg-white/95 text-gray-700 border-gray-300 hover:bg-gray-50",
    ].join(" ");

  return (
    <div className="relative h-full w-full">
      <MapContainer
        center={[33.5138, 36.2765]} // Default to Damascus, Syria
        zoom={10}
        style={{ height: '100%', width: '100%' }}
        className="z-0"
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        <DrawControl onGeometryChange={onGeometryChange} initialGeometry={initialGeometry} />
        <ReferenceOverlays
          showCustomers={showCustomers}
          showAreas={showAreas}
          excludeServiceAreaUuid={excludeServiceAreaUuid}
          onStatus={handleStatus}
        />
      </MapContainer>

      {/* Reference layers. Sits opposite leaflet-draw's top-left toolbar, and
          above the map's panes (leaflet tops out at z-index 1000). */}
      {/* pointer-events-none on the column, auto on the chrome: the transparent
          gaps between these buttons sit over the draw canvas, and without this
          they swallow the click that was meant to place a vertex. */}
      <div
        dir="ltr"
        className="pointer-events-none absolute top-2 right-2 z-[1000] flex flex-col items-end gap-1"
      >
        <button
          type="button"
          onClick={() => setShowCustomers((v) => !v)}
          aria-pressed={showCustomers}
          className={`pointer-events-auto ${toggleClass(showCustomers)}`}
          style={showCustomers ? { backgroundColor: CUSTOMER_COLOR } : undefined}
          title={t('serviceAreas.toggleCustomersHint')}
          data-testid="toggle-customer-pins"
        >
          <Users className="h-3.5 w-3.5" />
          <span>{t('serviceAreas.toggleCustomers')}</span>
          {showCustomers && status.customers !== null && (
            <span className="tabular-nums opacity-90">({status.customers})</span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setShowAreas((v) => !v)}
          aria-pressed={showAreas}
          className={`pointer-events-auto ${toggleClass(showAreas)}`}
          style={showAreas ? { backgroundColor: AREA_COLOR } : undefined}
          title={t('serviceAreas.toggleAreasHint')}
          data-testid="toggle-existing-areas"
        >
          <Shapes className="h-3.5 w-3.5" />
          <span>{t('serviceAreas.toggleAreas')}</span>
          {showAreas && status.areas !== null && (
            <span className="tabular-nums opacity-90">({status.areas})</span>
          )}
        </button>

        {status.loading && (
          <span className="pointer-events-auto flex items-center gap-1 rounded bg-white/90 px-1.5 py-0.5 text-[10px] text-gray-600 shadow-sm">
            <Loader2 className="h-3 w-3 animate-spin" />
            {t('common.loading')}
          </span>
        )}
        {!status.loading && status.failed && (
          <span className="pointer-events-auto rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-700 shadow-sm">
            {t('serviceAreas.overlayLoadFailed')}
          </span>
        )}
      </div>
    </div>
  );
}