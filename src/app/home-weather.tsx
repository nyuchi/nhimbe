"use client";

import { useEffect, useState } from "react";
import { CloudSun, LocateFixed, Loader2 } from "lucide-react";
import { WeatherEmbed } from "@/components/ui/weather-embed";
import { reverseGeocode } from "@/app/actions/geocode";

interface HomeWeatherProps {
  /** City derived from the browser timezone; the fallback location. */
  fallbackCity?: string | null;
}

type GeoState = "idle" | "locating" | "resolved" | "denied" | "unavailable";

/**
 * Home-page weather affordance. Defaults to the timezone-derived city and
 * offers a "use my location" button that asks the browser for a position,
 * reverse-geocodes it to a city (the Mukoko weather widget is keyed by place
 * name, not raw coords) and re-points the embed. Permission denial or an
 * unavailable geolocation API falls back to the timezone city — weather never
 * blocks the page. Rendered as a dropdown so it adds no layout shift.
 */
export function HomeWeather({ fallbackCity }: HomeWeatherProps) {
  const [city, setCity] = useState<string | null>(fallbackCity ?? null);
  const [open, setOpen] = useState(false);
  const [geoState, setGeoState] = useState<GeoState>("idle");

  // Adopt the fallback city once it resolves, unless the user has already
  // pinned a more specific location via geolocation.
  useEffect(() => {
    if (geoState !== "resolved" && fallbackCity) setCity(fallbackCity);
  }, [fallbackCity, geoState]);

  function requestLocation() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoState("unavailable");
      return;
    }
    setGeoState("locating");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const result = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
          if (result?.city) {
            setCity(result.city);
            setGeoState("resolved");
          } else {
            setGeoState("unavailable");
          }
        } catch {
          setGeoState("unavailable");
        }
      },
      () => setGeoState("denied"),
      { timeout: 8000, maximumAge: 600000 },
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="flex items-center gap-2 hover:text-text-secondary transition-colors"
      >
        <CloudSun className="w-4 h-4" />
        <span>{city ? `Weather · ${city}` : "Weather"}</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Weather"
          className="absolute right-0 top-full z-50 mt-2 w-72 rounded-xl border border-elevated bg-surface p-3 shadow-lg"
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-foreground">
              {city ?? "Location unknown"}
            </span>
            <button
              type="button"
              onClick={requestLocation}
              disabled={geoState === "locating"}
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-text-secondary hover:bg-elevated disabled:opacity-60"
            >
              {geoState === "locating" ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <LocateFixed className="w-3.5 h-3.5" />
              )}
              Use my location
            </button>
          </div>

          {geoState === "denied" && (
            <p className="mb-2 text-xs text-text-tertiary">
              Location access denied{city ? ` — showing ${city}` : ""}.
            </p>
          )}
          {geoState === "unavailable" && (
            <p className="mb-2 text-xs text-text-tertiary">
              Couldn&apos;t determine your location{city ? ` — showing ${city}` : ""}.
            </p>
          )}

          {city ? (
            <WeatherEmbed location={city} type="current" title={`Weather for ${city}`} />
          ) : (
            <p className="text-xs text-text-tertiary">
              Enable location access to see local weather.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
