"use server";

/**
 * Event update / announcement server action (Vercel server runtime →
 * MongoDB). This is the write path for `events.updates` — the host-posted
 * announcements the manage page's "Send Blasts" surface will drive.
 *
 * Security: only a host of the event may post an update. The acting person is
 * resolved from the WorkOS session (or the local dev bypass), and the event's
 * `primaryHostEntityId` must be among the entities that person hosts through —
 * the same gate `src/app/actions/host-registrations.ts` uses.
 *
 * Cross-product write-through (NYU-26): when the host posts with
 * `notifyAttendees: true`, the announcement is routed into the Mukoko
 * Campfire — the event's paired `campfire.conversations` doc is
 * found-or-created and the text lands as a plaintext system message
 * (`src/lib/mongo/campfire.ts`). The hook runs AFTER the primary
 * `events.updates` insert succeeds and is best-effort: a Campfire failure is
 * logged and can never fail the update. Email (Resend) flows are untouched —
 * Campfire is additive.
 */

import { withAuth } from "@workos-inc/authkit-nextjs";
import { eventsCollection, eventUpdatesCollection, personsCollection } from "@/lib/mongo/databases";
import { stampNew } from "@/lib/mongo/ids";
import { notifyAttendeesViaCampfire } from "@/lib/mongo/campfire";
import { listHostEntitiesForPerson } from "@/lib/mongo/entities";
import { isDevBypass, DEV_WORKOS_ID } from "@/lib/auth/dev";
import { createLogger } from "@/lib/observability";
import type { EventDoc, EventUpdateDoc, PersonDoc } from "@/lib/mongo/types";

const updatesLog = createLogger("event-updates");

const MAX_UPDATE_LENGTH = 4000;

const UPDATE_TYPES = [
  "announcement",
  "schedule_change",
  "venue_change",
  "cancellation_notice",
  "thank_you",
  "general",
] as const;

export type EventUpdateType = (typeof UPDATE_TYPES)[number];

export interface PostEventUpdateInput {
  eventId: string;
  text: string;
  /** Defaults to "announcement". */
  updateType?: EventUpdateType;
  /** Defaults to false. */
  isPinned?: boolean;
  /** When true, the update is routed into the event's Campfire conversation. */
  notifyAttendees?: boolean;
}

export interface PostEventUpdateResult {
  updateId: string;
}

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

/** Throw unless the acting person hosts `eventId`; returns person + event. */
async function requireEventHost(
  eventId: string,
): Promise<{ person: PersonDoc; event: EventDoc }> {
  const person = await resolveActingPerson();
  if (!person) throw new Error("Not authorized");

  const events = await eventsCollection();
  const event = await events.findOne({ _id: eventId });
  if (!event) throw new Error("Not authorized");

  const hostEntities = await listHostEntitiesForPerson(person._id);
  if (!hostEntities.some((e) => e._id === event.primaryHostEntityId)) {
    throw new Error("Not authorized");
  }
  return { person, event };
}

/**
 * Host-only: post an update/announcement to an event. Writes the
 * `events.updates` doc, then (when `notifyAttendees`) best-effort routes the
 * text into the event's Campfire conversation.
 */
export async function postEventUpdate(
  input: PostEventUpdateInput,
): Promise<PostEventUpdateResult> {
  const eventId = input.eventId?.trim();
  if (!eventId) throw new Error("An event id is required.");

  const text = (input.text ?? "").trim();
  if (!text) throw new Error("Write an update before posting.");
  if (text.length > MAX_UPDATE_LENGTH) {
    throw new Error(`Updates must be ${MAX_UPDATE_LENGTH} characters or fewer.`);
  }

  const updateType: EventUpdateType =
    input.updateType && UPDATE_TYPES.includes(input.updateType)
      ? input.updateType
      : "announcement";

  const { person, event } = await requireEventHost(eventId);

  // The author acts through the event's host entity — requireEventHost just
  // verified the person hosts through it (Rule 10: entity-centric).
  const authorEntityId = event.primaryHostEntityId;

  const doc: EventUpdateDoc = {
    ...stampNew(),
    eventId,
    authorPersonId: person._id,
    authorEntityId,
    updateType,
    text,
    isPinned: input.isPinned === true,
    notifyAttendees: input.notifyAttendees === true,
    media: [],
  };

  const updates = await eventUpdatesCollection();
  await updates.insertOne(doc);

  // Cross-product write-through (NYU-26), AFTER the primary write succeeded.
  // notifyAttendeesViaCampfire never throws; the extra guard keeps the update
  // safe even if that contract ever changes. Awaited so Vercel's serverless
  // freeze can't drop it mid-flight.
  if (doc.notifyAttendees) {
    try {
      await notifyAttendeesViaCampfire({
        eventId,
        eventName: event.name,
        authorPersonId: person._id,
        authorEntityId,
        text,
      });
    } catch (error) {
      updatesLog.error("Campfire notification failed for event update", {
        data: { eventId, updateId: doc._id },
        error: error instanceof Error ? error : new Error(String(error)),
      });
    }
  }

  return { updateId: doc._id };
}
