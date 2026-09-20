/**
 * leaflet-draw, imported statically.
 *
 * This MUST be a static import rather than the CDN script loader it replaces,
 * and not for tidiness: leaflet-draw attaches the `.editing` handler to
 * polylines via `L.Polyline.addInitHook` (leaflet.draw-src.js:2276), which runs
 * at CONSTRUCTION time. A polygon built before the plugin has evaluated has no
 * `.editing` at all and can never be made editable — so any async loader is a
 * race against the first L.polygon() on the page. A static import, ordered
 * after leaflet (whose UMD sets window.L), has no such race.
 *
 * The loader this replaces also had two holes worth not re-sharing: it resolved
 * IMMEDIATELY whenever a <script src*=leaflet.draw> tag already existed, whether
 * or not that script's onload had fired (so a second concurrent caller got a
 * resolved promise with L.Control.Draw still undefined), and it had no
 * script.onerror, so a blocked CDN left the promise pending forever and the
 * toolbar silently never appeared.
 *
 * The CSS carries the draw TOOLBAR sprite only. Vertex handles render from
 * leaflet core's own .leaflet-div-icon, so a map that edits without a toolbar
 * still gets its handles.
 */
import L from "leaflet";
import "leaflet-draw";
import "leaflet-draw/dist/leaflet.draw.css";

/**
 * A polygon with leaflet-draw's edit handler attached.
 *
 * `L.Polygon` has no `editing` in the base types; @types/leaflet-draw declares
 * it loosely, so this narrows it to what we actually call.
 */
export type EditablePolygon = L.Polygon & {
  editing: {
    enable(): void;
    disable(): void;
    enabled(): boolean;
    updateMarkers(): void;
  };
};

/** Re-exported so callers need not import leaflet separately for the guard. */
export function isEditable(layer: L.Polygon): layer is EditablePolygon {
  const editing = (layer as unknown as Partial<EditablePolygon>).editing;
  return !!editing && typeof editing.enable === "function";
}

/**
 * The events that actually report a vertex change.
 *
 * `draw:edited`, `draw:editstart` and `draw:editstop` all live in
 * L.EditToolbar.Edit (leaflet.draw-src.js:4361-4452) and therefore NEVER fire
 * for a map with no draw toolbar. The layer-level 'edit' event does: it comes
 * from L.Edit.PolyVerticesEdit._fireEdit (:2070-2074), reached from vertex
 * dragend/touchend/MSPointerUp (:2028-2032), a vertex delete-click (:2161) and
 * a middle-marker becoming a new vertex (:2246). 'editdrag' (:2123) fires on
 * every drag frame, for live feedback only.
 */
export const POLY_EDIT_EVENT = "edit";
export const POLY_EDIT_DRAG_EVENT = "editdrag";

export { L };
