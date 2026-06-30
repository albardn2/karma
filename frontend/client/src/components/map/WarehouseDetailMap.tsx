import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import { Warehouse } from "@/lib/types";
import "leaflet/dist/leaflet.css";

// Fix for default markers in react-leaflet
import L from "leaflet";

let DefaultIcon = L.divIcon({
  html: `<svg width="25" height="41" viewBox="0 0 25 41" xmlns="http://www.w3.org/2000/svg">
    <path d="M12.5 0C5.596 0 0 5.596 0 12.5c0 12.5 12.5 28.5 12.5 28.5s12.5-16 12.5-28.5C25 5.596 19.404 0 12.5 0z" fill="#8B5CF6"/>
    <circle cx="12.5" cy="12.5" r="6" fill="white"/>
  </svg>`,
  className: 'custom-div-icon',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
});

L.Marker.prototype.options.icon = DefaultIcon;

interface WarehouseDetailMapProps {
  warehouse: Warehouse;
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

export function WarehouseDetailMap({ warehouse }: WarehouseDetailMapProps) {
  const coordinates = parseCoordinates(warehouse.coordinates);
  
  if (!coordinates) {
    return (
      <div className="h-64 bg-gray-100 rounded-lg flex items-center justify-center">
        <p className="text-gray-500">No location data available for this warehouse</p>
      </div>
    );
  }

  return (
    <div className="h-64 w-full rounded-lg overflow-hidden">
      <MapContainer
        center={coordinates}
        zoom={15}
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        
        <Marker position={coordinates}>
          <Popup>
            <div className="p-2">
              <h3 className="font-semibold text-gray-900">{warehouse.name}</h3>
              <p className="text-sm text-gray-600">{warehouse.address}</p>
              {warehouse.notes && (
                <p className="text-xs text-gray-500 mt-1">{warehouse.notes}</p>
              )}
            </div>
          </Popup>
        </Marker>
      </MapContainer>
    </div>
  );
}