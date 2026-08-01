/**
 * Mappers: Mukoko v3.1 MongoDB documents → nhimbe API/UI shapes.
 *
 * These are PURE functions. They take an already-fetched event document plus
 * any already-resolved related documents (host entity, host person, venue
 * place) and produce the legacy `Event` shape the frontend consumes. The
 * cross-database fan-out that fetches those related docs lives in the data
 * modules (server actions / route handlers), not here — keeping the mappers
 * trivially unit-testable against the empty cluster.
 *
 * The big model shift encoded here is ENTITY-CENTRIC hosting: a v3.1 event
 * references `entity.entities` via `primaryHostEntityId`, and the human behind
 * the entity is resolved through `entity.memberships` → `identity.persons`.
 * The legacy `Event.organizer` block is reconstructed from those.
 */

import type { Event, EventLocation, EventOffers, EventOrganizer } from "@/lib/api";
import { getInitials } from "@/lib/avatar-initials";
import type { EntityDoc, EventDoc, PersonDoc, PlaceDoc } from "./types";

/** Related documents resolved by the caller before mapping. All optional. */
export interface EventRelations {
  /** Primary host entity (entity.entities), resolved from primaryHostEntityId. */
  hostEntity?: EntityDoc | null;
  /** A person to attribute the host to (e.g. founder, or an admin membership). */
  hostPerson?: PersonDoc | null;
  /** Venue (places.places), resolved from placeId. */
  place?: PlaceDoc | null;
  /** Count of events the host entity has run, if the caller computed it. */
  hostEventCount?: number;
  /** Friends-of-viewer count, if computed for the signed-in person. */
  friendsCount?: number;
}

/** Human-readable date fragments for display tiles. UTC-based, matching the
 * legacy worker mapper so existing UI rendering is unchanged. */
function formatDateFragments(date: Date): Event["date"] {
  if (Number.isNaN(date.getTime())) {
    return { day: "", month: "", full: "", time: "" };
  }
  return {
    day: String(date.getUTCDate()),
    // British (en-GB) formatting: day-before-month long dates ("Monday 3 August
    // 2026") and 24-hour times ("19:00"), not the American "August 3, 2026" /
    // "7:00 PM" order.
    month: date.toLocaleString("en-GB", { month: "short", timeZone: "UTC" }),
    full: date.toLocaleString("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }),
    time: date.toLocaleString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" }),
  };
}

/** Initials from a display name — first letters of up to two words, uppercased. */
export function initialsFromName(name: string | null | undefined): string {
  return getInitials(name);
}

/** Map the embedded schema.org Place (or a resolved PlaceDoc) to EventLocation. */
function mapLocation(doc: EventDoc, place?: PlaceDoc | null): EventLocation {
  // Prefer the richer joined place document when present, else fall back to
  // the location object embedded on the event doc.
  if (place) {
    const addr = (place.address ?? {}) as Record<string, unknown>;
    return {
      type: "Place",
      name: place.name ?? "",
      streetAddress: (addr.streetAddress as string | undefined) ?? undefined,
      addressLocality: (addr.addressLocality as string) ?? "",
      addressCountry: (addr.addressCountry as string) ?? "",
      url: place.url ?? undefined,
    };
  }
  const loc = (doc.location ?? {}) as Record<string, unknown>;
  const addr = (loc.address ?? {}) as Record<string, unknown>;
  return {
    type: (loc["@type"] as string) ?? "Place",
    name: (loc.name as string) ?? "",
    streetAddress:
      (addr.streetAddress as string | undefined) ??
      (loc.streetAddress as string | undefined) ??
      undefined,
    addressLocality:
      (addr.addressLocality as string) ?? (loc.addressLocality as string) ?? "",
    addressCountry: (addr.addressCountry as string) ?? (loc.addressCountry as string) ?? "",
    url: (loc.url as string | undefined) ?? undefined,
  };
}

/** Reconstruct the legacy organizer block from the entity-centric host model. */
export function mapOrganizer(relations: EventRelations): EventOrganizer {
  const entity = relations.hostEntity;
  const person = relations.hostPerson;
  // Display name preference: the host entity's name (the public-facing host),
  // falling back to the attributed person's name.
  const name = entity?.name ?? person?.name ?? "";
  return {
    name,
    alternateName: entity?.alternateName ?? person?.preferredUsername ?? undefined,
    initials: initialsFromName(name),
    identifier: entity?.slug ?? entity?._id ?? person?._id ?? undefined,
    eventCount: relations.hostEventCount ?? 0,
  };
}

/** Map the first schema.org Offer (v3.1 events embed an offers[] array). */
function mapOffers(doc: EventDoc): EventOffers | undefined {
  const first = Array.isArray(doc.offers) ? (doc.offers[0] as Record<string, unknown>) : null;
  if (!first) {
    // No offers array — still surface free/paid intent from isAccessibleForFree.
    return doc.isAccessibleForFree ? { price: 0 } : undefined;
  }
  return {
    price: first.price as number | undefined,
    priceCurrency: first.priceCurrency as string | undefined,
    url: first.url as string | undefined,
    availability: first.availability as string | undefined,
  };
}

/** First image URL from the embedded image[] array (strings or MediaObjects). */
function firstImage(doc: EventDoc): string | undefined {
  const arr = doc.image;
  if (!Array.isArray(arr) || arr.length === 0) return undefined;
  const first = arr[0];
  if (typeof first === "string") return first;
  if (first && typeof first === "object") {
    const obj = first as Record<string, unknown>;
    return (obj.url as string | undefined) ?? (obj.contentUrl as string | undefined) ?? undefined;
  }
  return undefined;
}

/** A v3.1 event is publicly visible once it's published or live. */
function isPublished(doc: EventDoc): boolean {
  return doc.status === "published" || doc.status === "live";
}

/** nhimbe-specific metadata stored under the event doc's free-form `mukoko` bag. */
function mukokoMeta(doc: EventDoc): Record<string, unknown> {
  return (doc.mukoko ?? {}) as Record<string, unknown>;
}

/** Derive the display category: the explicitly chosen category first, else the
 * first tag (matches listEvents' tag-based category filter, which createEvent
 * keeps consistent by writing the category into tags as well). */
function deriveCategory(doc: EventDoc): string {
  const chosen = mukokoMeta(doc).category;
  if (typeof chosen === "string" && chosen) return chosen;
  const tags = doc.tags;
  if (Array.isArray(tags) && tags.length > 0 && typeof tags[0] === "string") {
    return tags[0] as string;
  }
  return doc.schemaOrgType ?? "";
}

/** Keyword strings from the embedded tags[] array. */
function deriveKeywords(doc: EventDoc): string[] {
  const tags = doc.tags;
  if (!Array.isArray(tags)) return [];
  return tags.filter((t): t is string => typeof t === "string");
}

/**
 * Map a v3.1 event document to the legacy `Event` API shape. Pass any
 * already-resolved related documents in `relations`; omit them for a bare
 * mapping (organizer/location then fall back to the event doc's own fields).
 */
export function mapEventDocToApi(doc: EventDoc, relations: EventRelations = {}): Event {
  const start = doc.startDate instanceof Date ? doc.startDate : new Date(doc.startDate);
  const end = doc.endDate instanceof Date ? doc.endDate : doc.endDate ? new Date(doc.endDate) : undefined;
  const meta = mukokoMeta(doc);
  const loc = (doc.location ?? {}) as Record<string, unknown>;
  const isVirtual = loc["@type"] === "VirtualLocation";

  return {
    id: doc._id,
    // Prefer the stored short share code (mukoko.shortCode, written at creation);
    // fall back to a slug/id slice for legacy events created before it existed.
    shortCode: (meta.shortCode as string | undefined) ?? (doc.slug ?? doc._id).slice(0, 8),
    slug: doc.slug ?? doc._id,
    name: doc.name,
    description: doc.description ?? "",
    startDate: start.toISOString(),
    endDate: end?.toISOString(),
    date: formatDateFragments(start),
    location: mapLocation(doc, relations.place),
    category: deriveCategory(doc),
    keywords: deriveKeywords(doc),
    image: firstImage(doc),
    attendeeCount: doc.totalAttendeeCount ?? 0,
    friendsCount: relations.friendsCount,
    maximumAttendeeCapacity: doc.maximumAttendeeCapacity ?? undefined,
    eventAttendanceMode: doc.attendanceMode ?? undefined,
    eventStatus: doc.eventStatus ?? undefined,
    isPublished: isPublished(doc),
    // Online events embed the meeting link in the VirtualLocation — surface it
    // so the detail page's Join button renders.
    meetingUrl: isVirtual ? ((loc.url as string | undefined) ?? undefined) : undefined,
    meetingPlatform: isVirtual ? ((loc.platform as string | undefined) ?? undefined) : undefined,
    // Theme gradient chosen at creation (only when there's no cover photo).
    coverGradient: (meta.coverGradient as string | undefined) ?? undefined,
    organizer: mapOrganizer(relations),
    offers: mapOffers(doc),
    placeId: doc.placeId ?? undefined,
    eventCircleId: doc.circleId ?? undefined,
    timezone: (doc.location as Record<string, unknown> | null | undefined)?.timezone as
      | string
      | undefined,
    dateCreated: doc.createdAt?.toISOString?.() ?? undefined,
    dateModified: doc.updatedAt?.toISOString?.() ?? undefined,
  };
}
