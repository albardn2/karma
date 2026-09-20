import { useEffect, useState } from "react";
import type L from "leaflet";

/**
 * Making a Leaflet pane ignore clicks, properly.
 *
 * Leaflet sets `pointer-events` on each interactive path/marker ELEMENT, which
 * overrides `pointer-events:none` set on their pane — so gating the pane alone
 * does not stop a reference polygon from swallowing a click meant for the draw
 * canvas. This rule targets the descendants too, and !important is what makes
 * it win. Injected once, on first use.
 */
export const INERT_CLASS = "sa-ref-inert";

let inertStyleInjected = false;

export function ensureInertStyle() {
  if (inertStyleInjected || typeof document === "undefined") return;
  inertStyleInjected = true;
  const style = document.createElement("style");
  style.textContent =
    `.leaflet-pane.${INERT_CLASS},.leaflet-pane.${INERT_CLASS} *{pointer-events:none !important;}`;
  document.head.appendChild(style);
}

/**
 * Toggle one pane's inertness.
 *
 * A class, not pane.style: Leaflet re-creates paths on pan and zoom and stamps
 * pointer-events on each one, so only a descendant rule survives.
 */
export function setPaneInert(map: L.Map, paneName: string, inert: boolean) {
  ensureInertStyle();
  const pane = map.getPane(paneName);
  if (pane) pane.classList.toggle(INERT_CLASS, inert);
}

/**
 * True while leaflet-draw's TOOLBAR has a draw/edit/delete action open.
 *
 * Only usable on a map that mounts an L.Control.Draw: draw:editstart and
 * draw:editstop are fired by L.EditToolbar.Edit (leaflet.draw-src.js:4361,4380)
 * and never fire without it. A toolbar-less map must drive inertness from its
 * own state instead — see the map view, which passes `interactive={!editing}`.
 */
export function useDrawInteraction(map: L.Map | null): boolean {
  const [active, setActive] = useState(false);
  useEffect(() => {
    if (!map) return;
    const on = () => setActive(true);
    const off = () => setActive(false);
    map.on("draw:drawstart draw:editstart draw:deletestart", on);
    map.on("draw:drawstop draw:editstop draw:deletestop", off);
    return () => {
      map.off("draw:drawstart draw:editstart draw:deletestart", on);
      map.off("draw:drawstop draw:editstop draw:deletestop", off);
      setActive(false);
    };
  }, [map]);
  return active;
}
