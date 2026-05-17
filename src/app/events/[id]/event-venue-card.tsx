"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Globe, Star, MapPin, Accessibility, Mountain, Users, Bus } from "lucide-react";
import { getPlaceById, getTransitForPlace, type PlaceDetail, type TransitOption } from "@/lib/supabase/api";

/**
 * Rich venue card backed by places.places. Replaces the legacy
 * locality-only "Location" section on EventDetail when an event has a
 * place_id set. Surfaces:
 *   - Real venue name + full address + lat/lng (the foundation for the
 *     Map's accurate pin placement when this same place is plotted there)
 *   - Cover image when available
 *   - Aggregate rating
 *   - Accessibility features
 *   - Opening hours (free-form text)
 *   - Activity tags (drives the terrain band correlation for outdoor
 *     venues: when the place activity includes "hiking" or "running",
 *     the EventSpecifics terrain band has a stronger basis)
 *   - **OSM provenance chip** — when the place row was contributed via
 *     OpenStreetMap (osm_contributed=true), surface a chip linking to
 *     the changeset. Embodies the open-source / contribute-back ethos:
 *     readers see the data lineage and can click through to OSM to
 *     refine or extend it.
 */

interface EventVenueCardProps {
  placeId: string | null | undefined;
}

export function EventVenueCard({ placeId }: EventVenueCardProps) {
  const [place, setPlace] = useState<PlaceDetail | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [transit, setTransit] = useState<TransitOption[]>([]);

  useEffect(() => {
    if (!placeId) {
      setLoaded(true);
      return;
    }
    let cancelled = false;
    getPlaceById(placeId)
      .then((p) => {
        if (cancelled) return;
        setPlace(p);
        // Fire-and-forget transit lookup; the panel is best-effort.
        if (p?.latitude != null && p?.longitude != null) {
          getTransitForPlace(p.id, p.latitude, p.longitude).then((opts) => {
            if (!cancelled) setTransit(opts);
          });
        }
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [placeId]);

  if (!loaded || !place) return null;

  const fullAddress = [place.streetAddress, place.addressLocality, place.addressRegion, place.postalCode]
    .filter(Boolean)
    .join(", ");

  return (
    <section data-slot="event-venue-card" className="mt-8 rounded-[var(--radius-lg)] bg-card border border-border overflow-hidden">
      {place.coverImage && (
        <div className="relative w-full h-44">
          <Image
            src={place.coverImage}
            alt={place.name}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 600px"
            unoptimized
          />
        </div>
      )}
      <div className="p-5">
        <header className="flex items-start gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <h3 className="font-serif text-xl font-bold text-foreground leading-tight">{place.name}</h3>
            {fullAddress && (
              <p className="text-sm text-muted-foreground mt-1 flex items-start gap-1.5">
                <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden />
                <span>{fullAddress}</span>
              </p>
            )}
          </div>
          {place.aggregateRatingValue !== null && place.aggregateRatingCount && place.aggregateRatingCount > 0 && (
            <div className="text-right shrink-0">
              <div className="inline-flex items-center gap-1 font-serif text-base font-bold">
                <Star className="w-3.5 h-3.5" style={{ color: "var(--nh-accent)" }} aria-hidden />
                {place.aggregateRatingValue.toFixed(1)}
              </div>
              <div className="text-[10px] text-muted-foreground">{place.aggregateRatingCount} reviews</div>
            </div>
          )}
        </header>

        {/* Quick-fact strip — only renders cells with data */}
        <dl className="grid grid-cols-3 gap-3 mt-3">
          {place.elevation !== null && (
            <Fact
              Icon={Mountain}
              label="Elevation"
              value={`${place.elevation} m`}
              tint="var(--nh-savanna)"
            />
          )}
          {place.communityConfirmations !== null && place.communityConfirmations > 0 && (
            <Fact
              Icon={Users}
              label="Confirmed"
              value={`${place.communityConfirmations}×`}
              tint="var(--nh-lead)"
            />
          )}
          {place.accessibilityFeature && place.accessibilityFeature.length > 0 && (
            <Fact
              Icon={Accessibility}
              label="A11y"
              value={`${place.accessibilityFeature.length} features`}
              tint="var(--mineral-cobalt-raw)"
            />
          )}
        </dl>

        {/* Tags — tourism types + activities */}
        {(place.tourismType?.length || place.activity?.length) ? (
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {[...(place.tourismType ?? []), ...(place.activity ?? [])].slice(0, 8).map((t) => (
              <li
                key={t}
                className="inline-flex items-center px-2 h-6 rounded-full text-[11px]"
                style={{ background: "var(--muted)", color: "var(--foreground)" }}
              >
                {t}
              </li>
            ))}
          </ul>
        ) : null}

        {place.openingHoursText && (
          <p className="mt-3 text-xs text-muted-foreground">{place.openingHoursText}</p>
        )}

        {/* Getting-there — transit routes near the venue. OSM-backed via
            transport.transit_stop.osm_node_id + transit_route.osm_relation_id;
            renders nothing when no nearby stops exist. */}
        {transit.length > 0 && (
          <div className="mt-4 pt-4 border-t border-border">
            <header className="flex items-center gap-1.5 mb-2">
              <Bus className="w-3.5 h-3.5" style={{ color: "var(--nh-secondary)" }} aria-hidden />
              <h4 className="text-[11px] font-semibold uppercase tracking-[0.04em] text-foreground">
                Getting there
              </h4>
              <span className="text-[10px] text-muted-foreground">
                {transit.length} {transit.length === 1 ? "route" : "routes"} nearby
              </span>
            </header>
            <ul className="space-y-1.5">
              {transit.map((t) => (
                <li
                  key={t.routeId}
                  className="flex items-center gap-2 text-[12px]"
                >
                  {t.routeNumber && (
                    <span
                      className="inline-flex items-center justify-center min-w-[2rem] h-6 px-2 rounded-md text-[10px] font-mono font-bold"
                      style={{ background: "var(--nh-lead-soft)", color: "var(--nh-lead)" }}
                    >
                      {t.routeNumber}
                    </span>
                  )}
                  <span className="flex-1 min-w-0 truncate">
                    <span className="font-semibold text-foreground">{t.routeName}</span>
                    <span className="text-muted-foreground"> · {t.stopName} ({Math.round(t.stopDistanceM / 100) / 10}km)</span>
                  </span>
                  {t.frequencyMinutes && (
                    <span className="text-[10px] text-muted-foreground shrink-0">every {t.frequencyMinutes}m</span>
                  )}
                  {t.osmRelationId && (
                    <a
                      href={`https://www.openstreetmap.org/relation/${encodeURIComponent(t.osmRelationId)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="View route on OpenStreetMap"
                      className="inline-flex items-center text-muted-foreground hover:text-foreground transition-colors shrink-0"
                    >
                      <Globe className="w-3 h-3" aria-hidden />
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Provenance footer */}
        <footer className="mt-4 flex items-center gap-3 text-[11px] text-muted-foreground">
          {place.website && (
            <a
              href={place.website}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-medium hover:text-foreground transition-colors"
            >
              <Globe className="w-3 h-3" aria-hidden />
              Website
            </a>
          )}
          {place.osmContributed && <OSMAttribution changesetId={place.osmChangesetId} />}
          {place.dataOrigin && !place.osmContributed && (
            <span className="inline-flex items-center gap-1">
              <span className="w-1 h-1 rounded-full bg-muted-foreground" aria-hidden />
              {place.dataOrigin}
            </span>
          )}
        </footer>
      </div>
    </section>
  );
}

function Fact({
  Icon,
  label,
  value,
  tint,
}: {
  Icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  label: string;
  value: string;
  tint: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="inline-flex items-center gap-1" style={{ color: tint }}>
        <Icon className="w-3 h-3" aria-hidden />
        <span className="text-[10px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
          {label}
        </span>
      </span>
      <span className="font-serif text-sm font-bold text-foreground leading-tight">{value}</span>
    </div>
  );
}

/**
 * OSM attribution chip — only renders when the venue came from OpenStreetMap.
 * Visible badge for the open-source contribute-back ethos: readers learn that
 * the place data is community-maintained, with a click-through to the OSM
 * changeset so they can refine the data at the source. When no changeset id
 * is on file, falls back to a search link.
 */
function OSMAttribution({ changesetId }: { changesetId: string | null }) {
  const href = changesetId
    ? `https://www.openstreetmap.org/changeset/${encodeURIComponent(changesetId)}`
    : "https://www.openstreetmap.org/";
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 px-2 h-5 rounded-full text-[10px] font-semibold transition-colors"
      style={{ background: "var(--nh-lead-soft)", color: "var(--nh-lead)" }}
      title="Venue data contributed via OpenStreetMap. Click to view the source."
    >
      <Globe className="w-3 h-3" aria-hidden />
      via OpenStreetMap
    </a>
  );
}
