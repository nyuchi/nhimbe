"use server";

/**
 * Event write server actions (Vercel server runtime → MongoDB).
 *
 * `createEvent` replaces the old fragile dual path (direct Supabase upsert with
 * a worker fallback). It resolves the signed-in person via AuthKit, ensures
 * they have a host entity to act through (Rule 10), and inserts a single
 * v3.1 `events.events` document.
 */

import { withAuth } from "@workos-inc/authkit-nextjs";
import { eventsCollection, personsCollection } from "@/lib/mongo/databases";
import { newId, slugify, stampNew } from "@/lib/mongo/ids";
import { ensureHostEntityForPerson } from "@/lib/mongo/entities";
import { syncPersonFromWorkos } from "@/lib/mongo/users";
import { mapEventDocToApi } from "@/lib/mongo/mappers";
import type { EventDoc } from "@/lib/mongo/types";
import type { Event } from "@/lib/api";

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
}

export interface CreateEventResult {
  id: string;
  event: Event;
}

export async function createEvent(input: CreateEventActionInput): Promise<CreateEventResult> {
  const { user } = await withAuth();
  if (!user) throw new Error("You must be signed in to create an event.");

  if (!input.name?.trim()) throw new Error("Event name is required.");
  if (!input.startDate) throw new Error("A start date is required.");

  // Resolve the person doc (ensure it exists; sync is idempotent).
  const persons = await personsCollection();
  let person = await persons.findOne({ workosUserId: user.id });
  if (!person) {
    await syncPersonFromWorkos({
      workosUserId: user.id,
      email: user.email ?? null,
      name: [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || null,
      givenName: user.firstName ?? null,
      familyName: user.lastName ?? null,
      picture: user.profilePictureUrl ?? null,
      emailVerified: user.emailVerified ?? undefined,
    });
    person = await persons.findOne({ workosUserId: user.id });
  }
  if (!person) throw new Error("Could not resolve your account. Please try again.");

  // Resolve the host entity: an explicitly picked org/family, else the
  // person's (lazily created) default host entity.
  const primaryHostEntityId =
    (input.hostMode === "organization" || input.hostMode === "family") && input.hostEntityId
      ? input.hostEntityId
      : await ensureHostEntityForPerson(person);

  const start = new Date(input.startDate);
  if (Number.isNaN(start.getTime())) throw new Error("The start date is invalid.");
  const end = input.endDate ? new Date(input.endDate) : new Date(start.getTime() + 60 * 60 * 1000);

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

  const doc: EventDoc = {
    ...stampNew(id),
    iCalUid: `${id}@nhimbe.com`,
    slug: slugify(input.name),
    name: input.name.trim(),
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
    offers,
    image: input.image ? [input.image] : [],
    tags: input.keywords ?? [],
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

  return { id, event: mapEventDocToApi(doc, { hostEntity: null, hostPerson: person }) };
}
