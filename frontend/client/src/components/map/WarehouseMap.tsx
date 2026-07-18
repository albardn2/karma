import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from "react-leaflet";
import { LatLngBounds, Map as LeafletMap } from "leaflet";
import { Warehouse } from "@/lib/types";
import { useLanguage } from "@/contexts/LanguageContext";
import "leaflet/dist/leaflet.css";

// Fix for default markers in react-leaflet
import L from "leaflet";

// Import marker images
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import markerIconRetina from "leaflet/dist/images/marker-icon-2x.png";

// Fix default marker icons
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIconRetina,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

// Create custom branded icon for warehouses
const WarehouseIcon = L.divIcon({
  html: `<svg width="25" height="41" viewBox="0 0 25 41" xmlns="http://www.w3.org/2000/svg">
    <path d="M12.5 0C5.596 0 0 5.596 0 12.5c0 12.5 12.5 28.5 12.5 28.5s12.5-16 12.5-28.5C25 5.596 19.404 0 12.5 0z" fill="#8B5CF6"/>
    <circle cx="12.5" cy="12.5" r="6" fill="white"/>
  </svg>`,
  className: 'custom-div-icon',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
});

// Convert bounds to WKT polygon format
function boundsToWKT(bounds: LatLngBounds): string {
  const sw = bounds.getSouthWest();
  const se = bounds.getSouthEast();
  const ne = bounds.getNorthEast();
  const nw = bounds.getNorthWest();
  
  return `POLYGON((${sw.lng} ${sw.lat}, ${se.lng} ${se.lat}, ${ne.lng} ${ne.lat}, ${nw.lng} ${nw.lat}, ${sw.lng} ${sw.lat}))`;
}

interface WarehouseMapProps {
  warehouses: Warehouse[];
  onBoundsChange: (wktPolygon: string) => void;
  center?: [number, number];
  zoom?: number;
}

function parseCoordinates(coordinates?: string): [number, number] | null {
  if (!coordinates) return null;
  
  try {
    // Handle different coordinate formats
    const cleaned = coordinates.replace(/[^\d.,-]/g, '');
    const parts = cleaned.split(',').map(s => parseFloat(s.trim()));
    
    if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      // Assume format is "lat,lng"
      return [parts[0], parts[1]];
    }
    
    return null;
  } catch (error) {
    console.warn('Failed to parse coordinates:', coordinates);
    return null;
  }
}

// Separate markers component to prevent map re-rendering
function WarehouseMarkers({ warehouses }: { warehouses: Warehouse[] }) {
  const { t } = useLanguage();
  const warehousesWithCoordinates = useMemo(() => {
    return warehouses.filter(warehouse => {
      const coords = parseCoordinates(warehouse.coordinates);
      return coords !== null;
    });
  }, [warehouses]);

  return (
    <>
      {warehousesWithCoordinates.map((warehouse) => {
        const coords = parseCoordinates(warehouse.coordinates);
        if (!coords) return null;
        
        return (
          <Marker key={warehouse.uuid} position={coords} icon={WarehouseIcon}>
            <Popup>
              <div className="p-2">
                <h3 className="font-semibold text-gray-900">{warehouse.name}</h3>
                <p className="text-sm text-gray-600">{warehouse.address}</p>
                {warehouse.notes && (
                  <p className="text-xs text-gray-500 mt-1">{warehouse.notes}</p>
                )}
                <p className="text-xs text-gray-400 mt-1">
                  {t("location.createdLabel", { date: new Date(warehouse.created_at).toLocaleDateString() })}
                </p>
              </div>
            </Popup>
          </Marker>
        );
      })}
    </>
  );
}

function MapEventHandler({ onBoundsChange }: { onBoundsChange: (wktPolygon: string) => void }) {
  const map = useMapEvents({
    moveend: () => {
      try {
        if (map && map.getBounds) {
          const bounds = map.getBounds();
          const wktPolygon = boundsToWKT(bounds);
          onBoundsChange(wktPolygon);
        }
      } catch (error) {
        console.warn('Map moveend error:', error);
      }
    },
    zoomend: () => {
      try {
        if (map && map.getBounds) {
          const bounds = map.getBounds();
          const wktPolygon = boundsToWKT(bounds);
          onBoundsChange(wktPolygon);
        }
      } catch (error) {
        console.warn('Map zoomend error:', error);
      }
    },
  });

  return null;
}

export function WarehouseMap({ warehouses, onBoundsChange, center = [33.5138, 36.2765], zoom = 10 }: WarehouseMapProps) {
  const mapRef = useRef<LeafletMap>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  
  // Stable map configuration - these never change to prevent re-renders
  const mapConfig = useMemo(() => ({
    center,
    zoom,
    style: { height: "100%", width: "100%" }
  }), []); // Empty dependency array - never changes

  // Initialize bounds change on first load only
  useEffect(() => {
    if (!isInitialized && mapRef.current) {
      const timer = setTimeout(() => {
        if (mapRef.current) {
          const bounds = mapRef.current.getBounds();
          const wktPolygon = boundsToWKT(bounds);
          onBoundsChange(wktPolygon);
          setIsInitialized(true);
        }
      }, 500); // Increased delay to ensure map is fully loaded
      return () => clearTimeout(timer);
    }
  }, [isInitialized, onBoundsChange]);

  return (
    <div className="h-full w-full" dir="ltr">
      <MapContainer
        {...mapConfig}
        ref={mapRef}
        scrollWheelZoom={true}
        doubleClickZoom={true}
        dragging={true}
        zoomControl={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        
        <MapEventHandler onBoundsChange={onBoundsChange} />
        <WarehouseMarkers warehouses={warehouses} />
      </MapContainer>
    </div>
  );
}