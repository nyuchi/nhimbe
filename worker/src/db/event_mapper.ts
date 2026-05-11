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
}

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
    eventAttendanceMode: row.eventattendancemode ?? undefined,
    eventStatus: row.eventstatus ?? undefined,
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
  };
}

const EVENT_COLUMNS =
  "id,name,description,startdate,enddate,eventattendancemode,eventstatus,eventtype,location,organizer,organizer_person_id,offers,image,category,keywords,maximumattendeecapacity,attendee_count,visibility,slug,created_at,updated_at";

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
