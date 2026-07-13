"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { weatherEmbedUrl, type WeatherWidgetType } from "@/lib/weather";

interface WeatherEmbedProps {
  /** Human place name (e.g. "Harare"). Slugified for the widget internally. */
  location: string;
  /** Widget variant. Defaults to the compact "current" conditions card. */
  type?: WeatherWidgetType;
  /** Accessible iframe title. */
  title?: string;
  /** Fixed pixel height — set explicitly to avoid layout shift. */
  height?: number;
  className?: string;
}

/**
 * Live weather via the shared Mukoko weather widget
 * (`weather.mukoko.com/embed/widget`) rendered as a sandboxed iframe keyed by
 * the location slug. The widget is self-contained; this component only frames
 * it accessibly, reserves height to avoid layout shift, and shows a spinner
 * until it loads. It never throws or blocks the page — an unreachable widget
 * simply leaves the reserved frame empty.
 *
 * NOTE: the widget is keyed by a place slug, not raw lat/lng. Callers that
 * only have coordinates (e.g. browser geolocation) should reverse-geocode to a
 * city first. If the Mukoko widget later exposes a lat/lng param, extend
 * `weatherEmbedUrl` in `src/lib/weather.ts` and pass it through here.
 */
export function WeatherEmbed({
  location,
  type = "current",
  title,
  height = 160,
  className = "",
}: WeatherEmbedProps) {
  const [loaded, setLoaded] = useState(false);

  if (!location || location === "Online") return null;

  const src = weatherEmbedUrl(location, type);
  const label = title ?? `Weather for ${location}`;

  return (
    <div
      className={`relative overflow-hidden rounded-xl ${className}`}
      style={{ height, backgroundColor: "var(--event-surface, rgba(255,255,255,0.04))" }}
    >
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-text-tertiary" aria-hidden />
          <span className="sr-only">Loading weather…</span>
        </div>
      )}
      <iframe
        src={src}
        title={label}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        className="w-full h-full"
        style={{ border: 0 }}
        referrerPolicy="no-referrer-when-downgrade"
        sandbox="allow-scripts allow-same-origin allow-popups"
      />
    </div>
  );
}
