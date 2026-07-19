"use server";

/**
 * RSVP / registration write server action (Vercel server runtime → MongoDB).
 *
 * `rsvpToEvent` replaces the old worker `registerForEvent` REST call. It runs
 * on the server so the browser never touches Mongo, resolving the acting person
 * via AuthKit `withAuth()` (or the local dev bypass).
 *
 * Capacity is enforced atomically. `events.events.remainingAttendeeCapacity`
 * is decremented with a single `findOneAndUpdate` guarded by
 * `remainingAttendeeCapacity: { $gt: 0 }`. Because the read-and-write happen in
 * one Mongo operation, two concurrent RSVPs can't both claim the last seat —
 * the second sees no matching doc and is rejected. Uncapped events
 * (`remainingAttendeeCapacity` null/absent) skip the decrement entirely.
 */

import { withAuth } from "@workos-inc/authkit-nextjs";
import { eventsCollection, personsCollection, rsvpsCollection } from "@/lib/mongo/databases";
import { stampNew } from "@/lib/mongo/ids";
import {
  rsvpResponseToReservationStatus,
  writeThroughReservation,
} from "@/lib/mongo/planner";
import { ensureHostEntityForPerson, getHostContactForEntity } from "@/lib/mongo/entities";
import { syncPersonFromWorkos, type SyncPersonInput } from "@/lib/mongo/users";
import { sendEmail } from "@/lib/email/resend";
import { hostNewRegistration, registrationConfirmed } from "@/lib/email/templates";
import { isDevBypass, DEV_WORKOS_ID, DEV_EMAIL, DEV_NAME } from "@/lib/auth/dev";
import type { PersonDoc, RsvpDoc } from "@/lib/mongo/types";

const MAX_ADDITIONAL_GUESTS = 20;

export interface RsvpActionInput {
  eventId: string;
  /** Extra guests the attendee is bringing (defaults to 0). */
  additionalGuests?: number;
  notes?: string | null;
  /** Host-update subscription for this event (defaults to true; the person's
   *  global preference still gates delivery). */
  subscribeToUpdates?: boolean;
}

export interface RsvpActionResult {
  /** True when a new RSVP was created; false when one already existed. */
  registered: boolean;
  /** True when the attendee already had an RSVP for this event. */
  alreadyRegistered: boolean;
}

/** Resolve the acting person doc (WorkOS session or dev bypass), syncing if new. */
async function resolveActingPerson(): Promise<PersonDoc> {
  let syncInput: SyncPersonInput;
  if (isDevBypass()) {
    syncInput = { workosUserId: DEV_WORKOS_ID, email: DEV_EMAIL, name: DEV_NAME, emailVerified: true };
  } else {
    const { user } = await withAuth();
    if (!user) throw new Error("You must be signed in to RSVP.");
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

  const persons = await personsCollection();
  let person = await persons.findOne({ workosUserId: syncInput.workosUserId });
  if (!person) {
    await syncPersonFromWorkos(syncInput);
    person = await persons.findOne({ workosUserId: syncInput.workosUserId });
  }
  if (!person) throw new Error("Could not resolve your account. Please try again.");
  return person;
}

export async function rsvpToEvent(input: RsvpActionInput): Promise<RsvpActionResult> {
  const eventId = input.eventId?.trim();
  if (!eventId) throw new Error("An event id is required.");

  const additionalGuests = Math.max(0, Math.trunc(input.additionalGuests ?? 0));
  if (additionalGuests > MAX_ADDITIONAL_GUESTS) {
    throw new Error(`You can bring at most ${MAX_ADDITIONAL_GUESTS} additional guests.`);
  }
  // Each RSVP consumes one seat for the attendee plus one per additional guest.
  const seats = 1 + additionalGuests;

  const person = await resolveActingPerson();

  const events = await eventsCollection();
  const event = await events.findOne({ _id: eventId });
  if (!event) throw new Error("That event could not be found.");
  if (event.status !== "published" && event.status !== "live") {
    throw new Error("Registration for this event is closed.");
  }

  // Idempotency: if this person already has an RSVP, don't double-book seats.
  const rsvps = await rsvpsCollection();
  const existing = await rsvps.findOne({ eventId, attendeePersonId: person._id });
  if (existing) {
    return { registered: false, alreadyRegistered: true };
  }

  // Atomic capacity claim. Only attempt the decrement when the event is capped
  // (remainingAttendeeCapacity is a number). The guard ensures enough seats
  // remain; a losing concurrent request matches nothing and is rejected.
  const isCapped = typeof event.remainingAttendeeCapacity === "number";
  if (isCapped) {
    const claimed = await events.findOneAndUpdate(
      { _id: eventId, remainingAttendeeCapacity: { $gte: seats } },
      {
        $inc: { remainingAttendeeCapacity: -seats, totalAttendeeCount: seats },
        $set: { updatedAt: new Date() },
      },
      { returnDocument: "after" },
    );
    if (!claimed) {
      throw new Error("This event is full.");
    }
  } else {
    // Uncapped: just track the headcount.
    await events.updateOne(
      { _id: eventId },
      { $inc: { totalAttendeeCount: seats }, $set: { updatedAt: new Date() } },
    );
  }

  // Resolve the entity the attendee acts through (Rule 10: entity-centric).
  const attendeeEntityId = await ensureHostEntityForPerson(person);

  const doc: RsvpDoc = {
    ...stampNew(),
    eventId,
    attendeePersonId: person._id,
    attendeeEntityId,
    rsvpResponse: "RsvpResponseYes",
    additionalGuests,
    respondedAt: new Date(),
    notes: input.notes?.trim() || null,
    subscribedToUpdates: input.subscribeToUpdates !== false,
  };

  try {
    await rsvps.insertOne(doc);
  } catch (err) {
    // The insert failed after we claimed seats — release them so the count
    // doesn't drift. (Most likely a duplicate-key race on a per-event/person
    // unique index, in which case the attendee is in fact registered.)
    if (isCapped) {
      await events.updateOne(
        { _id: eventId },
        {
          $inc: { remainingAttendeeCapacity: seats, totalAttendeeCount: -seats },
          $set: { updatedAt: new Date() },
        },
      );
    } else {
      await events.updateOne(
        { _id: eventId },
        { $inc: { totalAttendeeCount: -seats }, $set: { updatedAt: new Date() } },
      );
    }
    const racedExisting = await rsvps.findOne({ eventId, attendeePersonId: person._id });
    if (racedExisting) return { registered: false, alreadyRegistered: true };
    throw err;
  }

  // Cross-product write-through (NYU-26): mirror the RSVP into the Mukoko
  // Planner (planner.reservations, keyed by the event's iCalUid) so the event
  // appears in the attendee's super-app Planner. Best-effort AFTER the primary
  // write succeeded — writeThroughReservation never throws, so a Planner
  // failure can never fail the RSVP. Awaited for the same serverless-freeze
  // reason as the emails below.
  await writeThroughReservation({
    event,
    person,
    reservedEntityId: attendeeEntityId,
    reservationStatus: rsvpResponseToReservationStatus(doc.rsvpResponse),
    partySize: seats,
  });

  // Best-effort transactional emails: attendee confirmation + host notification.
  // Email must never fail or change the RSVP result, so the whole block is
  // wrapped and any failure is only logged. We `await` inside the try/catch
  // because Vercel serverless may freeze the function once the response is
  // returned — fire-and-forget sends could be dropped mid-flight.
  try {
    const eventUrl = `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://nhimbe.com"}/events/${eventId}`;
    const eventDate = event.startDate.toLocaleString("en-US", {
      dateStyle: "full",
      timeStyle: "short",
    });
    const eventLocation =
      event.location && typeof event.location.name === "string"
        ? event.location.name
        : "See event page";
    const attendeeName = person.name?.trim() || "there";
    const attendeeEmail = person.email?.trim() || null;
    // Best-effort headcount for the host note (post-insert, incl. this RSVP).
    const attendeeCount = event.totalAttendeeCount + seats;

    // Attendee confirmation.
    if (attendeeEmail) {
      const tpl = registrationConfirmed({
        userName: attendeeName,
        eventName: event.name,
        eventDate,
        eventLocation,
        eventUrl,
      });
      await sendEmail({ to: attendeeEmail, subject: tpl.subject, html: tpl.html, text: tpl.text });
    }

    // Host notification — skip when the host email is unresolved or when the
    // host RSVP'd to their own event (don't notify them about themselves).
    const host = await getHostContactForEntity(event.primaryHostEntityId);
    if (!host) {
      console.debug(`[mukoko:email] No host email resolved for event ${eventId}; skipping host notification`);
    } else if (attendeeEmail && host.email.toLowerCase() === attendeeEmail.toLowerCase()) {
      console.debug(`[mukoko:email] Host RSVP'd to their own event ${eventId}; skipping self-notification`);
    } else {
      const tpl = hostNewRegistration({
        hostName: host.name?.trim() || "there",
        attendeeName,
        eventName: event.name,
        attendeeCount,
        eventUrl,
      });
      await sendEmail({ to: host.email, subject: tpl.subject, html: tpl.html, text: tpl.text });
    }
  } catch (emailErr) {
    const message = emailErr instanceof Error ? emailErr.message : "Unknown error";
    console.error(`[mukoko:email] Failed to send RSVP notification emails: ${message}`);
  }

  return { registered: true, alreadyRegistered: false };
}
