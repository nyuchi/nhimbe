"use server";

/**
 * Venue (place) read server actions (Vercel server runtime → MongoDB).
 *
 * Replaces the legacy direct-Supabase `getPlaceById` / `getTransitForPlace`
 * helpers that the EventDetail venue card used to call from the browser. The
 * browser must never touch Mongo, so this read runs in a server action that
 * resolves the acting identity (AuthKit session or local dev bypass) and reads
 * `places.places` via the shared `placesCollection()` accessor.
 *
 * Shape note: `places.places` in Mukoko v3.1 is leaner than the old Supabase
 * `places.places` row. It carries name/slug/description, a GeoJSON `geo`
 * geometry, a free-form `address` object, `media` (cover image), `url`, an
 * aggregate rating under `discovery`, and `elevationMeters`. The fields the old
 * card surfaced that have NO home in the v3.1 document are deliberately mapped
 * to `null` / `[]`, so the card simply hides those cells:
 *   - accessibilityFeature, tourismType, activity, openingHoursText
 *   - communityConfirmations, dataOrigin/dataConfidence
 *   - OSM provenance (osmContributed / osmChangesetId / osmContributedAt)
 *
 * Transit: there is no transit collection in the v3.1 MongoDB schema, so the
 * "Getting there" panel has no data source post-migration. `getTransitForPlace`
 * is intentionally omitted; the card renders without the transit section.
 */

import { withAuth } from "@workos-inc/authkit-nextjs";
import { placesCollection } from "@/lib/mongo/databases";
import { isDevBypass } from "@/lib/auth/dev";
import type { PlaceDoc } from "@/lib/mongo/types";

/** Rich place data for the EventDetail venue card. Mirrors the field names the
 *  card consumes (formerly the Supabase PlaceDetail helper). Fields with
 *  no source in the v3.1 `places.places` document are surfaced as null/[] so
 *  the card hides the corresponding cells. */
export interface PlaceDetail {
  id: string;
  name: string;
  slug: string | null;
  description: string | null;
  latitude: number | null;
  longitude: number | null;
  elevation: number | null;
  addressLocality: string | null;
  addressRegion: string | null;
  streetAddress: string | null;
  postalCode: string | null;
  website: string | null;
  coverImage: string | null;
  image: string[] | null;
  openingHoursText: string | null;
  accessibilityFeature: string[] | null;
  tourismType: string[] | null;
  activity: string[] | null;
  aggregateRatingValue: number | null;
  aggregateRatingCount: number | null;
  osmContributed: boolean;
  osmChangesetId: string | null;
  osmContributedAt: string | null;
  dataOrigin: string | null;
  dataConfidence: string | null;
  communityConfirmations: number | null;
}

function numOrNull(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function strOrNull(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

/** Pull [lng, lat] out of a GeoJSON Point geometry, if present. */
function pointLatLng(geo: Record<string, unknown> | null | undefined): {
  latitude: number | null;
  longitude: number | null;
} {
  if (!geo || geo.type !== "Point") return { latitude: null, longitude: null };
  const coords = geo.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) {
    return { latitude: null, longitude: null };
  }
  // GeoJSON order is [longitude, latitude].
  return { longitude: numOrNull(coords[0]), latitude: numOrNull(coords[1]) };
}

/** Map a v3.1 `places.places` document to the card's `PlaceDetail` shape. */
function mapPlaceDocToDetail(doc: PlaceDoc): PlaceDetail {
  const addr = (doc.address ?? {}) as Record<string, unknown>;
  const media = (doc.media ?? {}) as Record<string, unknown>;
  const discovery = (doc.discovery ?? {}) as Record<string, unknown>;
  const rating = (discovery.aggregateRating ?? {}) as Record<string, unknown>;
  const { latitude, longitude } = pointLatLng(doc.geo);
  const images = Array.isArray(media.image)
    ? (media.image as unknown[]).filter((u): u is string => typeof u === "string")
    : null;

  return {
    id: doc._id,
    name: doc.name ?? "",
    slug: strOrNull(doc.slug),
    description: strOrNull(doc.description),
    latitude,
    longitude,
    elevation: numOrNull(doc.elevationMeters),
    addressLocality: strOrNull(addr.addressLocality),
    addressRegion: strOrNull(addr.addressRegion),
    streetAddress: strOrNull(addr.streetAddress),
    postalCode: strOrNull(addr.postalCode),
    website: strOrNull(doc.url),
    coverImage: strOrNull(media.coverImage),
    image: images && images.length > 0 ? images : null,
    // Not modelled in v3.1 places.places — the card hides these cells.
    openingHoursText: null,
    accessibilityFeature: null,
    tourismType: null,
    activity: null,
    aggregateRatingValue: numOrNull(rating.value),
    aggregateRatingCount: numOrNull(rating.count),
    osmContributed: false,
    osmChangesetId: null,
    osmContributedAt: null,
    dataOrigin: null,
    dataConfidence: null,
    communityConfirmations: null,
  };
}

/**
 * Read the rich place data for a venue from `places.places`.
 *
 * Returns null when no id is given or the place isn't found. The acting
 * identity is resolved (AuthKit session, or the local dev bypass) so this read
 * runs only for a recognised caller — venue data is public-read, but routing it
 * through the authenticated server boundary keeps the browser off Mongo.
 */
export async function getPlaceById(placeId: string | null | undefined): Promise<PlaceDetail | null> {
  if (!placeId) return null;

  // Resolve the acting identity (dev bypass or WorkOS session). We don't need
  // the user object for this public-read, but we keep the boundary explicit so
  // anonymous browser callers can't invoke server-only Mongo access directly.
  if (!isDevBypass()) {
    await withAuth();
  }

  const places = await placesCollection();
  const doc = await places.findOne({ _id: placeId });
  if (!doc) return null;
  return mapPlaceDocToDetail(doc);
}
