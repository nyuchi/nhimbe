/**
 * Map Supabase events.event rows to the legacy nhimbe API Event shape.
 *
 * The frontend (and AI helpers) consume the legacy shape: camelCase fields,
 * nested `location`, `organizer`, `offers`, plus a derived `date` block for
 * display. The Supabase row uses schema.org-aligned snake_case columns and
 * folds location into a jsonb document.
 */

import type { Env, Event } from "../types";
import { supabaseFetch } from "./supabase";

interface SupabaseEventRow {
  id: string;
  name: string;
  description: string | null;
  startdate: string;
  enddate: string | null;
  eventattendancemode: string | null;
  eventstatus: string | null;
  eventtype: string | null;
  location: Record<string, unknown> | null;
  organizer: Record<string, unknown> | null;
  organizer_person_id: string | null;
  organization_id: string | null;
  offers: Record<string, unknown> | null;
  image: string[] | null;
  category: string | null;
  keywords: string[] | null;
  maximumattendeecapacity: number | null;
  attendee_count: number | null;
  visibility: string;
  slug: string | null;
  created_at: string | null;
  updated_at: string | null;
  /** Linked Kraal (circles.circle.id) — drives the "View kraal" CTA on EventDetail. */
  event_circle_id: string | null;
  /** schema.org/contributor jsonb — drives the "Contributions board" chips on EventDetail. */
  contributor: Record<string, unknown> | unknown[] | null;
  /** ISO 8601 duration ("PT2H") — surfaced on the "When" tile when set. */
  duration: string | null;
  /** Event timezone (defaults to UTC on insert). */
  timezone: string | null;
  /** FK to places.places — drives the "Where" tile + Weather lookup keyed on place_id. */
  place_id: string | null;
}

// The platform-db CHECK constraints on events.event require fully-qualified
// schema.org URLs for `eventstatus` and `eventattendancemode`
// (e.g. "https://schema.org/EventScheduled"). The legacy nhimbe API exposes
// short forms (e.g. "EventScheduled"). These two helpers normalise at the
// worker boundary: stripSchemaPrefix on read, addSchemaPrefix on write.
const SCHEMA_PREFIX = "https://schema.org/";
export function stripSchemaPrefix(v: string | null | undefined): string | null {
  if (!v) return null;
  return v.startsWith(SCHEMA_PREFIX) ? v.slice(SCHEMA_PREFIX.length) : v;
}
export function addSchemaPrefix(v: string | null | undefined): string | null {
  if (!v) return null;
  return v.startsWith(SCHEMA_PREFIX) ? v : SCHEMA_PREFIX + v;
}

// events.rsvp_action.rsvpresponse CHECK constraint values. Exported so every
// worker route compares against and writes the same string the DB actually
// stores. Avoid passing literal "rsvpYes"/"rsvpNo" — they fail the constraint.
export const RSVP_YES = "https://schema.org/RsvpResponseYes";
export const RSVP_NO = "https://schema.org/RsvpResponseNo";
export const RSVP_MAYBE = "https://schema.org/RsvpResponseMaybe";

function formatDateFragments(startdate: string) {
  const d = new Date(startdate);
  if (isNaN(d.getTime())) {
    return { day: "", month: "", full: startdate, time: "" };
  }
  return {
    day: String(d.getUTCDate()),
    month: d.toLocaleString("en-US", { month: "short", timeZone: "UTC" }),
    full: d.toLocaleString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    }),
    time: d.toLocaleString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: "UTC",
    }),
  };
}

export function mapSupabaseEventToApi(row: SupabaseEventRow): Event {
  const loc = (row.location ?? {}) as Record<string, unknown>;
  const org = (row.organizer ?? {}) as Record<string, unknown>;
  const off = (row.offers ?? null) as Record<string, unknown> | null;

  return {
    id: row.id,
    shortCode: (row.slug ?? row.id).slice(0, 8),
    slug: row.slug ?? row.id,
    name: row.name,
    description: row.description ?? "",
    startDate: row.startdate,
    endDate: row.enddate ?? undefined,
    date: formatDateFragments(row.startdate),
    location: {
      type: (loc["@type"] as string) ?? "Place",
      name: (loc.name as string) ?? "",
      streetAddress: (loc.streetaddress as string | undefined) ?? undefined,
      addressLocality: (loc.addresslocality as string) ?? "",
      addressCountry: (loc.addresscountry as string) ?? "",
      url: (loc.url as string | undefined) ?? undefined,
    },
    category: row.category ?? "",
    keywords: row.keywords ?? [],
    image: (row.image && row.image[0]) || undefined,
    attendeeCount: row.attendee_count ?? 0,
    maximumAttendeeCapacity: row.maximumattendeecapacity ?? undefined,
    eventAttendanceMode: stripSchemaPrefix(row.eventattendancemode) ?? undefined,
    eventStatus: stripSchemaPrefix(row.eventstatus) ?? undefined,
    isPublished: row.visibility === "public",
    organizer: {
      name: (org.name as string) ?? "",
      alternateName: (org.alternatename as string | undefined) ?? undefined,
      initials: (org.initials as string | undefined) ?? "",
      identifier: row.organizer_person_id ?? undefined,
      eventCount: (org.eventcount as number | undefined) ?? 0,
    },
    offers: off
      ? {
          price: off.price as number | undefined,
          priceCurrency: off.pricecurrency as string | undefined,
          url: off.url as string | undefined,
          availability: off.availability as string | undefined,
        }
      : undefined,
    dateCreated: row.created_at ?? undefined,
    dateModified: row.updated_at ?? undefined,
    // New design surfaces — opt-in fields that EventDetail uses for the
    // 3-up info tiles + host card branching + Kraal CTA + contributions.
    placeId: row.place_id ?? undefined,
    organizationId: row.organization_id ?? undefined,
    eventCircleId: row.event_circle_id ?? undefined,
    duration: row.duration ?? undefined,
    timezone: row.timezone ?? undefined,
    contributor: row.contributor ?? undefined,
  };
}

const EVENT_COLUMNS =
  "id,name,description,startdate,enddate,eventattendancemode,eventstatus,eventtype,location,organizer,organizer_person_id,organization_id,offers,image,category,keywords,maximumattendeecapacity,attendee_count,visibility,slug,created_at,updated_at,event_circle_id,contributor,duration,timezone,place_id";

/**
 * Fetch events by id from Supabase. Returns events in API shape, preserving
 * the order of the input id list (for vector-search relevance preservation).
 */
export async function fetchEventsByIds(env: Env, ids: string[]): Promise<Event[]> {
  if (ids.length === 0) return [];
  const filter = `id=in.(${ids.map(encodeURIComponent).join(",")})`;
  const rows = await supabaseFetch<SupabaseEventRow[]>(env, {
    schema: "events",
    path: "event",
    query: `${filter}&select=${EVENT_COLUMNS}`,
  });
  const byId = new Map((rows ?? []).map((r) => [r.id, mapSupabaseEventToApi(r)]));
  return ids.map((id) => byId.get(id)).filter((e): e is Event => !!e);
}

export type { SupabaseEventRow };
export { EVENT_COLUMNS };
