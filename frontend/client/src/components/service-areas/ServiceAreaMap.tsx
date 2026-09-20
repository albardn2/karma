import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, Polygon, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import "leaflet/dist/leaflet.css";
import { Users, Pencil, Save, X, Loader2 } from "lucide-react";
// Static, and it must stay static — see the module for why an async loader
// cannot make an already-constructed polygon editable.
import { L, POLY_EDIT_DRAG_EVENT, POLY_EDIT_EVENT, isEditable } from "@/components/map/leafletDraw";
import { CustomerPinLayer, CUSTOMER_PIN_COLOR, type CustomerPinStatus } from "@/components/map/CustomerPinLayer";
import {
  MapLayerNotice,
  MapLayerToggle,
  MapLayerToggleColumn,
} from "@/components/map/MapLayerToggle";
import { setPaneInert } from "@/components/map/inertPane";
import { parsePolygonRing, parsePolygonWKT, polygonToWKT, viewportToWKT } from "@/lib/geo";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { apiRequest, apiErrorMessage } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";

interface ServiceArea {
  uuid: string;
  name: string;
  description?: string;
  geometry: string;
  created_at: string;
}

interface ServiceAreaMapProps {
  serviceAreas: ServiceArea[];
  filters: any;
  onFiltersChange: (filters: any) => void;
  /**
   * Reports an unsaved boundary edit so the page can guard the exits it owns.
   * beforeunload covers closing the browser; leaving the map TAB is an in-app
   * unmount that fires no such event, and this feature is what put unsaved work
   * behind it.
   */
  onDirtyChange?: (dirty: boolean) => void;
}

const PALETTE = [
  "#5469D4", "#6B73E0", "#8B5CF6", "#EC4899",
  "#F59E0B", "#10B981", "#EF4444", "#0891B2",
];

/**
 * Colour keyed on the AREA, not on its position in the list.
 *
 * The old `colors[index % colors.length]` indexed into the viewport-filtered
 * page, so an area changed colour whenever a pan changed how many areas
 * preceded it. Harmless while everything is read-only; actively misleading once
 * one polygon means "the one you are editing".
 */
function colorFor(uuid: string): string {
  let h = 0;
  for (let i = 0; i < uuid.length; i++) h = (h * 31 + uuid.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

const EDIT_PANE = "sa-edit";

/** Viewport -> the page's polygon filter, debounced. Suspended while editing. */
function BoundsWatcher({
  onBounds,
  suspended,
}: {
  onBounds: (wkt: string) => void;
  suspended: React.MutableRefObject<boolean>;
}) {
  const timer = useRef<ReturnType<typeof setTimeout>>();
  // Re-bound on every render, so it always closes over the CURRENT callback.
  // The component this replaced registered its listener once, inside an
  // `if (!globalMapInstance)` branch, and then closed over the first mount's
  // refs forever — and that mount was torn down by the first pan.
  const map = useMapEvents({
    moveend: () => schedule(),
    zoomend: () => schedule(),
  });

  function schedule() {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      // A refetch swaps the area list, which would tear the polygon being
      // edited out from under the user's cursor — and Leaflet fires `remove`
      // on it, which is how leaflet-draw silently strips vertex handles.
      if (suspended.current) {
        // paused, not dropped: re-arm, so the viewport the session ends on is
        // the one the area list gets keyed to. Ending an edit only clears the
        // ref — nothing else re-schedules, since this fires from moveend and
        // zoomend alone, and the user may not pan again.
        schedule();
        return;
      }
      try {
        onBounds(viewportToWKT(map.getBounds()));
      } catch {
        /* map torn down mid-debounce */
      }
    }, 1500);
  }

  useEffect(() => () => clearTimeout(timer.current), []);
  return null;
}

/** Hands the Leaflet map instance up to the parent. */
function MapRef({ onMap }: { onMap: (m: L.Map) => void }) {
  const map = useMap();
  useEffect(() => {
    onMap(map);
  }, [map, onMap]);
  return null;
}

interface EditSession {
  uuid: string;
  name: string;
  dirty: boolean;
  error: string | null;
}
// No originalWkt: cancelling drops the editable layer and the area re-enters the
// read-only set straight from the `serviceAreas` prop, which is the stored ring.
// Holding a second copy only invited the two to disagree.

/**
 * All service areas on one map, with customer pins and in-place boundary editing.
 *
 * Editing is deliberately narrow: the shape only. Name and description stay on
 * /service-areas/<uuid>/edit, and the PUT sends `geometry` alone so reshaping a
 * boundary here can never revert a rename someone made meanwhile.
 */
export function ServiceAreaMap({
  serviceAreas,
  filters,
  onFiltersChange,
  onDirtyChange,
}: ServiceAreaMapProps) {
  const { t } = useLanguage();
  const { user, isAdmin } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [map, setMap] = useState<L.Map | null>(null);
  const [showCustomers, setShowCustomers] = useState(false);
  const [pinStatus, setPinStatus] = useState<CustomerPinStatus>({
    count: null,
    loading: false,
    failed: false,
  });

  const [session, setSession] = useState<EditSession | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  // Read by the bounds debounce, which must see the CURRENT value rather than
  // the one captured when the timer was scheduled.
  const editingRef = useRef(false);
  const editPolyRef = useRef<L.Polygon | null>(null);
  // Mirrors `session` for the mutation callbacks, which resolve after a round
  // trip and must not read a stale closure.
  const sessionRef = useRef<EditSession | null>(null);
  sessionRef.current = session;

  // MapContainer treats these as initial-only; freezing them documents that.
  const initialCenter = useMemo<[number, number]>(() => [33.5138, 36.2765], []);

  /**
   * The PUT is scopes_required(ADMIN, SUPER_ADMIN), and in scopes_required a
   * required set that is a subset of the admin scopes 403s EVERY fine-grained
   * caller regardless of their checklist. So the endpoint ACL must NOT be
   * consulted here: `service_area` is a real resource and a checklist can
   * contain service_area:['update'], but that grant still cannot save. Reading
   * it would show a pencil to someone whose every save fails.
   *
   * The tenant feature cap is still consulted — it is checked before the role
   * gate and binds admins too.
   */
  const accountPerms = (user as any)?.account_permissions ?? null;
  const capAllowsUpdate =
    !accountPerms ||
    (Array.isArray(accountPerms?.endpoints?.service_area) &&
      accountPerms.endpoints.service_area.includes("update"));
  const canEditShape = isAdmin && capAllowsUpdate;

  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  const handleBounds = useCallback(
    (wkt: string) => {
      onFiltersChange({ ...filtersRef.current, intersects_polygon: wkt });
    },
    [onFiltersChange],
  );

  // The edited polygon gets its own pane so it paints above the read-only areas
  // (overlayPane is 400) — but it MUST stay below Leaflet's markerPane at 600,
  // which is where leaflet-draw puts the vertex handles. At 610 the polygon's
  // own path covered its handles and swallowed every drag, so dragging a vertex
  // panned the map instead.
  useEffect(() => {
    if (!map) return;
    if (!map.getPane(EDIT_PANE)) {
      const pane = map.createPane(EDIT_PANE);
      pane.style.zIndex = "450";
    }
  }, [map]);

  /**
   * Remove the editable layer.
   *
   * Every step is individually guarded, and the ref is cleared FIRST. Teardown
   * runs on the success path, and leaflet-draw's own `remove` hook re-enters
   * its handler cleanup — so a throw in here would otherwise be reported as a
   * failed SAVE for a change the server already accepted, and would leave
   * vertex handles orphaned on the map with no way to clear them.
   */
  const teardownEdit = useCallback(() => {
    const poly = editPolyRef.current;
    editPolyRef.current = null;
    editingRef.current = false;
    if (!poly) return;
    try {
      poly.off(POLY_EDIT_EVENT);
      poly.off(POLY_EDIT_DRAG_EVENT);
    } catch {
      /* already detached */
    }
    try {
      if (isEditable(poly) && poly.editing.enabled()) poly.editing.disable();
    } catch {
      /* handler state inconsistent — the layer removal below still cleans up */
    }
    try {
      poly.remove();
    } catch {
      /* already off the map */
    }
  }, []);

  // Leaving the map tab unmounts this; without an explicit teardown the edit
  // layer and its handles would be orphaned on the shared map.
  useEffect(() => teardownEdit, [teardownEdit]);

  const beginEdit = useCallback(
    (area: ServiceArea) => {
      if (!map || !canEditShape) return;
      const { ring, dropped } = parsePolygonRing(area.geometry);
      // Refuse rather than round-trip a shape we could not fully read: saving
      // it would silently drop the vertices the parser skipped. The real case
      // is a polygon with an interior ring.
      if (dropped > 0 || ring.length < 4) {
        toast({
          title: t("common.error"),
          description: t("serviceAreas.geometryNotEditable"),
          variant: "destructive",
        });
        return;
      }

      teardownEdit();
      editingRef.current = true;

      const poly = L.polygon(ring, {
        pane: EDIT_PANE,
        color: "#111827",
        fillColor: colorFor(area.uuid),
        fillOpacity: 0.25,
        weight: 3,
        dashArray: "6 4",
      }).addTo(map);
      editPolyRef.current = poly;

      if (isEditable(poly)) {
        poly.editing.enable();
        // clears a previous rejection too: once the ring is being repaired the
        // old error is stale, and it would otherwise sit under the panel through
        // the retry and beyond
        const markDirty = () =>
          setSession((s) =>
            s && (!s.dirty || s.error) ? { ...s, dirty: true, error: null } : s,
          );
        poly.on(POLY_EDIT_EVENT, markDirty);
        poly.on(POLY_EDIT_DRAG_EVENT, markDirty);
      }

      map.closePopup();
      try {
        map.fitBounds(poly.getBounds(), { padding: [40, 40] });
      } catch {
        /* degenerate ring */
      }
      setSession({ uuid: area.uuid, name: area.name, dirty: false, error: null });
    },
    [map, canEditShape, teardownEdit, toast, t],
  );

  const endEdit = useCallback(() => {
    teardownEdit();
    setSession(null);
    setConfirmDiscard(false);
  }, [teardownEdit]);

  const saveMutation = useMutation({
    // The uuid travels WITH the save. A PUT in flight outlives the session that
    // started it — the user can discard and begin editing another area before
    // it lands — so neither callback may assume the open session is the one it
    // saved. Without this, area B's in-progress reshape was destroyed (with a
    // success toast) when area A's save returned.
    mutationFn: async (uuid: string) => {
      const poly = editPolyRef.current;
      if (!poly) throw new Error("no shape");
      // Read the geometry off the LAYER at save time, never off cached state:
      // an event we failed to bind then cannot cause a stale write.
      const geometry = polygonToWKT(poly);
      return apiRequest(`/service-area/${uuid}`, {
        method: "PUT",
        // geometry ALONE, deliberately unlike /service-areas/<uuid>/edit, which
        // owns all three fields and sends all three. ServiceAreaUpdate has every
        // field Optional and the domain applies exclude_unset, so absent fields
        // are untouched — echoing a name cached in this list would revert a
        // rename made while the map was open.
        body: { geometry },
      });
    },
    onSuccess: (_data, uuid) => {
      // The server has accepted it, so nothing after this point may present
      // itself as a save failure: react-query routes a throw from onSuccess to
      // onError, which would show an error for a change that persisted.
      try {
        // only the session this save belongs to — see mutationFn. end it FIRST,
        // so editingRef is false and the refetch below is allowed through
        if (sessionRef.current?.uuid === uuid) endEdit();
      } catch {
        /* teardown is best-effort; the save stands either way */
      }
      queryClient.invalidateQueries({ queryKey: ["/service-area/"] });
      toast({ title: t("common.success"), description: t("serviceAreas.saveShapeSuccess") });
    },
    onError: (error: unknown, uuid) => {
      // Keep the session and the user's shape. A rejected save must never
      // discard the work that caused it — and the error belongs to the session
      // that produced it, not to whichever one happens to be open now.
      const msg = apiErrorMessage(error, t("serviceAreas.saveShapeError"));
      setSession((s) => (s && s.uuid === uuid ? { ...s, error: msg } : s));
    },
  });

  const requestCancel = useCallback(() => {
    if (session?.dirty) {
      setConfirmDiscard(true);
      return;
    }
    endEdit();
  }, [session?.dirty, endEdit]);

  // Escape cancels, matching every other editor in the app — with two guards.
  // While the discard dialog is open Escape belongs to the DIALOG: Radix
  // dismisses it from a document capture-phase listener without stopping
  // propagation, so this bubble listener would re-open it in the same React
  // batch and the dialog could never be dismissed by keyboard. And while a save
  // is in flight Escape must be as inert as the Cancel button already is, or it
  // reopens the discard path for a session the server is still writing.
  useEffect(() => {
    if (!session || confirmDiscard || saveMutation.isPending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") requestCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [session, confirmDiscard, saveMutation.isPending, requestCancel]);

  useEffect(() => {
    onDirtyChange?.(!!session?.dirty);
    // also clears on unmount, so a guard cannot latch on after the map is gone
    return () => onDirtyChange?.(false);
  }, [session?.dirty, onDirtyChange]);

  // A reshape lives only in the browser until saved.
  useEffect(() => {
    if (!session?.dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [session?.dirty]);

  // The read-only areas must not intercept clicks meant for a vertex handle.
  useEffect(() => {
    if (!map) return;
    setPaneInert(map, "overlayPane", !!session);
  }, [map, session]);

  // Freeze the handles while a save is in flight. mutationFn reads the ring at
  // CLICK time and success tears the session down, so a vertex moved during the
  // round trip would be discarded under a success toast with no cue — markDirty
  // is already a no-op once dirty, so nothing would even look different.
  useEffect(() => {
    if (!map) return;
    setPaneInert(map, "markerPane", saveMutation.isPending);
  }, [map, saveMutation.isPending]);

  const pinLabels = useMemo(
    () => ({
      one: t("serviceAreas.overlayCustomer"),
      many: (count: number) => t("serviceAreas.overlayCustomersHere", { count }),
    }),
    [t],
  );

  // The area under edit is drawn by its own editable layer, so skip the
  // read-only copy — two rings on one boundary reads as a rendering bug.
  const readOnlyAreas = session
    ? serviceAreas.filter((a) => a.uuid !== session.uuid)
    : serviceAreas;

  return (
    <div className="relative z-0 h-full w-full">
      <MapContainer
        center={initialCenter}
        zoom={10}
        zoomControl
        scrollWheelZoom
        doubleClickZoom
        dragging
        className="h-full w-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapRef onMap={setMap} />
        <BoundsWatcher onBounds={handleBounds} suspended={editingRef} />

        {readOnlyAreas.map((area) => {
          const ring = parsePolygonWKT(area.geometry);
          if (ring.length === 0) return null;
          const color = colorFor(area.uuid);
          return (
            <Polygon
              key={area.uuid}
              positions={ring}
              pathOptions={{ color, fillColor: color, fillOpacity: 0.3, weight: 2 }}
            >
              {/* JSX children, not a bindPopup HTML string. React escapes the
                  text, so a tenant-authored area name cannot inject markup —
                  the old string-interpolated popup could. */}
              <Popup>
                <div className="space-y-2">
                  <h3 className="font-semibold">{area.name}</h3>
                  {area.description && <p className="text-sm">{area.description}</p>}
                  <p className="text-xs text-gray-500">
                    {t("serviceAreas.popupCreated", {
                      date: new Date(area.created_at).toLocaleDateString(),
                    })}
                  </p>
                  <p className="text-xs text-gray-500">
                    {t("serviceAreas.popupId", { id: area.uuid })}
                  </p>
                  {canEditShape && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="w-full"
                      data-testid={`edit-area-shape-${area.uuid}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        beginEdit(area);
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5 me-1.5" />
                      {t("serviceAreas.editShape")}
                    </Button>
                  )}
                </div>
              </Popup>
            </Polygon>
          );
        })}

        {map && (
          <CustomerPinLayer
            map={map}
            enabled={showCustomers}
            // state-driven, NOT draw:* events — this map has no draw toolbar,
            // so those events never fire and the gating would silently do nothing
            interactive={session === null}
            labels={pinLabels}
            onStatus={setPinStatus}
          />
        )}
      </MapContainer>

      <MapLayerToggleColumn>
        <MapLayerToggle
          pressed={showCustomers}
          onToggle={() => setShowCustomers((v) => !v)}
          color={CUSTOMER_PIN_COLOR}
          icon={<Users className="h-3.5 w-3.5" />}
          label={t("serviceAreas.toggleCustomers")}
          title={t("serviceAreas.toggleCustomersHint")}
          count={pinStatus.count}
          testId="toggle-customer-pins"
        />
        <MapLayerNotice
          loading={pinStatus.loading}
          failed={pinStatus.failed}
          loadingLabel={t("common.loading")}
          failedLabel={t("serviceAreas.overlayLoadFailed")}
        />
      </MapLayerToggleColumn>

      {session && (
        <div
          dir="ltr"
          className="absolute bottom-3 left-1/2 z-[1000] -translate-x-1/2 rounded-lg border bg-white/95 px-3 py-2 shadow-lg dark:bg-gray-900/95"
          data-testid="area-edit-panel"
        >
          <div className="flex items-center gap-3 flex-wrap justify-center">
            <div className="text-xs">
              <p className="font-semibold text-gray-900 dark:text-gray-100">
                {t("serviceAreas.editingArea", { name: session.name })}
              </p>
              {/* the viewport-driven list is frozen while editing, which would
                  otherwise read as the count being stuck */}
              <p className="text-gray-500">{t("serviceAreas.listPausedWhileEditing")}</p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={requestCancel}
                disabled={saveMutation.isPending}
                data-testid="cancel-area-edit"
              >
                <X className="h-3.5 w-3.5 me-1.5" />
                {t("serviceAreas.cancelEdit")}
              </Button>
              <Button
                type="button"
                size="sm"
                className="bg-[#5469D4] hover:bg-[#4356C7] text-white"
                disabled={!session.dirty || saveMutation.isPending || !canEditShape}
                onClick={() => saveMutation.mutate(session.uuid)}
                data-testid="save-area-shape"
              >
                {saveMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 me-1.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5 me-1.5" />
                )}
                {t("serviceAreas.saveShape")}
              </Button>
            </div>
          </div>
          {/* An admin demoted mid-session keeps the panel: unmounting it would
              throw away their reshape without a word. */}
          {!canEditShape && (
            <p className="mt-1 text-xs font-medium text-amber-700">
              {t("serviceAreas.noLongerPermitted")}
            </p>
          )}
          {session.error && (
            <p className="mt-1 max-w-sm text-xs font-medium text-red-600" data-testid="area-edit-error">
              {session.error}
            </p>
          )}
        </div>
      )}

      <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("serviceAreas.discardChanges")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("serviceAreas.discardChangesBody")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={endEdit}>
              {t("serviceAreas.discardChanges")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
