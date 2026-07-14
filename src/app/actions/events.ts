"use server";

/**
 * Event write server actions (Vercel server runtime → MongoDB).
 *
 * `createEvent` replaces the old fragile dual path (direct Supabase upsert with
 * a worker fallback). It resolves the signed-in person via AuthKit, ensures
 * they have a host entity to act through (Rule 10), and inserts a single
 * v3.1 `events.events` document.
 *
 * The core write logic is factored into `createEventForPerson` /
 * `updateEventForPerson`, which take an already-resolved person. The cookie
 * session actions resolve identity via AuthKit; the MCP write endpoints
 * (`POST/PATCH /api/events`) resolve it from a WorkOS bearer token. Both then
 * share one authorization + persistence path.
 */

import { withAuth } from "@workos-inc/authkit-nextjs";
import { eventsCollection, personsCollection } from "@/lib/mongo/databases";
import { newId, slugify, stampNew } from "@/lib/mongo/ids";
import { ensureHostEntityForPerson, getEntityById, listHostEntitiesForPerson } from "@/lib/mongo/entities";
import { attachEventToCalendar, getCalendarById } from "@/lib/mongo/calendars";
import { indexEventEmbedding } from "@/lib/ai/event-index";
import { syncPersonFromWorkos, type SyncPersonInput } from "@/lib/mongo/users";
import { mapEventDocToApi } from "@/lib/mongo/mappers";
import { isDevBypass, DEV_WORKOS_ID, DEV_EMAIL, DEV_NAME } from "@/lib/auth/dev";
import type { EventDoc, PersonDoc } from "@/lib/mongo/types";
import type { Event } from "@/lib/api";

const MAX_NAME_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 5000;

/** http(s)-only URL check — rejects javascript:, data:, and malformed URLs. */
function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

export interface CreateEventActionInput {
  name: string;
  description: string;
  /** ISO 8601 start instant. */
  startDate: string;
  /** ISO 8601 end instant; defaults to start + 1h when omitted. */
  endDate?: string | null;
  category?: string | null;
  keywords?: string[];
  /** Uploaded cover image URL, if any. */
  image?: string | null;
  /** Fallback gradient id/value when there's no cover image. */
  coverGradient?: string | null;
  isOnline: boolean;
  venue?: string;
  streetAddress?: string;
  addressLocality?: string;
  addressCountry?: string;
  meetingUrl?: string | null;
  meetingPlatform?: string | null;
  maximumAttendeeCapacity?: number | null;
  isFree: boolean;
  ticketUrl?: string | null;
  visibility: "public" | "private";
  requiresApproval?: boolean;
  hostMode: "person" | "organization" | "family";
  hostEntityId?: string | null;
  /** Stream the event into one of the HOST'S OWN calendars (NYU-25). */
  calendarId?: string | null;
}

export interface CreateEventResult {
  id: string;
  event: Event;
}

/** Resolve (and lazily sync) the person doc for a WorkOS identity. */
async function resolvePerson(syncInput: SyncPersonInput): Promise<PersonDoc> {
  const persons = await personsCollection();
  let person = await persons.findOne({ workosUserId: syncInput.workosUserId });
  if (!person) {
    await syncPersonFromWorkos(syncInput);
    person = await persons.findOne({ workosUserId: syncInput.workosUserId });
  }
  if (!person) throw new Error("Could not resolve your account. Please try again.");
  return person;
}

export async function createEvent(input: CreateEventActionInput): Promise<CreateEventResult> {
  // Resolve the acting identity: WorkOS session, or the local dev bypass.
  let syncInput: SyncPersonInput;
  if (isDevBypass()) {
    syncInput = { workosUserId: DEV_WORKOS_ID, email: DEV_EMAIL, name: DEV_NAME, emailVerified: true };
  } else {
    const { user } = await withAuth();
    if (!user) throw new Error("You must be signed in to create an event.");
    syncInput = {
      workosUserId: user.id,
      email: user.email ?? null,
      name: [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || null,
      givenName: user.firstName ?? null,
      familyName: user.lastName ?? null,
      picture: user.profilePictureUrl ?? null,
      emailVerified: user.emailVerified ?? undefined,
    };
  }

  const person = await resolvePerson(syncInput);
  return createEventForPerson(person, input);
}

/**
 * Core create logic, given an already-resolved person. Shared by the
 * `createEvent` server action (cookie session) and the MCP write endpoint
 * `POST /api/events` (bearer token). Validates, resolves the host entity
 * (Rule 10), inserts the v3.1 event, and indexes it for semantic search.
 */
export async function createEventForPerson(
  person: PersonDoc,
  input: CreateEventActionInput,
): Promise<CreateEventResult> {
  // Server-side validation. The form validates too, but this path is
  // network-callable (server action + MCP endpoint) — never trust the client.
  const name = input.name?.trim() ?? "";
  if (!name) throw new Error("Event name is required.");
  if (name.length > MAX_NAME_LENGTH) {
    throw new Error(`Event name must be ${MAX_NAME_LENGTH} characters or fewer.`);
  }
  if ((input.description?.length ?? 0) > MAX_DESCRIPTION_LENGTH) {
    throw new Error(`Description must be ${MAX_DESCRIPTION_LENGTH} characters or fewer.`);
  }
  if (!input.startDate) throw new Error("A start date is required.");
  if (input.maximumAttendeeCapacity != null && input.maximumAttendeeCapacity < 1) {
    throw new Error("Capacity must be at least 1 attendee.");
  }
  if (input.isOnline && input.meetingUrl && !isHttpUrl(input.meetingUrl)) {
    throw new Error("The meeting URL must be a valid http(s) link.");
  }
  if (input.ticketUrl && !isHttpUrl(input.ticketUrl)) {
    throw new Error("The ticket URL must be a valid http(s) link.");
  }
  if ((input.hostMode === "organization" || input.hostMode === "family") && !input.hostEntityId) {
    throw new Error(`Pick which ${input.hostMode} is hosting, or switch back to a personal host.`);
  }

  // Optional calendar attach (NYU-25): a host may only stream an event into
  // one of THEIR OWN calendars. Validate before the insert so a bad id fails
  // early instead of leaving a half-attached event.
  if (input.calendarId) {
    const calendar = await getCalendarById(input.calendarId);
    if (!calendar || calendar.ownerPersonId !== person._id) {
      throw new Error("You can only add events to your own calendars.");
    }
  }

  // Resolve the host entity: an explicitly picked org/family, else the
  // person's (lazily created) default host entity.
  const primaryHostEntityId =
    (input.hostMode === "organization" || input.hostMode === "family") && input.hostEntityId
      ? input.hostEntityId
      : await ensureHostEntityForPerson(person);

  const start = new Date(input.startDate);
  if (Number.isNaN(start.getTime())) throw new Error("The start date is invalid.");
  let end = input.endDate ? new Date(input.endDate) : new Date(start.getTime() + 60 * 60 * 1000);
  if (Number.isNaN(end.getTime()) || end <= start) {
    // Match the form's "end after start" rule; degrade odd input to start + 1h.
    end = new Date(start.getTime() + 60 * 60 * 1000);
  }

  const id = newId();
  const location = input.isOnline
    ? {
        "@type": "VirtualLocation",
        name: "Online",
        url: input.meetingUrl ?? undefined,
        platform: input.meetingPlatform ?? undefined,
      }
    : {
        "@type": "Place",
        name: input.venue ?? "",
        address: {
          "@type": "PostalAddress",
          streetAddress: input.streetAddress ?? "",
          addressLocality: input.addressLocality ?? "",
          addressCountry: input.addressCountry ?? "",
        },
      };

  const offers =
    !input.isFree && input.ticketUrl
      ? [{ "@type": "Offer", url: input.ticketUrl, availability: "https://schema.org/InStock" }]
      : [];

  // The chosen category leads the tags array so the tag-based category filter
  // in listEvents and the display mapper agree with the user's selection.
  const tags = [
    ...(input.category ? [input.category] : []),
    ...(input.keywords ?? []).filter((k) => k !== input.category),
  ];

  const doc: EventDoc = {
    ...stampNew(id),
    iCalUid: `${id}@nhimbe.com`,
    slug: slugify(name),
    name,
    description: input.description?.trim() || null,
    schemaOrgType: "SocialEvent",
    attendanceMode: input.isOnline ? "OnlineEventAttendanceMode" : "OfflineEventAttendanceMode",
    eventStatus: "EventScheduled",
    status: "published",
    startDate: start,
    endDate: end,
    primaryHostEntityId,
    hostEntityIds: [primaryHostEntityId],
    isAccessibleForFree: input.isFree,
    totalAttendeeCount: 0,
    surfaceContext: "mukoko_events",
    location,
    placeId: null,
    circleId: null,
    calendarId: null,
    offers,
    image: input.image ? [input.image] : [],
    tags,
    inLanguage: "en",
    maximumAttendeeCapacity: input.maximumAttendeeCapacity ?? null,
    // nhimbe-specific metadata not in the canonical schema lives under `mukoko`.
    mukoko: {
      visibility: input.visibility,
      requiresApproval: Boolean(input.requiresApproval),
      coverGradient: input.coverGradient ?? null,
      category: input.category ?? null,
    },
  } as EventDoc;

  const col = await eventsCollection();
  await col.insertOne(doc);

  // Attach to the chosen calendar (sets events.events.calendarId and keeps
  // the calendar's denormalized eventCount honest). Ownership was validated
  // above, before the insert.
  if (input.calendarId) {
    await attachEventToCalendar(id, input.calendarId);
    doc.calendarId = input.calendarId;
  }

  // Index the event for semantic search (Atlas Vector Search). Best-effort and
  // awaited so the embedding exists by the time the create flow returns, but a
  // failure never blocks event creation — indexEventEmbedding swallows errors.
  await indexEventEmbedding(doc);

  // Resolve the host entity for the response so the organizer block matches
  // what list/detail reads will show (entity name, not the person's name).
  const hostEntity = await getEntityById(primaryHostEntityId);
  return { id, event: mapEventDocToApi(doc, { hostEntity, hostPerson: person }) };
}

export interface UpdateEventInput {
  name?: string;
  description?: string | null;
  /** ISO 8601 start instant. */
  startDate?: string;
  /** ISO 8601 end instant. */
  endDate?: string;
  /** Lifecycle change — e.g. "cancelled" to cancel the event. */
  status?: "published" | "cancelled" | "draft";
}

/**
 * Update/manage an existing event, given an already-resolved person. HOST-GATED
 * (Rule 10): `person` must host through the entity that owns the event. Shared
 * by the MCP write endpoint `PATCH /api/events/:id`.
 */
export async function updateEventForPerson(
  person: PersonDoc,
  eventId: string,
  patch: UpdateEventInput,
): Promise<CreateEventResult> {
  const events = await eventsCollection();
  const event = await events.findOne({ _id: eventId });
  if (!event) throw new Error("That event could not be found.");

  const hostEntities = await listHostEntitiesForPerson(person._id);
  const canHost = hostEntities.some((e) => e._id === event.primaryHostEntityId);
  if (!canHost) throw new Error("You are not a host of this event.");

  const set: Record<string, unknown> = { updatedAt: new Date() };
  let contentChanged = false;

  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) throw new Error("Event name cannot be empty.");
    if (name.length > MAX_NAME_LENGTH) {
      throw new Error(`Event name must be ${MAX_NAME_LENGTH} characters or fewer.`);
    }
    set.name = name;
    set.slug = slugify(name);
    contentChanged = true;
  }
  if (patch.description !== undefined) {
    if ((patch.description?.length ?? 0) > MAX_DESCRIPTION_LENGTH) {
      throw new Error(`Description must be ${MAX_DESCRIPTION_LENGTH} characters or fewer.`);
    }
    set.description = patch.description?.trim() || null;
    contentChanged = true;
  }
  if (patch.startDate !== undefined) {
    const start = new Date(patch.startDate);
    if (Number.isNaN(start.getTime())) throw new Error("The start date is invalid.");
    set.startDate = start;
  }
  if (patch.endDate !== undefined) {
    const end = new Date(patch.endDate);
    if (Number.isNaN(end.getTime())) throw new Error("The end date is invalid.");
    set.endDate = end;
  }
  if (patch.status !== undefined) {
    set.status = patch.status;
    set.eventStatus = patch.status === "cancelled" ? "EventCancelled" : "EventScheduled";
  }

  await events.updateOne({ _id: eventId }, { $set: set });
  const updated = await events.findOne({ _id: eventId });
  if (!updated) throw new Error("The event could not be reloaded after updating.");

  // Re-index for search only when searchable content changed (best-effort).
  if (contentChanged) await indexEventEmbedding(updated);

  const hostEntity = await getEntityById(updated.primaryHostEntityId);
  return { id: updated._id, event: mapEventDocToApi(updated, { hostEntity, hostPerson: person }) };
}
