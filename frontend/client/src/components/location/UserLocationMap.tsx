import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiRequest } from "@/lib/queryClient";
import { LocationPlayback, type PlaybackPoint } from "@/components/location/LocationPlayback";
import { LiveLocationMap } from "@/components/location/TripLocationMap";
import { useLanguage } from "@/contexts/LanguageContext";

/**
 * "Location Tracking" card for a specific user: follow them live (when their
 * tracking flag is on) or play back their stored history from the last week.
 * Renders nothing for viewers who can't read the history (non-admins).
 */
export function UserLocationMap({
  userUuid,
  username,
  trackLocation,
}: {
  userUuid: string;
  username?: string;
  trackLocation?: boolean;
}) {
  const { t } = useLanguage();
  const liveAvailable = !!trackLocation;
  const [mode, setMode] = useState<"live" | "playback">(liveAvailable ? "live" : "playback");

  // default playback window: the last 7 days (the Location History page has
  // a custom range picker)
  const fromIso = useMemo(() => new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString(), []);
  const { data: series } = useQuery<{ points: PlaybackPoint[]; total_count: number }>({
    queryKey: ["/location/user", userUuid, "recent"],
    queryFn: () =>
      apiRequest(
        `/location/user/${userUuid}?from_time=${encodeURIComponent(fromIso)}&limit=20000`
      ),
    enabled: !!userUuid,
    retry: false,
  });

  // admin-only data — hide the whole card when the series isn't readable
  if (!series) return null;

  const effectiveMode = mode === "live" && liveAvailable ? "live" : "playback";

  return (
    <Card className="mt-6" data-testid="user-location-tracking">
      <CardHeader>
        <CardTitle>{t("nav.locationTracking")}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2 mb-4">
          {liveAvailable && (
            <Button
              size="sm"
              variant={effectiveMode === "live" ? "default" : "outline"}
              onClick={() => setMode("live")}
              data-testid="user-location-mode-live"
            >
              {t("location.live")}
            </Button>
          )}
          <Button
            size="sm"
            variant={effectiveMode === "playback" ? "default" : "outline"}
            onClick={() => setMode("playback")}
            data-testid="user-location-mode-playback"
          >
            {t("location.playback")}
          </Button>
          <span className="text-xs text-gray-500 ms-auto">
            {liveAvailable ? "" : t("location.liveOffNote")}
            {t("location.playbackLast7Days")} ·{" "}
            <Link href={`/users/${userUuid}/location-history`} className="underline">
              {t("location.customRange")}
            </Link>
          </span>
        </div>

        {effectiveMode === "live" ? (
          <LiveLocationMap userUuid={userUuid} username={username} points={series.points} />
        ) : series.points.length > 0 ? (
          <LocationPlayback points={series.points} />
        ) : (
          <p className="text-sm text-gray-500" data-testid="user-location-empty">
            {t("location.noPointsLast7Days")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
