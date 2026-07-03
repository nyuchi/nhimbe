"use server";

/**
 * "My Events" read server action (Vercel server runtime → MongoDB).
 *
 * Replaces the two worker-era calls the my-events page used to make
 * (`getEvents({limit:100})` + `getUserRegistrations`, the latter a 404 now that
 * the worker is retired) plus the brittle "hosting = organizer name matches my
 * name" heuristic. Instead it reads Mongo directly:
 *   - attending → the person's YES rsvps (events.rsvps.attendeePersonId)
 *   - hosting   → events whose primaryHostEntityId is one of the person's host
 *                 entities (entity.memberships), the authoritative signal
 * and splits each into upcoming vs past by startDate.
 */

import { withAuth } from "@workos-inc/authkit-nextjs";
import { eventsCollection, personsCollection, rsvpsCollection } from "@/lib/mongo/databases";
import { listHostEntitiesForPerson } from "@/lib/mongo/entities";
import { getEventsByIds } from "@/lib/mongo/events";
import { isDevBypass, DEV_WORKOS_ID } from "@/lib/auth/dev";
import type { Event } from "@/lib/api";

export interface MyEventsResult {
  attending: Event[];
  hosting: Event[];
  past: Event[];
}

const EMPTY: MyEventsResult = { attending: [], hosting: [], past: [] };

export async function getMyEvents(): Promise<MyEventsResult> {
  // Resolve the acting WorkOS id (session or local dev bypass). No sync here —
  // if the person doesn't exist yet they simply have no events.
  let workosUserId: string | null = null;
  if (isDevBypass()) {
    workosUserId = DEV_WORKOS_ID;
  } else {
    try {
      const { user } = await withAuth();
      workosUserId = user?.id ?? null;
    } catch {
      return EMPTY;
    }
  }
  if (!workosUserId) return EMPTY;

  const persons = await personsCollection();
  const person = await persons.findOne({ workosUserId });
  if (!person) return EMPTY;

  // Attending: the events this person has RSVP'd YES to.
  const rsvps = await rsvpsCollection();
  const myRsvps = await rsvps
    .find({ attendeePersonId: person._id, rsvpResponse: "RsvpResponseYes" })
    .toArray();
  const attendingIds = [...new Set(myRsvps.map((r) => r.eventId))];

  // Hosting: events fronted by any entity this person hosts through.
  const hostEntities = await listHostEntitiesForPerson(person._id);
  const hostEntityIds = hostEntities.map((e) => e._id);
  let hostingIds: string[] = [];
  if (hostEntityIds.length) {
    const events = await eventsCollection();
    const docs = await events
      .find({ primaryHostEntityId: { $in: hostEntityIds } })
      .project({ _id: 1 })
      .toArray();
    hostingIds = docs.map((d) => d._id as string);
  }

  const [attendingEvents, hostingEvents] = await Promise.all([
    getEventsByIds(attendingIds),
    getEventsByIds(hostingIds),
  ]);

  const now = Date.now();
  const isUpcoming = (e: Event) => new Date(e.startDate).getTime() >= now;
  const hostingIdSet = new Set(hostingEvents.map((e) => e.id));

  // Past = anything (attended or hosted) that has already started, de-duped.
  const pastById = new Map<string, Event>();
  for (const e of [...attendingEvents, ...hostingEvents]) {
    if (!isUpcoming(e)) pastById.set(e.id, e);
  }

  return {
    // Don't double-list an event you're both hosting and attending under both.
    attending: attendingEvents.filter((e) => isUpcoming(e) && !hostingIdSet.has(e.id)),
    hosting: hostingEvents.filter(isUpcoming),
    past: [...pastById.values()],
  };
}
