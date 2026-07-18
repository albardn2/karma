import { useEffect } from "react";
import { MapContainer, TileLayer, Polygon, Popup, useMap } from "react-leaflet";
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

interface ServiceAreaDetailMapProps {
  geometry: string;
  name: string;
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

// Component to fit map bounds to polygon
function FitBounds({ coordinates }: { coordinates: [number, number][] }) {
  const map = useMap();

  useEffect(() => {
    if (coordinates.length > 0) {
      const bounds = L.latLngBounds(coordinates);
      map.fitBounds(bounds, { padding: [20, 20] });
    }
  }, [map, coordinates]);

  return null;
}

export function ServiceAreaDetailMap({ geometry, name }: ServiceAreaDetailMapProps) {
  const { t } = useLanguage();
  console.log('Received geometry:', geometry);
  const coordinates = parsePolygonWKT(geometry);
  console.log('Parsed coordinates:', coordinates);

  if (coordinates.length === 0) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-100">
        <p className="text-muted-foreground">{t('serviceAreas.invalidGeometry')}</p>
        <p className="text-xs text-gray-500 mt-2">{t('serviceAreas.geometryValue', { value: geometry })}</p>
      </div>
    );
  }

  return (
    <MapContainer
      center={coordinates[0] || [33.5138, 36.2765]}
      zoom={10}
      style={{ height: '100%', width: '100%' }}
      className="z-0"
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />
      
      <FitBounds coordinates={coordinates} />

      <Polygon
        positions={coordinates}
        pathOptions={{
          color: '#5469D4',
          fillColor: '#5469D4',
          fillOpacity: 0.3,
          weight: 2
        }}
      >
        <Popup>
          <div className="space-y-2">
            <h3 className="font-semibold">{name}</h3>
            <p className="text-xs text-gray-500">
              {t('serviceAreas.boundary')}
            </p>
          </div>
        </Popup>
      </Polygon>
    </MapContainer>
  );
}