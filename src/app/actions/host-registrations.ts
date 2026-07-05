"use server";

/**
 * Host registration + check-in server actions (Vercel server runtime →
 * MongoDB). These replace the retired Cloudflare Worker calls the manage and
 * host-kiosk pages made through `@/lib/api`. They keep the old function names
 * so call sites just swap the import; the WorkOS session token argument is
 * gone — auth is resolved server-side here.
 *
 * Security: every mutation (approve / reject / cancel / check-in) verifies the
 * caller HOSTS the event before touching data. The acting person is resolved
 * from the WorkOS session (or the local dev bypass), and the event's
 * `primaryHostEntityId` must be among the entities that person can host
 * through. The registration read is likewise host-gated because it exposes
 * attendee PII (names + emails); the aggregate check-in stats read is left open.
 */

import { withAuth } from "@workos-inc/authkit-nextjs";
import { eventsCollection, personsCollection, rsvpsCollection } from "@/lib/mongo/databases";
import { listHostEntitiesForPerson } from "@/lib/mongo/entities";
import { isDevBypass, DEV_WORKOS_ID } from "@/lib/auth/dev";
import {
  getEventRegistrations,
  setRegistrationApproval,
  cancelRegistration,
  checkInAttendee,
  getCheckinStats,
} from "@/lib/mongo/host-registrations";
import type { PersonDoc } from "@/lib/mongo/types";
import type { CheckinStats, Registration } from "@/lib/api";

/** Resolve the acting person doc from the WorkOS session (or dev bypass). */
async function resolveActingPerson(): Promise<PersonDoc | null> {
  let workosUserId: string | null = null;
  if (isDevBypass()) {
    workosUserId = DEV_WORKOS_ID;
  } else {
    const { user } = await withAuth();
    workosUserId = user?.id ?? null;
  }
  if (!workosUserId) return null;
  const persons = await personsCollection();
  return persons.findOne({ workosUserId });
}

/**
 * Throw unless the acting person hosts `eventId`. Returns the acting person so
 * callers can attribute writes (e.g. `checkedInByPersonId`).
 */
async function requireEventHost(eventId: string): Promise<PersonDoc> {
  const person = await resolveActingPerson();
  if (!person) throw new Error("Not authorized");

  const events = await eventsCollection();
  const event = await events.findOne({ _id: eventId });
  if (!event) throw new Error("Not authorized");

  const hostEntities = await listHostEntitiesForPerson(person._id);
  if (!hostEntities.some((e) => e._id === event.primaryHostEntityId)) {
    throw new Error("Not authorized");
  }
  return person;
}

/** Resolve the rsvp's event, then enforce the host check against it. */
async function requireHostForRsvp(rsvpId: string): Promise<{ eventId: string; person: PersonDoc }> {
  const rsvps = await rsvpsCollection();
  const rsvp = await rsvps.findOne({ _id: rsvpId });
  if (!rsvp) throw new Error("Not authorized");
  const person = await requireEventHost(rsvp.eventId);
  return { eventId: rsvp.eventId, person };
}

/** Host-only: the event's registrations (attendee PII). */
export async function getEventRegistrationsAction(eventId: string): Promise<Registration[]> {
  await requireEventHost(eventId);
  return getEventRegistrations(eventId);
}

/** Host-only: approve or reject a pending registration. */
export async function updateRegistrationStatusAction(
  rsvpId: string,
  status: "approved" | "rejected",
): Promise<{ message: string }> {
  await requireHostForRsvp(rsvpId);
  await setRegistrationApproval(rsvpId, status);
  return { message: status === "approved" ? "Registration approved" : "Registration rejected" };
}

/** Host-only: cancel a registration. */
export async function cancelRegistrationAction(rsvpId: string): Promise<{ message: string }> {
  await requireHostForRsvp(rsvpId);
  await cancelRegistration(rsvpId);
  return { message: "Registration cancelled" };
}

/** Host-only: check an attendee in at the event. */
export async function checkinRegistrationAction(
  eventId: string,
  rsvpId: string,
): Promise<{ message: string; registrationId: string }> {
  const person = await requireEventHost(eventId);
  await checkInAttendee(eventId, rsvpId, person._id);
  return { message: "Checked in", registrationId: rsvpId };
}

/** Public: aggregate check-in stats for an event (no attendee PII). */
export async function getCheckinStatsAction(eventId: string): Promise<CheckinStats> {
  return getCheckinStats(eventId);
}
