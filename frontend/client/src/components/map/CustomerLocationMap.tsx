import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

interface CustomerLocationMapProps {
  coordinates: [number, number];
  customerName?: string;
}

// Component to fit map bounds to marker
function FitBounds({ coordinates }: { coordinates: [number, number] }) {
  const map = useMap();
  
  useEffect(() => {
    map.setView(coordinates, 15);
  }, [map, coordinates]);
  
  return null;
}

// Create custom customer marker icon
function createCustomerIcon() {
  return L.divIcon({
    html: `<div style="position: relative; width: 30px; height: 41px;">
      <svg width="30" height="41" viewBox="0 0 30 41" xmlns="http://www.w3.org/2000/svg">
        <path d="M15 0C7.268 0 1 6.268 1 14c0 14 14 26 14 26s14-12 14-26C29 6.268 22.732 0 15 0z" fill="#EF4444" stroke="white" stroke-width="2"/>
      </svg>
      <div style="position: absolute; top: 9px; left: 50%; transform: translateX(-50%); color: white; font-weight: bold; font-size: 14px; text-align: center; width: 100%;">
        📍
      </div>
    </div>`,
    className: 'custom-customer-icon',
    iconSize: [30, 41],
    iconAnchor: [15, 41],
    popupAnchor: [0, -41],
  });
}

export function CustomerLocationMap({ coordinates, customerName }: CustomerLocationMapProps) {
  // Validate coordinates
  if (!coordinates || 
      !Array.isArray(coordinates) || 
      coordinates.length < 2 ||
      typeof coordinates[0] !== 'number' || 
      typeof coordinates[1] !== 'number' ||
      isNaN(coordinates[0]) || 
      isNaN(coordinates[1])) {
    return (
      <div className="h-96 bg-gray-100 dark:bg-gray-800 rounded-lg flex items-center justify-center">
        <p className="text-gray-500 dark:text-gray-400">Invalid customer coordinates</p>
      </div>
    );
  }

  return (
    <div className="h-96 w-full rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
      <MapContainer
        center={coordinates}
        zoom={15}
        style={{ height: "100%", width: "100%" }}
      >
        <FitBounds coordinates={coordinates} />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        
        {/* Customer location marker */}
        <Marker
          position={coordinates}
          icon={createCustomerIcon()}
        >
          <Popup>
            <div className="p-2">
              <h3 className="font-semibold text-gray-900">
                {customerName || "Customer Location"}
              </h3>
              <p className="text-xs text-gray-600 mt-1">
                Latitude: {coordinates[0].toFixed(6)}
              </p>
              <p className="text-xs text-gray-600">
                Longitude: {coordinates[1].toFixed(6)}
              </p>
            </div>
          </Popup>
        </Marker>
      </MapContainer>
    </div>
  );
}
