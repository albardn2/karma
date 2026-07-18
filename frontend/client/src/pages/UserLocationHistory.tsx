import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, MapPin, User as UserIcon } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { LocationPlayback, type PlaybackPoint } from "@/components/location/LocationPlayback";
import type { User } from "@/lib/types";

interface LocationHistoryResponse {
  points: PlaybackPoint[];
  total_count: number;
}

// Format a Date as a value usable by <input type="datetime-local"> (local time, minute precision)
function toDatetimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// Convert a datetime-local value (local time) to a UTC ISO string
function toUtcIso(datetimeLocal: string): string {
  return new Date(datetimeLocal).toISOString();
}

export default function UserLocationHistory() {
  const [, params] = useRoute("/users/:uuid/location-history");
  const uuid = params?.uuid;
  const [, setLocation] = useLocation();

  const defaultFrom = toDatetimeLocalValue(
    new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  );
  const defaultTo = toDatetimeLocalValue(new Date());

  // Draft values bound to the inputs; applied values drive the query
  const [fromInput, setFromInput] = useState(defaultFrom);
  const [toInput, setToInput] = useState(defaultTo);
  const [appliedRange, setAppliedRange] = useState({
    fromISO: toUtcIso(defaultFrom),
    toISO: toUtcIso(defaultTo),
  });

  // Fetch user details (for the header)
  const { data: user } = useQuery<User>({
    queryKey: ["/auth/user", uuid],
    queryFn: async () => {
      if (!uuid) throw new Error("User UUID is required");
      return await apiRequest(`/auth/user/${uuid}`);
    },
    enabled: !!uuid,
  });

  // Fetch location history for the applied time window
  const {
    data: history,
    isLoading,
    error,
  } = useQuery<LocationHistoryResponse>({
    queryKey: ["/location/user", uuid, appliedRange.fromISO, appliedRange.toISO],
    queryFn: async () => {
      if (!uuid) throw new Error("User UUID is required");
      return await apiRequest(
        `/location/user/${uuid}?from_time=${encodeURIComponent(
          appliedRange.fromISO
        )}&to_time=${encodeURIComponent(appliedRange.toISO)}&limit=20000`
      );
    },
    enabled: !!uuid,
  });

  const isForbidden = error instanceof Error && error.message.startsWith("403");
  const points = history?.points ?? [];

  const handleApply = () => {
    if (!fromInput || !toInput) return;
    setAppliedRange({
      fromISO: toUtcIso(fromInput),
      toISO: toUtcIso(toInput),
    });
  };

  return (
    <AppLayout>
      <div className="flex-1 overflow-auto p-4 lg:p-6">
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLocation(`/users/${uuid}`)}
            >
              <ArrowLeft className="h-4 w-4 me-2" />
              Back
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Location History
              </h1>
              {user && (
                <p className="text-sm text-gray-600 flex items-center gap-1">
                  <UserIcon className="h-3 w-3" />
                  @{user.username}
                </p>
              )}
            </div>
          </div>

          {/* Time range controls */}
          <Card>
            <CardHeader>
              <CardTitle>Time Range</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col md:flex-row md:items-end gap-4">
                <div className="space-y-2">
                  <Label htmlFor="from-time">From</Label>
                  <Input
                    id="from-time"
                    type="datetime-local"
                    value={fromInput}
                    onChange={(e) => setFromInput(e.target.value)}
                    className="w-full md:w-56"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="to-time">To</Label>
                  <Input
                    id="to-time"
                    type="datetime-local"
                    value={toInput}
                    onChange={(e) => setToInput(e.target.value)}
                    className="w-full md:w-56"
                  />
                </div>
                <Button onClick={handleApply} disabled={!fromInput || !toInput}>
                  Apply
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Playback */}
          {isForbidden ? (
            <div className="text-center py-12">
              <p className="text-sm text-muted-foreground">Admins only</p>
            </div>
          ) : isLoading ? (
            <div className="text-center py-12">
              <p className="text-gray-600">Loading location history...</p>
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <p className="text-gray-600">
                Failed to load location history.{" "}
                {error instanceof Error ? error.message : ""}
              </p>
            </div>
          ) : points.length === 0 ? (
            <div className="text-center py-12">
              <MapPin className="h-8 w-8 mx-auto text-gray-400 mb-2" />
              <p className="text-gray-600">
                No location points in this window.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-gray-600">
                {points.length.toLocaleString()} point
                {points.length === 1 ? "" : "s"}
                {history && history.total_count > points.length
                  ? ` (of ${history.total_count.toLocaleString()} total)`
                  : ""}
              </p>
              <LocationPlayback points={points} />
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
