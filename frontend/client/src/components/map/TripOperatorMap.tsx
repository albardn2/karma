import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Play, Square } from "lucide-react";

interface TripOperatorMapProps {
  waypoints: number[][];
  routeCoordinates?: number[][];
}

// Component to fit map bounds to markers
function FitBounds({ waypoints }: { waypoints: [number, number][] }) {
  const map = useMap();
  
  useEffect(() => {
    if (waypoints.length > 0) {
      const bounds = L.latLngBounds(waypoints);
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [map, waypoints]);
  
  return null;
}

// Create custom numbered marker icons
function createNumberedIcon(number: number) {
  return L.divIcon({
    html: `<div style="position: relative; width: 30px; height: 41px;">
      <svg width="30" height="41" viewBox="0 0 30 41" xmlns="http://www.w3.org/2000/svg">
        <path d="M15 0C7.268 0 1 6.268 1 14c0 14 14 26 14 26s14-12 14-26C29 6.268 22.732 0 15 0z" fill="#5469D4" stroke="white" stroke-width="2"/>
      </svg>
      <div style="position: absolute; top: 8px; left: 50%; transform: translateX(-50%); color: white; font-weight: bold; font-size: 12px; text-align: center; width: 100%;">
        ${number}
      </div>
    </div>`,
    className: 'custom-numbered-icon',
    iconSize: [30, 41],
    iconAnchor: [15, 41],
    popupAnchor: [0, -41],
  });
}

export function TripOperatorMap({ waypoints, routeCoordinates }: TripOperatorMapProps) {
  const [isAnimated, setIsAnimated] = useState(false);
  const [stopIndex, setStopIndex] = useState(1);

  // Validate waypoints
  if (!waypoints || waypoints.length === 0) {
    return (
      <div className="h-96 bg-gray-100 dark:bg-gray-800 rounded-lg flex items-center justify-center">
        <p className="text-gray-500 dark:text-gray-400">No waypoints available for this trip</p>
      </div>
    );
  }

  // Convert waypoints from [lat, lon] to [lat, lon] format for Leaflet
  const validWaypoints = waypoints.filter(wp => 
    Array.isArray(wp) && 
    wp.length >= 2 && 
    typeof wp[0] === 'number' && 
    typeof wp[1] === 'number' &&
    !isNaN(wp[0]) && 
    !isNaN(wp[1])
  ).map(wp => [wp[0], wp[1]] as [number, number]);

  if (validWaypoints.length === 0) {
    return (
      <div className="h-96 bg-gray-100 dark:bg-gray-800 rounded-lg flex items-center justify-center">
        <p className="text-gray-500 dark:text-gray-400">Invalid waypoint data</p>
      </div>
    );
  }

  // Use first waypoint as initial center (will be adjusted by FitBounds)
  const center: [number, number] = validWaypoints[0];

  // Convert route coordinates if available
  const validRouteCoordinates = routeCoordinates?.filter(coord => 
    Array.isArray(coord) && 
    coord.length >= 2 && 
    typeof coord[0] === 'number' && 
    typeof coord[1] === 'number' &&
    !isNaN(coord[0]) && 
    !isNaN(coord[1])
  ).map(coord => [coord[0], coord[1]] as [number, number]) || [];

  // Determine which polyline to show
  const displayPolyline = isAnimated 
    ? validWaypoints.slice(0, stopIndex + 1)
    : validWaypoints;

  // Use route coordinates if available, otherwise use waypoints
  const primaryPolyline = validRouteCoordinates.length > 0 
    ? validRouteCoordinates 
    : validWaypoints;

  const animatedPolyline = isAnimated
    ? (validRouteCoordinates.length > 0
        ? validRouteCoordinates.slice(0, Math.floor(validRouteCoordinates.length * (stopIndex + 1) / validWaypoints.length))
        : validWaypoints.slice(0, stopIndex + 1))
    : primaryPolyline;

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center gap-4 p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <Button
            variant={!isAnimated ? "default" : "outline"}
            size="sm"
            onClick={() => setIsAnimated(false)}
            data-testid="button-full-route"
          >
            <Square className="h-4 w-4 me-2" />
            Full Route
          </Button>
          <Button
            variant={isAnimated ? "default" : "outline"}
            size="sm"
            onClick={() => setIsAnimated(true)}
            data-testid="button-animated-route"
          >
            <Play className="h-4 w-4 me-2" />
            Animated Route
          </Button>
        </div>

        {/* Slider for animated mode */}
        {isAnimated && (
          <div className="flex-1 flex items-center gap-4">
            <span className="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
              Stop {stopIndex + 1} of {validWaypoints.length}
            </span>
            <Slider
              value={[stopIndex]}
              onValueChange={(value) => setStopIndex(value[0])}
              min={0}
              max={validWaypoints.length - 1}
              step={1}
              className="flex-1"
              data-testid="slider-route-progress"
            />
          </div>
        )}
      </div>

      {/* Map */}
      <div className="h-96 w-full rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
        <MapContainer
          center={center}
          zoom={13}
          style={{ height: "100%", width: "100%" }}
        >
          {/* Fit bounds to show all waypoints */}
          <FitBounds waypoints={validWaypoints} />
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          
          {/* Render polyline connecting waypoints/route */}
          <Polyline
            positions={animatedPolyline}
            color="#5469D4"
            weight={4}
            opacity={0.7}
          />
          
          {/* Render waypoint markers with numbers */}
          {validWaypoints.map((position, index) => {
            // In animated mode, only show markers up to current stop
            if (isAnimated && index > stopIndex) {
              return null;
            }

            return (
              <Marker
                key={index}
                position={position}
                icon={createNumberedIcon(index + 1)}
              >
                <Popup>
                  <div className="p-2">
                    <h3 className="font-semibold text-gray-900">Stop {index + 1}</h3>
                    <p className="text-xs text-gray-600 mt-1">
                      Latitude: {position[0].toFixed(6)}
                    </p>
                    <p className="text-xs text-gray-600">
                      Longitude: {position[1].toFixed(6)}
                    </p>
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>
      </div>
    </div>
  );
}
