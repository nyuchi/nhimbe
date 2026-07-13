"use client";

import { useEffect, useRef, useState } from "react";
import { MapPin, ExternalLink, Navigation, Loader2 } from "lucide-react";
import "leaflet/dist/leaflet.css";
import { geocodeAddress } from "@/app/actions/geocode";
import { BASE_LAYERS } from "@/lib/map/tiles";

interface EventMapProps {
  venue: string;
  address: string;
  city: string;
  country: string;
}

/**
 * Per-event venue map, rendered with Leaflet on OpenStreetMap tiles — no
 * Google embed, no API key. The event only carries an address string, so we
 * resolve it to coordinates through the same DB-first `geocodeAddress` server
 * action the create-event autocomplete uses, then drop a single marker on the
 * shared OSM standard base layer. "View"/"Directions" point at
 * openstreetmap.org. If geocoding yields nothing we degrade to a text card with
 * an OSM search link, so the map never blocks the page.
 *
 * Leaflet is imported lazily inside the effect because it touches `window` on
 * load and would break Next.js's SSR pass otherwise.
 */
export function EventMap({ venue, address, city, country }: EventMapProps) {
  const fullAddress = [venue, address, city, country].filter(Boolean).join(", ");
  const encodedAddress = encodeURIComponent(fullAddress);

  const [coords, setCoords] = useState<[number, number] | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<unknown>(null);

  // OSM links. With coordinates we deep-link to the exact point; without, we
  // fall back to an OSM text search over the address.
  const osmViewUrl = coords
    ? `https://www.openstreetmap.org/?mlat=${coords[0]}&mlon=${coords[1]}#map=16/${coords[0]}/${coords[1]}`
    : `https://www.openstreetmap.org/search?query=${encodedAddress}`;
  const osmDirectionsUrl = coords
    ? `https://www.openstreetmap.org/directions?to=${coords[0]},${coords[1]}`
    : `https://www.openstreetmap.org/search?query=${encodedAddress}`;

  // Resolve the address to coordinates once.
  useEffect(() => {
    let cancelled = false;
    if (!fullAddress) {
      setStatus("error");
      return;
    }
    (async () => {
      try {
        const results = await geocodeAddress(fullAddress, { limit: 1 });
        if (cancelled) return;
        const first = results[0];
        if (first) {
          setCoords([first.latitude, first.longitude]);
          setStatus("ready");
        } else {
          setStatus("error");
        }
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fullAddress]);

  // Boot Leaflet once coordinates are available.
  useEffect(() => {
    if (!coords || !containerRef.current) return;
    let mounted = true;
    (async () => {
      const L = (await import("leaflet")).default;
      if (!mounted || !containerRef.current || mapRef.current) return;

      const map = L.map(containerRef.current, {
        center: coords,
        zoom: 15,
        zoomControl: true,
        scrollWheelZoom: false,
      });
      mapRef.current = map;

      const cfg = BASE_LAYERS.standard;
      L.tileLayer(cfg.url, { attribution: cfg.attribution, maxZoom: cfg.maxZoom }).addTo(map);

      const icon = L.divIcon({
        className: "nhimbe-venue-pin",
        html: `<span style="display:block;width:18px;height:18px;border-radius:9999px;background:var(--event-primary,#2f855a);box-shadow:0 4px 10px rgba(0,0,0,0.25);border:2px solid #fff;"></span>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      });
      L.marker(coords, { icon, title: venue }).addTo(map);
    })();
    return () => {
      mounted = false;
      const m = mapRef.current as { remove?: () => void } | null;
      m?.remove?.();
      mapRef.current = null;
    };
  }, [coords, venue]);

  // Text fallback when the address can't be placed on the map.
  if (status === "error") {
    return (
      <div
        className="rounded-(--radius-card) overflow-hidden"
        style={{ backgroundColor: "var(--event-surface)" }}
      >
        <div className="p-6 text-center">
          <MapPin className="w-8 h-8 mx-auto mb-3" style={{ color: "var(--event-primary)" }} />
          <h4 className="font-semibold mb-1">{venue}</h4>
          <p className="text-sm text-foreground/60 mb-4">
            {address && `${address}, `}
            {city}, {country}
          </p>
          <div className="flex gap-2 justify-center">
            <a
              href={osmViewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors"
              style={{ backgroundColor: "var(--event-primary)", color: "#0A0A0A" }}
            >
              <ExternalLink className="w-4 h-4" />
              View on OpenStreetMap
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="rounded-(--radius-card) overflow-hidden"
      style={{ backgroundColor: "var(--event-surface)" }}
    >
      {/* Map Header */}
      <div
        className="p-4 flex items-center justify-between border-b"
        style={{ borderColor: "var(--event-surface)" }}
      >
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4" style={{ color: "var(--event-primary)" }} />
          <span className="font-semibold text-sm">Event Location</span>
        </div>
        <div className="flex gap-2">
          <a
            href={osmDirectionsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium hover:opacity-80 transition-opacity"
            style={{ backgroundColor: "var(--event-primary)", color: "#0A0A0A" }}
          >
            <Navigation className="w-3.5 h-3.5" />
            Directions
          </a>
        </div>
      </div>

      {/* Leaflet map (fixed aspect to avoid layout shift while it boots) */}
      <div className="relative aspect-video w-full">
        {status === "loading" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/5">
            <Loader2 className="w-5 h-5 animate-spin text-text-tertiary" />
          </div>
        )}
        <div
          ref={containerRef}
          className="absolute inset-0 w-full h-full"
          role="application"
          aria-label={`Map showing ${venue}`}
        />
      </div>

      {/* Address Footer */}
      <div className="p-4">
        <h4 className="font-semibold text-sm mb-1">{venue}</h4>
        <p className="text-xs text-foreground/60">
          {address && `${address}, `}
          {city}, {country}
        </p>
      </div>
    </div>
  );
}
