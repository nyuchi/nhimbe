/**
 * Shared event-listing predicates — the single source of truth behind BOTH the
 * public listing filter (`events.ts` `publishedFilter`) and the /discover count
 * aggregations (`lookups.ts`). Kept in one place so a tile's count can never
 * drift from its drill-down (M3/L1): the same published-and-visible gate and
 * the same city path feed both sides.
 *
 * Canonical city path — `location.address.addressLocality` (NESTED). This is
 * the shape `createEvent` actually writes (a schema.org `Place` with a nested
 * `PostalAddress`) and the shape `mappers.ts` prefers. A flat
 * `location.addressLocality` is tolerated as a legacy fallback so historical
 * documents are not missed; a document carries at most one of the two, so the
 * coalescing count expression and the either-path drill-down filter agree.
 *
 * Pure — no I/O, no `server-only` — so the Mongo query builders and their JS
 * equivalents (parity-tested in `event-filters.test.ts`) live together and stay
 * in lock-step.
 */

import type { EventDoc } from "./types";

/** A publicly-listable event is published or live. */
export const PUBLISHED_STATUSES = ["published", "live"] as const;

/** Canonical (nested) and legacy (flat) embed paths for the event locality. */
export const CITY_LOCALITY_PATH = "location.address.addressLocality";
export const CITY_LOCALITY_PATH_LEGACY = "location.addressLocality";
const CITY_COUNTRY_PATH = "location.address.addressCountry";
const CITY_COUNTRY_PATH_LEGACY = "location.addressCountry";

/**
 * Aggregation `$match` for published, visible, upcoming events — the shared
 * gate behind both listings and /discover counts. `$ne: "private"` also admits
 * documents with no `mukoko.visibility` set (treated as public).
 */
export function publishedVisibleMatch(from: Date = new Date()): Record<string, unknown> {
  return {
    status: { $in: [...PUBLISHED_STATUSES] },
    startDate: { $gte: from },
    "mukoko.visibility": { $ne: "private" },
  };
}

/** Aggregation expression resolving an event's city, canonical path first. */
export const cityLocalityExpr = {
  $ifNull: [`$${CITY_LOCALITY_PATH}`, `$${CITY_LOCALITY_PATH_LEGACY}`],
} as const;

/** Aggregation expression resolving an event's country, canonical path first. */
export const cityCountryExpr = {
  $ifNull: [`$${CITY_COUNTRY_PATH}`, `$${CITY_COUNTRY_PATH_LEGACY}`],
} as const;

/**
 * Find-filter clause matching an event's city on either embed path, so the
 * `?city=` drill-down selects exactly the docs the count aggregation groups
 * under that city.
 */
export function cityLocalityFilter(city: string): Record<string, unknown> {
  return {
    $or: [{ [CITY_LOCALITY_PATH]: city }, { [CITY_LOCALITY_PATH_LEGACY]: city }],
  };
}

// ── pure JS equivalents (mirror the Mongo builders; parity-tested) ─────────

/** Read a dotted path off a document without throwing on missing links. */
function readPath(doc: EventDoc, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object") return (acc as Record<string, unknown>)[key];
    return undefined;
  }, doc);
}

/** Resolve an event's city the way `cityLocalityExpr` does (nested, then flat). */
export function resolveEventCity(doc: EventDoc): string | null {
  const nested = readPath(doc, CITY_LOCALITY_PATH);
  if (typeof nested === "string" && nested.length > 0) return nested;
  const flat = readPath(doc, CITY_LOCALITY_PATH_LEGACY);
  if (typeof flat === "string" && flat.length > 0) return flat;
  return null;
}

/** Resolve an event's country the way `cityCountryExpr` does. */
export function resolveEventCountry(doc: EventDoc): string {
  const nested = readPath(doc, CITY_COUNTRY_PATH);
  if (typeof nested === "string" && nested.length > 0) return nested;
  const flat = readPath(doc, CITY_COUNTRY_PATH_LEGACY);
  if (typeof flat === "string") return flat;
  return "";
}

/** JS mirror of `cityLocalityFilter` — matches an event on either embed path. */
export function eventMatchesCity(doc: EventDoc, city: string): boolean {
  return (
    readPath(doc, CITY_LOCALITY_PATH) === city ||
    readPath(doc, CITY_LOCALITY_PATH_LEGACY) === city
  );
}

/** JS mirror of `publishedVisibleMatch`. */
export function isPublishedVisibleUpcoming(doc: EventDoc, from: Date = new Date()): boolean {
  const status = (doc as { status?: string }).status;
  if (!(PUBLISHED_STATUSES as readonly string[]).includes(status ?? "")) return false;
  const start =
    doc.startDate instanceof Date ? doc.startDate : new Date(doc.startDate as unknown as string);
  if (Number.isNaN(start.getTime()) || start.getTime() < from.getTime()) return false;
  const visibility = (doc.mukoko as Record<string, unknown> | undefined)?.visibility;
  return visibility !== "private";
}
