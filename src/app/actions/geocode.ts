"use server";

/**
 * Address geocoding server actions (Vercel server runtime).
 *
 * Product spec: **search the nhimbe places database first; only if nothing
 * matches, fall back to OSM geocoding.** The old address autocomplete loaded
 * the Google Places JS SDK in the browser; this replaces it with a same-origin
 * server action so the browser never talks to a third-party geocoder directly
 * and no Maps API key is needed.
 *
 *   1. `places.places` (MongoDB) — case-insensitive match on venue name and the
 *      free-form address sub-fields, returning our own catalogued venues first.
 *   2. OSM Nominatim (`https://nominatim.openstreetmap.org/search?format=geojson`)
 *      — public, key-less, attribution-required. Called server-side with a
 *      descriptive `User-Agent` and biased to the app's core markets via
 *      `countrycodes`. Nominatim asks callers to stay under ~1 req/sec; the
 *      client debounces keystrokes (the main lever) and we cap `limit`.
 *
 * Both paths return the same `GeocodeSuggestion` shape with a GeoJSON-derived
 * `[latitude, longitude]`, so the combobox can render DB hits above OSM hits
 * and set address + coordinates on select regardless of source.
 */

import { withAuth } from "@workos-inc/authkit-nextjs";
import tzlookup from "tz-lookup";
import { placesCollection, placesGeoCollection } from "@/lib/mongo/databases";
import { isDevBypass } from "@/lib/auth/dev";
import type { PlaceDoc } from "@/lib/mongo/types";

export interface GeocodeSuggestion {
  /** Where the row came from — DB hits are surfaced above OSM hits. */
  source: "db" | "osm";
  /** Stable id: the place `_id` for DB rows, `osm:<type>/<id>` for OSM rows. */
  placeId: string;
  /** Primary label (venue / feature name). */
  name: string;
  /** Street-address line, when known. */
  address: string;
  /** City / locality, when known. */
  city: string;
  /** Country, when known. */
  country: string;
  /** Full human-readable label for the suggestion list. */
  displayName: string;
  latitude: number;
  longitude: number;
  /** IANA timezone resolved from the coordinates (e.g. "Africa/Harare"). */
  timezone?: string;
}

/** Resolve an IANA timezone from coordinates; `tzlookup` throws on out-of-range input. */
function timezoneForCoords(latitude: number, longitude: number): string | undefined {
  try {
    return tzlookup(latitude, longitude);
  } catch {
    return undefined;
  }
}

/** Core markets the app serves — used to bias Nominatim results (ISO 3166-1). */
const REGION_COUNTRY_CODES = "zw,za,zm,ke,ng,gh,ug,tz,rw,et,mz,bw,sz,na,mw";

const NOMINATIM_ENDPOINT = "https://nominatim.openstreetmap.org";
// Nominatim usage policy requires an identifying User-Agent that a maintainer
// could contact. Kept generic (no PII) but app-specific.
const NOMINATIM_USER_AGENT = "nhimbe/1.0 (+https://nhimbe.com; events discovery)";

const DEFAULT_LIMIT = 6;
const MIN_QUERY_LENGTH = 3;

/** Resolve the acting identity so anonymous browser callers can't invoke the
 *  server-only Mongo read directly. The data itself is public. */
async function assertCaller(): Promise<void> {
  if (!isDevBypass()) {
    await withAuth();
  }
}

/** Pull [latitude, longitude] out of a GeoJSON Point geometry. */
function pointLatLng(geo: Record<string, unknown> | null | undefined): [number, number] | null {
  if (!geo || geo.type !== "Point") return null;
  const coords = geo.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  // GeoJSON order is [longitude, latitude].
  const lng = Number(coords[0]);
  const lat = Number(coords[1]);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  return [lat, lng];
}

function strField(obj: Record<string, unknown> | null | undefined, key: string): string {
  const v = obj?.[key];
  return typeof v === "string" ? v : "";
}

/** Escape regex metacharacters so user input is matched literally. */
function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Map `places.places` docs to suggestions, dropping rows without usable Point geometry. */
function mapPlaceDocs(docs: PlaceDoc[], limit: number): GeocodeSuggestion[] {
  const out: GeocodeSuggestion[] = [];
  for (const doc of docs) {
    const ll = pointLatLng(doc.geo);
    if (!ll) continue;
    const addr = (doc.address ?? {}) as Record<string, unknown>;
    const city = strField(addr, "addressLocality");
    const country = strField(addr, "addressCountry");
    const street = strField(addr, "streetAddress");
    out.push({
      source: "db",
      placeId: doc._id,
      name: doc.name ?? "",
      address: street,
      city,
      country,
      displayName: [doc.name, street, city, country].filter(Boolean).join(", "),
      latitude: ll[0],
      longitude: ll[1],
      timezone: timezoneForCoords(ll[0], ll[1]),
    });
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Search the nhimbe venue catalogue (`places.places`) case-insensitively
 * against the venue name, address sub-fields, and the OSM-derived
 * `searchKeywords` array (category/city/country terms like "Accommodation",
 * "Restaurant", the containing city — populated on effectively every row;
 * see `searchPlacesDb`) via a plain regex scan. Kept as the fallback for
 * `searchPlacesDb` — no Atlas Search dependency.
 */
async function searchPlacesDbRegex(query: string, limit: number): Promise<GeocodeSuggestion[]> {
  const places = await placesCollection();
  const rx = { $regex: escapeRegex(query), $options: "i" };
  const docs = (await places
    .find({
      isActive: true,
      $or: [
        { name: rx },
        { "address.streetAddress": rx },
        { "address.addressLocality": rx },
        { searchKeywords: rx },
      ],
    } as Parameters<typeof places.find>[0])
    .limit(limit * 2) // over-fetch; some rows may lack Point coords
    .toArray()) as PlaceDoc[];

  return mapPlaceDocs(docs, limit);
}

/**
 * Search the nhimbe venue catalogue (`places.places`) via the `places_search`
 * Atlas Search index: autocomplete on venue name, full-text on the
 * OSM-derived `searchKeywords` array (synonym-aware) so a category or city
 * term ("Accommodation", "Restaurant", "Harare") surfaces places whose name
 * has nothing to do with the query, not just name substring matches.
 * `description`/`tags`/`keywords` are indexed but essentially unpopulated on
 * real documents (`searchKeywords` is the field the OSM ingestion pipeline
 * actually fills in) — searched too, for any doc that does carry them.
 * Falls back to the plain regex scan when Atlas Search isn't available
 * (e.g. a local dev cluster without a Search deployment) so the geocode
 * combobox never hard-fails.
 */
async function searchPlacesDb(query: string, limit: number): Promise<GeocodeSuggestion[]> {
  const places = await placesCollection();
  try {
    const docs = (await places
      .aggregate([
        {
          $search: {
            index: "places_search",
            compound: {
              filter: [{ equals: { path: "isActive", value: true } }],
              should: [
                { autocomplete: { query, path: "name", fuzzy: { maxEdits: 1 } } },
                { text: { query, path: "searchKeywords" } },
                { text: { query, path: ["description", "tags", "keywords"] } },
              ],
              minimumShouldMatch: 1,
            },
          },
        },
        { $limit: limit * 2 }, // over-fetch; some rows may lack Point coords
      ])
      .toArray()) as PlaceDoc[];
    const hits = mapPlaceDocs(docs, limit);
    if (hits.length > 0) return hits;
  } catch {
    // Atlas Search index missing/unavailable — fall through to the regex scan.
  }
  return searchPlacesDbRegex(query, limit);
}

interface NominatimFeature {
  geometry?: { type?: string; coordinates?: unknown };
  properties?: {
    display_name?: string;
    name?: string;
    address?: Record<string, unknown>;
    osm_type?: string;
    osm_id?: number | string;
  };
}

/** Map a Nominatim GeoJSON feature to our suggestion shape. */
function mapNominatimFeature(f: NominatimFeature): GeocodeSuggestion | null {
  const coords = f.geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const lng = Number(coords[0]);
  const lat = Number(coords[1]);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;

  const props = f.properties ?? {};
  const addr = (props.address ?? {}) as Record<string, string>;
  const city = addr.city || addr.town || addr.village || addr.municipality || addr.county || "";
  const country = addr.country || "";
  const street = [addr.house_number, addr.road].filter(Boolean).join(" ");
  const name = props.name || street || city || (props.display_name ?? "").split(",")[0] || "";
  const osmType = props.osm_type ?? "node";
  const osmId = props.osm_id ?? "";

  return {
    source: "osm",
    placeId: `osm:${osmType}/${osmId}`,
    name,
    address: street,
    city,
    country,
    displayName: props.display_name || [name, city, country].filter(Boolean).join(", "),
    latitude: lat,
    longitude: lng,
    timezone: timezoneForCoords(lat, lng),
  };
}

/** Query OSM Nominatim (GeoJSON). Returns [] on any network / parse failure. */
async function searchNominatim(query: string, limit: number): Promise<GeocodeSuggestion[]> {
  const url = new URL(`${NOMINATIM_ENDPOINT}/search`);
  url.searchParams.set("format", "geojson");
  url.searchParams.set("q", query);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("countrycodes", REGION_COUNTRY_CODES);

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": NOMINATIM_USER_AGENT,
        Accept: "application/geo+json",
      },
      // Cache identical lookups briefly to lighten load on the public service.
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    const body = (await res.json()) as { features?: NominatimFeature[] };
    const features = Array.isArray(body.features) ? body.features : [];
    return features
      .map(mapNominatimFeature)
      .filter((s): s is GeocodeSuggestion => s !== null)
      .slice(0, limit);
  } catch {
    return [];
  }
}

/**
 * Geocode a free-text address query.
 *
 * DB hits are returned first; only when the catalogue has nothing do we fall
 * back to OSM. Returns `[]` for blank / too-short queries so the client can
 * clear its suggestion list without a round-trip.
 */
export async function geocodeAddress(
  query: string,
  options?: { limit?: number },
): Promise<GeocodeSuggestion[]> {
  const q = (query ?? "").trim();
  if (q.length < MIN_QUERY_LENGTH) return [];

  await assertCaller();

  const limit = Math.max(1, Math.min(options?.limit ?? DEFAULT_LIMIT, 10));

  const dbHits = await searchPlacesDb(q, limit);
  if (dbHits.length > 0) return dbHits;

  return searchNominatim(q, limit);
}

export interface ReverseGeocodeResult {
  city: string;
  country: string;
  displayName: string;
  latitude: number;
  longitude: number;
}

/**
 * Reverse-geocode a browser coordinate to a place name via OSM Nominatim.
 *
 * Used by the home-page "use my location" weather entry point: the Mukoko
 * weather embed is keyed by a place slug, not raw coordinates, so a device
 * position is resolved to its city before building the widget URL. Returns
 * `null` on invalid input or any failure so the caller can fall back to the
 * timezone-derived city.
 */
export async function reverseGeocode(
  latitude: number,
  longitude: number,
): Promise<ReverseGeocodeResult | null> {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;

  await assertCaller();

  const url = new URL(`${NOMINATIM_ENDPOINT}/reverse`);
  url.searchParams.set("format", "geojson");
  url.searchParams.set("lat", String(latitude));
  url.searchParams.set("lon", String(longitude));
  url.searchParams.set("zoom", "10"); // city-level
  url.searchParams.set("addressdetails", "1");

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": NOMINATIM_USER_AGENT,
        Accept: "application/geo+json",
      },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { features?: NominatimFeature[] };
    const feature = body.features?.[0];
    if (!feature) return null;
    const addr = (feature.properties?.address ?? {}) as Record<string, string>;
    const city = addr.city || addr.town || addr.village || addr.municipality || addr.county || "";
    const country = addr.country || "";
    if (!city) return null;
    return {
      city,
      country,
      displayName: feature.properties?.display_name || [city, country].filter(Boolean).join(", "),
      latitude,
      longitude,
    };
  } catch {
    return null;
  }
}

/**
 * Resolve a country's primary IANA timezone from its `places.placesGeo`
 * centroid — used by the manual city-grid picker in the create/edit event
 * forms, which (unlike the address-search path) has a country *name* but no
 * coordinates of its own. Deliberately DB-driven rather than a hardcoded
 * country->timezone table: `placesGeo` already carries a real seeded/OSM
 * centroid per country (`geoType: "country"`), so this stays accurate as
 * that data improves and needs no maintenance for countries outside the
 * app's core markets.
 */
export async function resolveCountryTimezone(country: string): Promise<string | undefined> {
  const name = country.trim();
  if (!name) return undefined;

  await assertCaller();

  const placesGeo = await placesGeoCollection();
  const doc = await placesGeo.findOne({
    geoType: "country",
    name: { $regex: `^${escapeRegex(name)}$`, $options: "i" },
  });
  const ll = pointLatLng(doc?.geo);
  if (!ll) return undefined;
  return timezoneForCoords(ll[0], ll[1]);
}
