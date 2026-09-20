import { ReactNode } from "react";
import { Loader2 } from "lucide-react";

/**
 * The column that map layer toggles live in.
 *
 * pointer-events-none on the column, auto on the chrome: the transparent gaps
 * BETWEEN the buttons sit over the map canvas, and without this they swallow
 * clicks meant for the map — which on a drawing surface means a vertex that
 * never gets placed. Learned the hard way.
 *
 * Sits opposite Leaflet's top-left zoom control, above the map's panes (Leaflet
 * tops out at z-index 1000).
 */
export function MapLayerToggleColumn({ children }: { children: ReactNode }) {
  return (
    <div
      dir="ltr"
      className="pointer-events-none absolute top-2 right-2 z-[1000] flex flex-col items-end gap-1"
    >
      {children}
    </div>
  );
}

interface MapLayerToggleProps {
  pressed: boolean;
  onToggle: () => void;
  /** Painted as the button's background when pressed. */
  color: string;
  icon: ReactNode;
  label: string;
  title?: string;
  /** null hides the count — use it while the request is still in flight, so a
   *  confident "(0)" never stands in for "we don't know yet". */
  count?: number | null;
  testId?: string;
}

export function MapLayerToggle({
  pressed,
  onToggle,
  color,
  icon,
  label,
  title,
  count = null,
  testId,
}: MapLayerToggleProps) {
  const cls = [
    "pointer-events-auto flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium shadow-sm transition-colors",
    pressed
      ? "text-white border-transparent"
      : "bg-white/95 text-gray-700 border-gray-300 hover:bg-gray-50",
  ].join(" ");

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={pressed}
      className={cls}
      style={pressed ? { backgroundColor: color } : undefined}
      title={title}
      data-testid={testId}
    >
      {icon}
      <span>{label}</span>
      {pressed && count !== null && (
        <span className="tabular-nums opacity-90">({count})</span>
      )}
    </button>
  );
}

export function MapLayerNotice({
  loading,
  failed,
  loadingLabel,
  failedLabel,
}: {
  loading: boolean;
  failed: boolean;
  loadingLabel: string;
  failedLabel: string;
}) {
  if (loading) {
    return (
      <span className="pointer-events-auto flex items-center gap-1 rounded bg-white/90 px-1.5 py-0.5 text-[10px] text-gray-600 shadow-sm">
        <Loader2 className="h-3 w-3 animate-spin" />
        {loadingLabel}
      </span>
    );
  }
  if (failed) {
    return (
      <span className="pointer-events-auto rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-700 shadow-sm">
        {failedLabel}
      </span>
    );
  }
  return null;
}
