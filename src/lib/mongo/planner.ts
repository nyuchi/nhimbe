import "server-only";

/**
 * Planner write-through (NYU-26): mirror nhimbe RSVPs into the Mukoko super
 * app's `planner.reservations` collection so an event someone said yes to
 * shows up in their personal Planner — nhimbe feeds the ecosystem, nothing is
 * built in isolation.
 *
 * The reservation is a schema.org `EventReservation` correlated to the event
 * through the shared `iCalUid` (the reservation never stores a nhimbe-local
 * event id as its key). Idempotency is an upsert on
 * `(reservedPersonId, iCalUid)` — a re-RSVP or a status change updates the
 * one reservation instead of duplicating it.
 *
 * Status mapping: RSVP yes → `ReservationConfirmed`, maybe →
 * `ReservationHold`, no / host cancellation → `ReservationCancelled`.
 *
 * The `writeThrough*` entry points are BEST-EFFORT AND NEVER THROW (same
 * contract as `src/lib/email/resend.ts`): a Planner failure is logged via the
 * `[mukoko]` observability logger and must never fail the RSVP that
 * triggered it. The lower-level helpers they wrap do throw, so tests can
 * exercise both layers.
 */

import type { Filter, UpdateFilter } from "mongodb";
import { eventsCollection, plannerReservationsCollection } from "./databases";
import { WRITE_SCHEMA_VERSION, newId } from "./ids";
import { createLogger } from "@/lib/observability";
import type {
  EventDoc,
  PersonDoc,
  PlannerReservationDoc,
  ReservationStatus,
  RsvpResponse,
} from "./types";

const plannerLog = createLogger("planner");

/** Map a v3.1 RSVP response onto the schema.org reservation lifecycle. */
export function rsvpResponseToReservationStatus(response: RsvpResponse): ReservationStatus {
  switch (response) {
    case "RsvpResponseYes":
      return "ReservationConfirmed";
    case "RsvpResponseMaybe":
      return "ReservationHold";
    case "RsvpResponseNo":
      return "ReservationCancelled";
  }
}

/** The event fields the reservation snapshot needs. */
export type ReservationEventInput = Pick<
  EventDoc,
  "_id" | "iCalUid" | "name" | "startDate" | "endDate" | "location" | "url"
>;

/** The person fields the reservation needs. */
export type ReservationPersonInput = Pick<PersonDoc, "_id" | "name">;

export interface UpsertReservationInput {
  event: ReservationEventInput;
  person: ReservationPersonInput;
  /** Entity the attendee acts through (Rule 10: entity-centric). */
  reservedEntityId: string;
  reservationStatus: ReservationStatus;
  /** Attendee plus additional guests (defaults to 1). */
  partySize?: number;
}

/**
 * schema.org Event snapshot embedded as `reservationFor`, mirroring the
 * mapper doctrine (`mappers.ts`): @type/name/startDate(+endDate)/location,
 * dates as BSON dates.
 */
export function buildReservationFor(event: ReservationEventInput): Record<string, unknown> {
  const snapshot: Record<string, unknown> = {
    "@type": "Event",
    identifier: event._id,
    name: event.name,
    startDate: event.startDate,
  };
  if (event.endDate) snapshot.endDate = event.endDate;
  if (event.location) snapshot.location = event.location;
  if (event.url) snapshot.url = event.url;
  return snapshot;
}

/**
 * Build the idempotent `(filter, update)` pair for the reservation upsert.
 * Pure and exported so tests can assert the emitted document carries every
 * field the `planner.reservations` validator requires: the filter contributes
 * `reservedPersonId` + `iCalUid` on insert, `$setOnInsert` the immutable
 * required fields, and `$set` the mutable ones.
 */
export function buildReservationWrite(input: UpsertReservationInput): {
  filter: Filter<PlannerReservationDoc>;
  update: UpdateFilter<PlannerReservationDoc>;
} {
  const now = new Date();
  const partySize = Math.max(1, Math.trunc(input.partySize ?? 1));

  const filter: Filter<PlannerReservationDoc> = {
    reservedPersonId: input.person._id,
    iCalUid: input.event.iCalUid,
  };

  const update: UpdateFilter<PlannerReservationDoc> = {
    $set: {
      reservationStatus: input.reservationStatus,
      reservationFor: buildReservationFor(input.event),
      partySize,
      underName: input.person.name
        ? { "@type": "Person", name: input.person.name }
        : null,
      updatedAt: now,
    },
    $setOnInsert: {
      _id: newId(),
      _schemaVersion: WRITE_SCHEMA_VERSION,
      schemaOrgType: "EventReservation",
      reservedEntityId: input.reservedEntityId,
      originatingApp: "events",
      bookingTime: now,
      createdAt: now,
      mukoko: { routingSource: "nhimbe" },
    },
  };

  return { filter, update };
}

/**
 * Upsert the person's reservation for an event. One reservation per
 * `(reservedPersonId, iCalUid)`; re-RSVPs and status transitions update it in
 * place. Throws on driver failure — prefer `writeThroughReservation` from the
 * RSVP path.
 */
export async function upsertEventReservation(input: UpsertReservationInput): Promise<void> {
  if (!input.event.iCalUid) {
    // Without the correlation key the Planner cannot pair the reservation.
    plannerLog.warn("Event has no iCalUid — skipping Planner reservation", {
      data: { eventId: input.event._id },
    });
    return;
  }
  const reservations = await plannerReservationsCollection();
  const { filter, update } = buildReservationWrite(input);
  await reservations.updateOne(filter, update, { upsert: true });
}

/**
 * Flip an existing reservation to `ReservationCancelled`. Deliberately NOT an
 * upsert — declining an event you never reserved should not create a
 * cancelled reservation row.
 */
export async function cancelEventReservation(params: {
  reservedPersonId: string;
  iCalUid: string;
}): Promise<void> {
  const reservations = await plannerReservationsCollection();
  await reservations.updateOne(
    { reservedPersonId: params.reservedPersonId, iCalUid: params.iCalUid },
    { $set: { reservationStatus: "ReservationCancelled", updatedAt: new Date() } },
  );
}

// ── best-effort, never-throw entry points (the write-through hooks) ─────

/**
 * RSVP → Planner write-through. Runs after the primary `events.rsvps` write
 * succeeds; any failure here is logged and swallowed so it can never fail the
 * RSVP itself.
 */
export async function writeThroughReservation(input: UpsertReservationInput): Promise<void> {
  try {
    await upsertEventReservation(input);
  } catch (error) {
    plannerLog.error("Planner reservation write-through failed", {
      data: { eventId: input.event._id, personId: input.person._id },
      error: error instanceof Error ? error : new Error(String(error)),
    });
  }
}

/**
 * Cancellation write-through keyed by the nhimbe event id: resolves the
 * event's `iCalUid` then cancels the person's reservation. Best-effort,
 * never throws.
 */
export async function writeThroughReservationCancellation(params: {
  reservedPersonId: string;
  eventId: string;
}): Promise<void> {
  try {
    const events = await eventsCollection();
    const event = await events.findOne(
      { _id: params.eventId },
      { projection: { iCalUid: 1 } },
    );
    if (!event?.iCalUid) {
      plannerLog.warn("No iCalUid resolved for cancelled RSVP — skipping Planner update", {
        data: { eventId: params.eventId },
      });
      return;
    }
    await cancelEventReservation({
      reservedPersonId: params.reservedPersonId,
      iCalUid: event.iCalUid,
    });
  } catch (error) {
    plannerLog.error("Planner reservation cancellation write-through failed", {
      data: { eventId: params.eventId, personId: params.reservedPersonId },
      error: error instanceof Error ? error : new Error(String(error)),
    });
  }
}
