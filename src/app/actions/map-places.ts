"use server";

/**
 * Place lookup server actions for the map-first discovery view
 * (Vercel server runtime → MongoDB).
 *
 * The map needs only a representative lat/lng per venue so it can upgrade an
 * event's coarse city centroid to its real venue marker. Reads run server-side
 * because the browser never touches Mongo; the acting identity is resolved via
 * AuthKit (or the local dev bypass) even though the data itself is public —
 * keeping the auth gate consistent with the other server actions.
 *
 * Replaces the old direct-Supabase `getPlaceById` read in `map-client.tsx`.
 */

import { withAuth } from "@workos-inc/authkit-nextjs";
import { placesCollection } from "@/lib/mongo/databases";
import { isDevBypass } from "@/lib/auth/dev";
import { verificationTierLevel } from "@/lib/kweli";
import type { PlaceDoc } from "@/lib/mongo/types";

export interface MapPlaceCoords {
  id: string;
  latitude: number;
  longitude: number;
  /** Kweli verification tier (0–4) from `places.places.bundu` — read-only
   *  (verification is owned by Mukoko Kweli); 0 when absent. */
  verificationTier: number;
}

/**
 * Pull a representative [lat, lng] out of a GeoJSON geometry.
 *
 * Place geometries are 2dsphere-indexed GeoJSON in `[longitude, latitude]`
 * order. For a Point we read the pair directly; for Polygon / MultiPolygon we
 * fall back to the first ring's first vertex, which is good enough to drop a
 * single discovery pin.
 */
function coordsFromGeo(geo: Record<string, unknown> | null | undefined): [number, number] | null {
  if (!geo) return null;
  const type = geo.type;
  const raw = geo.coordinates;

  // Descend nested coordinate arrays until we reach a [lng, lat] number pair.
  let cursor: unknown = raw;
  if (type === "Point") {
    cursor = raw;
  } else if (type === "Polygon") {
    cursor = Array.isArray(raw) ? (raw as unknown[])[0] : null; // first ring
    cursor = Array.isArray(cursor) ? (cursor as unknown[])[0] : null; // first vertex
  } else if (type === "MultiPolygon") {
    cursor = Array.isArray(raw) ? (raw as unknown[])[0] : null; // first polygon
    cursor = Array.isArray(cursor) ? (cursor as unknown[])[0] : null; // first ring
    cursor = Array.isArray(cursor) ? (cursor as unknown[])[0] : null; // first vertex
  } else {
    return null;
  }

  if (!Array.isArray(cursor) || cursor.length < 2) return null;
  const lng = Number(cursor[0]);
  const lat = Number(cursor[1]);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  return [lat, lng];
}

/**
 * Resolve a single place's coordinates. Returns null when the id is empty,
 * the place is missing, or it carries no usable geometry.
 */
export async function getMapPlaceById(placeId: string): Promise<MapPlaceCoords | null> {
  if (!placeId) return null;

  // Resolve the acting identity for a consistent auth gate. The data is public,
  // but reads must originate from a recognised session or the dev bypass.
  if (!isDevBypass()) {
    const { user } = await withAuth();
    if (!user) return null;
  }

  const places = await placesCollection();
  const place = (await places.findOne(
    { _id: placeId },
    { projection: { geo: 1, bundu: 1 } },
  )) as Pick<PlaceDoc, "_id" | "geo" | "bundu"> | null;
  if (!place) return null;

  const ll = coordsFromGeo(place.geo);
  if (!ll) return null;
  return {
    id: placeId,
    latitude: ll[0],
    longitude: ll[1],
    verificationTier: verificationTierLevel(place.bundu?.verificationTier),
  };
}
