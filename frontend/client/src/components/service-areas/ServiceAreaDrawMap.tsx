import { useEffect, useRef } from "react";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
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
}

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

export function ServiceAreaDrawMap({ onGeometryChange, initialGeometry = "" }: ServiceAreaDrawMapProps) {
  return (
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
    </MapContainer>
  );
}