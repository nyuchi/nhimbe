import "server-only";

/**
 * Host-facing registration + check-in reads/writes (Vercel server runtime →
 * MongoDB). These replace the retired Cloudflare Worker `/api/registrations`
 * and `/api/events/:id/checkin` endpoints that `@/lib/api` used to call.
 *
 * A "registration" is an RSVP with `rsvpResponse === "RsvpResponseYes"`.
 * Host approval is modelled with a plaintext `approvalStatus` field added to
 * the rsvp document — the `events.rsvps` validator allows extra fields, so this
 * needs no schema migration. Cancellation flips the rsvp to
 * `"RsvpResponseNo"`. Attendance lives in `events.checkIns`.
 *
 * Auth is NOT enforced here — these are pure data helpers. The server actions
 * in `src/app/actions/host-registrations.ts` gate every mutation (and the
 * attendee-PII read) on the caller actually hosting the event.
 */

import {
  checkInsCollection,
  personsCollection,
  rsvpsCollection,
} from "./databases";
import { WRITE_SCHEMA_VERSION, newId } from "./ids";
import type { RsvpDoc } from "./types";
import type { CheckinStats, Registration } from "@/lib/api";

type ApprovalStatus = "pending" | "approved" | "rejected";

/** Rsvp document plus the plaintext host-approval field we add out-of-band. */
type RsvpWithApproval = RsvpDoc & { approvalStatus?: ApprovalStatus };

function toIso(value: Date | string | null | undefined): string {
  if (!value) return new Date(0).toISOString();
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

/**
 * Registrations (RSVP === Yes) for an event, batch-joined to attendee identity
 * and check-in state. Status resolves to `attended` when a check-in exists,
 * otherwise the rsvp's `approvalStatus`, otherwise `registered`.
 */
export async function getEventRegistrations(eventId: string): Promise<Registration[]> {
  const rsvps = await rsvpsCollection();
  const rows = (await rsvps
    .find({ eventId, rsvpResponse: "RsvpResponseYes" })
    .toArray()) as RsvpWithApproval[];
  if (rows.length === 0) return [];

  const personIds = [...new Set(rows.map((r) => r.attendeePersonId))];

  // Batch the two joins: attendee identity + attendance.
  const persons = await personsCollection();
  const personDocs = await persons.find({ _id: { $in: personIds } }).toArray();
  const personById = new Map(personDocs.map((p) => [p._id, p]));

  const checkIns = await checkInsCollection();
  const checkInDocs = await checkIns
    .find({ eventId, attendeePersonId: { $in: personIds } })
    .toArray();
  const checkInByPerson = new Map(checkInDocs.map((c) => [c.attendeePersonId, c]));

  return rows.map((r) => {
    const person = personById.get(r.attendeePersonId);
    const checkIn = checkInByPerson.get(r.attendeePersonId);

    let status: Registration["status"];
    if (checkIn) status = "attended";
    else if (r.approvalStatus) status = r.approvalStatus;
    else status = "registered";

    return {
      id: r._id,
      eventId: r.eventId,
      userId: r.attendeePersonId,
      status,
      registeredAt: toIso(r.respondedAt ?? r.createdAt),
      checkedInAt: checkIn ? toIso(checkIn.checkedInAt) : undefined,
      userName: person?.name ?? undefined,
      userEmail: person?.email ?? undefined,
      userAvatar: person?.picture ?? undefined,
    };
  });
}

/** Approve or reject a registration by setting its plaintext approval field. */
export async function setRegistrationApproval(
  rsvpId: string,
  status: "approved" | "rejected",
): Promise<void> {
  const rsvps = await rsvpsCollection();
  const set: Record<string, unknown> = { approvalStatus: status, updatedAt: new Date() };
  await rsvps.updateOne({ _id: rsvpId }, { $set: set });
}

/** Cancel a registration by flipping the rsvp response to "No". */
export async function cancelRegistration(rsvpId: string): Promise<void> {
  const rsvps = await rsvpsCollection();
  await rsvps.updateOne(
    { _id: rsvpId },
    { $set: { rsvpResponse: "RsvpResponseNo", updatedAt: new Date() } },
  );
}

/**
 * Record (or update) a check-in for the attendee behind `rsvpId`. Upserted on
 * `(eventId, attendeePersonId)` so a double-tap is idempotent rather than a
 * duplicate row. `byPersonId` is the acting host.
 */
export async function checkInAttendee(
  eventId: string,
  rsvpId: string,
  byPersonId: string,
): Promise<void> {
  const rsvps = await rsvpsCollection();
  const rsvp = await rsvps.findOne({ _id: rsvpId, eventId });
  if (!rsvp) throw new Error("Registration not found for this event.");

  const checkIns = await checkInsCollection();
  const now = new Date();
  const set: Record<string, unknown> = {
    checkInMethod: "manual",
    checkedInAt: now,
    checkedInByPersonId: byPersonId,
    updatedAt: now,
  };
  const setOnInsert: Record<string, unknown> = {
    _id: newId(),
    _schemaVersion: WRITE_SCHEMA_VERSION,
    createdAt: now,
    eventId,
    attendeePersonId: rsvp.attendeePersonId,
  };
  await checkIns.updateOne(
    { eventId, attendeePersonId: rsvp.attendeePersonId },
    { $set: set, $setOnInsert: setOnInsert },
    { upsert: true },
  );
}

/**
 * Check-in stats for an event. `rate` is a whole-number percentage (0–100) so
 * the host dashboards can render it directly as `{rate}%` and feed the progress
 * bar (default max 100). Zero when there are no registrations.
 */
export async function getCheckinStats(eventId: string): Promise<CheckinStats> {
  const rsvps = await rsvpsCollection();
  const checkIns = await checkInsCollection();

  const total = await rsvps.countDocuments({ eventId, rsvpResponse: "RsvpResponseYes" });
  const attended = await checkIns.countDocuments({ eventId });
  const remaining = Math.max(0, total - attended);
  const rate = total > 0 ? Math.round((attended / total) * 100) : 0;

  return { eventId, total, attended, remaining, rate };
}
