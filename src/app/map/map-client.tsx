"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Layers, ArrowLeft, MapPin, Mountain } from "lucide-react";
import "leaflet/dist/leaflet.css";
import type { Event } from "@/lib/api";
import { getMapPlaceById } from "@/app/actions/map-places";
import { BASE_LAYERS, type BaseLayerId } from "@/lib/map/tiles";
import { NyuchiPlaceCard } from "@/components/ui/nyuchi-place-card";
import { categoryToMineral } from "@/lib/category-mineral";

/**
 * Map-first discovery view. Uses OpenStreetMap raster tiles directly (no API
 * key, attribution required) with three switchable base layers defined in the
 * shared `@/lib/map/tiles` module (also used by the per-event venue map):
 *
 *   Standard      → OSM standard (https://tile.openstreetmap.org)
 *   Terrain       → OpenTopoMap — topographic with contour lines + hillshade,
 *                    matches the Nhimbe.html design's terrain-banded
 *                    backdrop without any custom tinting needed.
 *   Outdoor       → CyclOSM — outdoor activity-tinted (greens + trails),
 *                    good for trail / running / hike events.
 *
 * Event pins are coloured by category bucket so the cluster reads as a
 * terrain band: outdoors → savanna, music → sunset, faith → indigo, etc.
 *
 * Leaflet is loaded lazily inside useEffect because it touches `window`
 * during init and would fail Next.js's SSR pass otherwise.
 */

interface MapClientProps {
  initialEvents: Event[];
}

// Category → CSS color for pin tinting. Maps the design's terrain-band intent:
// outdoor groups read in savanna/baobab; music in sunset; faith in indigo;
// food in gold; tech in cobalt. Default uses the malachite lead.
function pinColor(category?: string): string {
  const c = (category || "").toLowerCase();
  if (/(hike|trail|run|walk|climb|swim|bike|cycle|marathon|parkrun|outdoor|adventure)/.test(c)) return "var(--nh-savanna)";
  if (/(music|festival|concert)/.test(c)) return "var(--nh-sunset)";
  if (/(faith|religious|service|worship|church|prayer)/.test(c)) return "var(--heritage-indigo)";
  if (/(food|dinner|tasting|menu)/.test(c)) return "var(--nh-accent)";
  if (/(tech|conference|workshop|talk|lecture|education|summit)/.test(c)) return "var(--mineral-cobalt-raw)";
  return "var(--nh-lead)";
}

// Find a representative lat/lng for each event. The Event type doesn't carry
// coords today; until events.event.place_id is fully wired through the worker
// we fall back to a coarse city centroid lookup. Returns null when nothing
// reasonable is available — those events render in the side list only.
function eventLatLng(ev: Event): [number, number] | null {
  // First preference: a coords blob on the event itself if the worker ever
  // surfaces it (currently doesn't; the read is forward-compat).
  const fromEvent = (ev as unknown as { latitude?: number; longitude?: number }).latitude;
  if (typeof fromEvent === "number") {
    return [fromEvent, (ev as unknown as { longitude: number }).longitude];
  }
  return cityCentroid(ev.location.addressLocality);
}

// Small Pan-African city centroid table — sufficient for demoing the
// terrain-banded view until places.places lat/lng flows through. Add cities
// as the catalogue grows; the map gracefully drops anything not listed.
const CITY_CENTROIDS: Record<string, [number, number]> = {
  Harare: [-17.8252, 31.0335],
  Bulawayo: [-20.1325, 28.6266],
  Johannesburg: [-26.2041, 28.0473],
  "Cape Town": [-33.9249, 18.4241],
  Pretoria: [-25.7479, 28.2293],
  Nairobi: [-1.2921, 36.8219],
  Lagos: [6.5244, 3.3792],
  Accra: [5.6037, -0.1870],
  Kampala: [0.3476, 32.5825],
  Dar: [-6.7924, 39.2083],
  "Dar es Salaam": [-6.7924, 39.2083],
  Lusaka: [-15.3875, 28.3228],
  Kigali: [-1.9706, 30.1044],
  Addis: [9.0320, 38.7469],
  "Addis Ababa": [9.0320, 38.7469],
  Maputo: [-25.9692, 32.5732],
  Gaborone: [-24.6282, 25.9231],
  Mbabane: [-26.3054, 31.1367],
  Windhoek: [-22.5609, 17.0658],
  Online: [0, 0],
};
function cityCentroid(city?: string | null): [number, number] | null {
  if (!city || city === "Online") return null;
  const exact = CITY_CENTROIDS[city];
  if (exact) return exact;
  // Loose-match for "Harare, Zimbabwe" etc.
  const first = city.split(",")[0].trim();
  return CITY_CENTROIDS[first] ?? null;
}

export function MapClient({ initialEvents }: MapClientProps) {
  const [layer, setLayer] = useState<BaseLayerId>("terrain");
  const [selected, setSelected] = useState<Event | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<unknown>(null); // L.Map, kept as unknown to avoid SSR types
  const tileLayerRef = useRef<unknown>(null);
  const markersGroupRef = useRef<unknown>(null);

  // Initial placement from event-side fallback (city centroid). The places
  // resolver below upgrades these to real venue coords when a place_id is set.
  const [resolvedCoords, setResolvedCoords] = useState<Map<string, [number, number]>>(new Map());
  const placedEvents = useMemo(() => {
    return initialEvents
      .map((ev) => {
        const resolved = resolvedCoords.get(ev.id);
        const ll = resolved ?? eventLatLng(ev);
        return { ev, ll };
      })
      .filter((e): e is { ev: Event; ll: [number, number] } => e.ll !== null);
  }, [initialEvents, resolvedCoords]);

  // Resolve real coordinates for any event with a placeId. Runs once on
  // mount (the initial events payload is stable) — when a place row carries
  // lat/lng we merge it into the resolvedCoords map, which triggers a
  // marker re-render in the dedicated effect below.
  useEffect(() => {
    const toResolve = initialEvents
      .filter((ev) => ev.placeId)
      .map((ev) => ({ id: ev.id, placeId: ev.placeId as string }));
    if (toResolve.length === 0) return;
    let cancelled = false;
    (async () => {
      const results = await Promise.all(
        toResolve.map(async ({ id, placeId }) => {
          const place = await getMapPlaceById(placeId);
          if (place?.latitude != null && place?.longitude != null) {
            return [id, [place.latitude, place.longitude] as [number, number]] as const;
          }
          return null;
        }),
      );
      if (cancelled) return;
      const next = new Map<string, [number, number]>();
      for (const r of results) {
        if (r) next.set(r[0], r[1]);
      }
      if (next.size > 0) setResolvedCoords(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [initialEvents]);

  // Boot Leaflet once on mount.
  useEffect(() => {
    if (!containerRef.current) return;
    let mounted = true;
    let onResize: (() => void) | null = null;
    (async () => {
      const L = (await import("leaflet")).default;
      if (!mounted || !containerRef.current) return;

      const map = L.map(containerRef.current, {
        center: placedEvents[0]?.ll ?? [-15, 28], // SADC-ish
        zoom: placedEvents.length > 0 ? 6 : 4,
        worldCopyJump: true,
        zoomControl: true,
      });
      mapRef.current = map;

      const cfg = BASE_LAYERS[layer];
      tileLayerRef.current = L.tileLayer(cfg.url, {
        attribution: cfg.attribution,
        maxZoom: cfg.maxZoom,
      }).addTo(map);

      // Empty marker group — the placedEvents effect below populates it
      // (and re-populates on resolved-coord updates) so we have one
      // source of truth for pin rendering.
      markersGroupRef.current = L.layerGroup().addTo(map);

      onResize = () => map.invalidateSize();
      window.addEventListener("resize", onResize);
    })();
    return () => {
      mounted = false;
      if (onResize) window.removeEventListener("resize", onResize);
      const m = mapRef.current as { remove?: () => void } | null;
      m?.remove?.();
      mapRef.current = null;
    };
    // Intentionally only run once on mount — base layer / marker updates
    // are handled by the dedicated effects below to avoid re-creating the map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-place pins when the resolved-coords map updates. We clear the
  // existing marker group and rebuild — cheap given the list size and
  // avoids tracking marker identity by id.
  useEffect(() => {
    const map = mapRef.current as { fitBounds?: (b: unknown, opts?: unknown) => void } | null;
    const group = markersGroupRef.current as { clearLayers?: () => void; addLayer?: (l: unknown) => void } | null;
    if (!map || !group) return;
    (async () => {
      const L = (await import("leaflet")).default;
      group.clearLayers?.();
      placedEvents.forEach(({ ev, ll }) => {
        const color = pinColor(ev.category);
        const html = `<span style="
          display:block;width:18px;height:18px;border-radius:9999px;
          background:${color};
          box-shadow:0 0 0 3px color-mix(in srgb, ${color} 25%, transparent), 0 4px 10px rgba(0,0,0,0.25);
          border:2px solid #fff;
        "></span>`;
        const icon = L.divIcon({ className: "nhimbe-pin", html, iconSize: [18, 18], iconAnchor: [9, 9] });
        const marker = L.marker(ll, { icon });
        marker.on("click", () => setSelected(ev));
        group.addLayer?.(marker);
      });
      if (placedEvents.length > 1) {
        const bounds = L.latLngBounds(placedEvents.map((p) => p.ll));
        map.fitBounds?.(bounds, { padding: [40, 40], maxZoom: 12 });
      }
    })();
  }, [placedEvents]);

  // Swap base layer when the user picks a different tile style.
  useEffect(() => {
    (async () => {
      const map = mapRef.current as { addLayer: (l: unknown) => void; removeLayer: (l: unknown) => void } | null;
      if (!map) return;
      const L = (await import("leaflet")).default;
      if (tileLayerRef.current) {
        map.removeLayer(tileLayerRef.current);
      }
      const cfg = BASE_LAYERS[layer];
      tileLayerRef.current = L.tileLayer(cfg.url, { attribution: cfg.attribution, maxZoom: cfg.maxZoom }).addTo(map as unknown as L.Map);
    })();
  }, [layer]);

  return (
    <div className="fixed inset-x-0 bottom-0 top-[var(--header-height,56px)] flex flex-col">
      <header className="flex items-center gap-3 px-4 py-3 border-b border-border bg-background z-10">
        <Link
          href="/"
          aria-label="Back"
          className="inline-flex items-center justify-center w-9 h-9 rounded-full hover:bg-muted transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <h1 className="font-serif text-lg font-semibold">Map</h1>
        <span className="text-xs text-muted-foreground">
          {placedEvents.length} of {initialEvents.length} placed
        </span>
        <div className="flex-1" />
        <fieldset className="inline-flex items-center gap-0 rounded-full border border-border p-0.5">
          <legend className="sr-only">Base layer</legend>
          {(Object.keys(BASE_LAYERS) as BaseLayerId[]).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setLayer(id)}
              aria-pressed={layer === id}
              className={`inline-flex items-center gap-1.5 px-3 h-8 rounded-full text-xs font-semibold transition-colors ${
                layer === id ? "text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
              style={layer === id ? { background: "var(--nh-lead-soft)", color: "var(--nh-lead)" } : undefined}
            >
              {id === "terrain" ? (
                <Mountain className="w-3.5 h-3.5" />
              ) : id === "outdoor" ? (
                <Layers className="w-3.5 h-3.5" />
              ) : (
                <MapPin className="w-3.5 h-3.5" />
              )}
              {BASE_LAYERS[id].label}
            </button>
          ))}
        </fieldset>
      </header>

      <div className="relative flex-1">
        <div ref={containerRef} className="absolute inset-0" role="application" aria-label="Events map" />

        {selected && (
          <div
            data-slot="map-event-card"
            className="absolute left-4 right-4 bottom-4 z-[1000] shadow-lg md:left-auto md:right-4 md:w-[340px]"
          >
            <button
              type="button"
              onClick={() => setSelected(null)}
              aria-label="Close"
              className="absolute -top-2 -right-2 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm backdrop-blur transition-colors hover:bg-background"
            >
              ×
            </button>
            {/* Branded venue card for the selected pin, linking through to the
                event. The mineral accent mirrors the pin's category bucket. */}
            <NyuchiPlaceCard
              name={selected.location.name || selected.location.addressLocality}
              category={`${selected.date.month} ${selected.date.day} · ${selected.category}`}
              address={selected.location.name ? selected.location.addressLocality : undefined}
              mineral={categoryToMineral(selected.category)}
              href={`/events/${selected.id}`}
            />
          </div>
        )}
      </div>
    </div>
  );
}
