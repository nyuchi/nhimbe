import "server-only";

/**
 * Core writer for host-posted event updates / announcements (`events.updates`).
 *
 * This is the shared, host-agnostic body behind BOTH the cookie-session server
 * action (`src/app/actions/event-updates.ts`, the manage page's "Send Blasts"
 * surface) and the bearer-authed MCP endpoint (`POST /api/events/:id/blast`).
 * Each caller resolves + host-gates the acting person its own way, then hands
 * the resolved `{ person, event }` here so the write path — insert, then the
 * best-effort Campfire + email fan-out — lives in exactly one place.
 *
 * Server-only: pulls the Mongo collection accessors and the email client.
 */

import { eventUpdatesCollection } from "./databases";
import { stampNew } from "./ids";
import { notifyAttendeesViaCampfire } from "./campfire";
import { listUpdateSubscribers } from "./update-subscribers";
import { consumeDailyUsage } from "./usage-limits";
import { getPlatformSettings } from "./settings";
import { sendEmail } from "@/lib/email/resend";
import { eventUpdatePosted } from "@/lib/email/templates";
import { SITE_URL } from "@/lib/site-url";
import { createLogger } from "@/lib/observability";
import type { EventDoc, EventUpdateDoc, PersonDoc } from "./types";

const updatesLog = createLogger("event-updates");

export const MAX_UPDATE_LENGTH = 4000;

export const UPDATE_TYPES = [
  "announcement",
  "schedule_change",
  "venue_change",
  "cancellation_notice",
  "thank_you",
  "general",
] as const;

export type EventUpdateType = (typeof UPDATE_TYPES)[number];

export interface WriteEventUpdateInput {
  /** The acting host (already resolved + host-gated by the caller). */
  person: PersonDoc;
  /** The event the update is posted to (already loaded by the caller). */
  event: EventDoc;
  text: string;
  /** Defaults to "announcement". */
  updateType?: EventUpdateType;
  /** Defaults to false. */
  isPinned?: boolean;
  /** When true, fan out to attendees (Campfire system message + email). */
  notifyAttendees?: boolean;
}

export interface WriteEventUpdateResult {
  updateId: string;
}

/**
 * Insert the `events.updates` doc, then (when `notifyAttendees`) best-effort
 * route the text into the event's Campfire conversation and email the
 * subscribed attendees + team. The notification hooks run AFTER the primary
 * insert and never throw (matching the `[mukoko]`/Resend swallow-and-log
 * contract), so a downstream failure can never fail the update itself.
 */
export async function writeEventUpdateForHost(
  input: WriteEventUpdateInput,
): Promise<WriteEventUpdateResult> {
  const { person, event } = input;

  const text = (input.text ?? "").trim();
  if (!text) throw new Error("Write an update before posting.");
  if (text.length > MAX_UPDATE_LENGTH) {
    throw new Error(`Updates must be ${MAX_UPDATE_LENGTH} characters or fewer.`);
  }

  const updateType: EventUpdateType =
    input.updateType && UPDATE_TYPES.includes(input.updateType)
      ? input.updateType
      : "announcement";

  // Free-plan cap: a notifying blast costs real email volume, so it's the one
  // update type rate-limited today (a stopgap ahead of real Pro billing — see
  // src/lib/mongo/usage-limits.ts). A plain update (no notify) is unmetered.
  if (input.notifyAttendees) {
    const { freeBlastsPerDayPerEvent } = await getPlatformSettings();
    await consumeDailyUsage({
      subjectId: event._id,
      counterType: "blast",
      limit: freeBlastsPerDayPerEvent,
    });
  }

  // The author acts through the event's host entity — the caller has verified
  // the person hosts through it (Rule 10: entity-centric).
  const authorEntityId = event.primaryHostEntityId;

  const doc: EventUpdateDoc = {
    ...stampNew(),
    eventId: event._id,
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

  if (doc.notifyAttendees) {
    // Campfire (NYU-26). notifyAttendeesViaCampfire never throws; the guard
    // keeps the update safe even if that contract ever changes.
    try {
      await notifyAttendeesViaCampfire({
        eventId: event._id,
        eventName: event.name,
        authorPersonId: person._id,
        authorEntityId,
        text,
      });
    } catch (error) {
      updatesLog.error("Campfire notification failed for event update", {
        data: { eventId: event._id, updateId: doc._id },
        error: error instanceof Error ? error : new Error(String(error)),
      });
    }

    // Email fan-out — subscribed attendees + team (opt-out aware; the author
    // never emails themself). Best-effort; sendEmail no-ops without RESEND_API_KEY.
    try {
      const recipients = await listUpdateSubscribers({
        eventId: event._id,
        hostEntityId: authorEntityId,
        excludePersonId: person._id,
      });
      if (recipients.length > 0) {
        const eventUrl = `${SITE_URL}/events/${event._id}`;
        const template = eventUpdatePosted({ eventName: event.name, updateText: text, eventUrl });
        const results = await Promise.allSettled(
          recipients.map((r) =>
            sendEmail({ to: r.email, subject: template.subject, html: template.html, text: template.text }),
          ),
        );
        const failed = results.filter(
          (r) => r.status === "rejected" || (r.status === "fulfilled" && !r.value.success),
        ).length;
        updatesLog.info("Event-update emails sent", {
          data: { eventId: event._id, updateId: doc._id, recipients: recipients.length, failed },
        });
      }
    } catch (error) {
      updatesLog.error("Event-update email fan-out failed", {
        data: { eventId: event._id, updateId: doc._id },
        error: error instanceof Error ? error : new Error(String(error)),
      });
    }
  }

  return { updateId: doc._id };
}
