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
import { eventsCollection, personsCollection } from "@/lib/mongo/databases";
import { listHostEntitiesForPerson } from "@/lib/mongo/entities";
import { isDevBypass, DEV_WORKOS_ID } from "@/lib/auth/dev";
import { writeEventUpdateForHost, type EventUpdateType } from "@/lib/mongo/event-updates";
import type { EventDoc, PersonDoc } from "@/lib/mongo/types";

export type { EventUpdateType };

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
 * Host-only: post an update/announcement to an event. Resolves + host-gates the
 * cookie-session caller, then delegates the write (+ Campfire/email fan-out) to
 * the shared core writer, which the bearer-authed MCP blast endpoint reuses.
 */
export async function postEventUpdate(
  input: PostEventUpdateInput,
): Promise<PostEventUpdateResult> {
  const eventId = input.eventId?.trim();
  if (!eventId) throw new Error("An event id is required.");

  const { person, event } = await requireEventHost(eventId);

  return writeEventUpdateForHost({
    person,
    event,
    text: input.text ?? "",
    updateType: input.updateType,
    isPinned: input.isPinned,
    notifyAttendees: input.notifyAttendees,
  });
}
