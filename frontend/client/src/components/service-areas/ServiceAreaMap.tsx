import { useEffect, useRef, useState, useMemo, memo } from "react";
import { MapContainer, TileLayer, Polygon, Popup, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useLanguage } from "@/contexts/LanguageContext";

// Fix for default markers
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

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
}

// Parse WKT polygon to coordinates array for Leaflet
function parsePolygonWKT(wkt: string): [number, number][] {
  try {
    if (!wkt || typeof wkt !== 'string') {
      console.error('Invalid WKT input:', wkt);
      return [];
    }
    
    // Remove POLYGON(( and )) and split coordinates
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
      return [lat, lng] as [number, number];
    }).filter(coord => coord !== null) as [number, number][];
    
    return coords;
  } catch (error) {
    console.error('Error parsing WKT:', error);
    return [];
  }
}

// Helper function to convert bounds to WKT polygon
function boundsToWKT(bounds: L.LatLngBounds): string {
  const sw = bounds.getSouthWest();
  const ne = bounds.getNorthEast();
  return `POLYGON((${sw.lng} ${sw.lat},${ne.lng} ${sw.lat},${ne.lng} ${ne.lat},${sw.lng} ${ne.lat},${sw.lng} ${sw.lat}))`;
}

// Exact copy of vendor map event handler
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

// Global map instance to prevent React re-creation
let globalMapInstance: L.Map | null = null;
let globalPolygonLayer: L.LayerGroup | null = null;
let globalContainer: HTMLDivElement | null = null;

const ServiceAreaMapComponent = ({ serviceAreas, filters, onFiltersChange }: ServiceAreaMapProps) => {
  const { t } = useLanguage();
  const containerRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout>();
  const callbackRef = useRef(onFiltersChange);
  const filtersRef = useRef(filters);

  // Update refs without triggering re-renders
  callbackRef.current = onFiltersChange;
  filtersRef.current = filters;

  // Colors for different service areas
  const colors = [
    '#5469D4', '#6B73E0', '#8B5CF6', '#EC4899', 
    '#F59E0B', '#10B981', '#EF4444', '#8B5CF6'
  ];

  // Initialize map only once globally
  useEffect(() => {
    if (!globalMapInstance && containerRef.current) {
      globalContainer = containerRef.current;
      
      // Create map directly with Leaflet
      globalMapInstance = L.map(containerRef.current, {
        center: [33.5138, 36.2765],
        zoom: 10,
        zoomControl: true,
        scrollWheelZoom: true,
        doubleClickZoom: true,
        dragging: true
      });

      // Add tile layer
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      }).addTo(globalMapInstance);

      // Create layer group for polygons
      globalPolygonLayer = L.layerGroup().addTo(globalMapInstance);

      // Add event handlers with throttling
      globalMapInstance.on('moveend zoomend', () => {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
        
        timeoutRef.current = setTimeout(() => {
          if (globalMapInstance) {
            const bounds = globalMapInstance.getBounds();
            const wktPolygon = boundsToWKT(bounds);
            callbackRef.current({
              ...filtersRef.current,
              intersects_polygon: wktPolygon
            });
          }
        }, 1500);
      });

      console.log('Global map instance created');
    } else if (globalMapInstance && containerRef.current && globalContainer !== containerRef.current) {
      // Move existing map to new container
      globalContainer = containerRef.current;
      containerRef.current.appendChild(globalMapInstance.getContainer());
      globalMapInstance.invalidateSize();
      console.log('Map moved to new container');
    }
  }, []);

  // Update polygons when service areas change
  useEffect(() => {
    if (globalPolygonLayer) {
      // Clear existing polygons
      globalPolygonLayer.clearLayers();

      // Add new polygons
      serviceAreas.forEach((area, index) => {
        const coordinates = parsePolygonWKT(area.geometry);
        if (coordinates.length === 0) return;

        const color = colors[index % colors.length];
        
        const polygon = L.polygon(coordinates, {
          color: color,
          fillColor: color,
          fillOpacity: 0.3,
          weight: 2
        });

        polygon.bindPopup(`
          <div class="space-y-2">
            <h3 class="font-semibold">${area.name}</h3>
            ${area.description ? `<p class="text-sm">${area.description}</p>` : ''}
            <p class="text-xs text-gray-500">
              ${t('serviceAreas.popupCreated', { date: new Date(area.created_at).toLocaleDateString() })}
            </p>
            <p class="text-xs text-gray-500">
              ${t('serviceAreas.popupId', { id: area.uuid })}
            </p>
          </div>
        `);

        globalPolygonLayer?.addLayer(polygon);
      });
    }
  }, [serviceAreas, t]);

  // Cleanup timeout only (not map)
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return <div dir="ltr" ref={containerRef} className="h-full w-full" />;
};

// Memoize the component to prevent unnecessary re-renders that cause position resets
export const ServiceAreaMap = memo(ServiceAreaMapComponent, (prevProps, nextProps) => {
  // Only re-render if the actual service area count changes or onFiltersChange reference changes
  // Don't re-render for filters changes (which happen during map panning)
  return prevProps.serviceAreas.length === nextProps.serviceAreas.length && 
         prevProps.onFiltersChange === nextProps.onFiltersChange;
});