import "server-only";

/**
 * Campfire write-through (NYU-26): route host event updates posted with
 * `notifyAttendees: true` into the Mukoko Campfire messaging substrate, so an
 * announcement made in nhimbe reaches attendees in the super app.
 *
 * Model: each event pairs with at most one SYSTEM `campfire.conversations`
 * document (found-or-created by `{ eventId, conversationType: "system" }`, so a
 * separate live-chat conversation on the same event is never conflated with the
 * announcement channel). Announcements land as system messages
 * (`messageType: "system"`, `matrixEventType: "m.room.message"`) with a
 * PLAINTEXT `content` body — the conversation is created with
 * `encryptionMode: "none"` precisely so these server-authored messages stay
 * readable. Message ordering uses the conversation's `messageCount` as a
 * monotonic sequence: a single `findOneAndUpdate` `$inc` claims the next
 * ordinal atomically, so two concurrent announcements cannot collide.
 *
 * Calendars, circles, and events can each also pair with a GROUP conversation
 * — a WhatsApp-style chat, distinct from the SYSTEM announcement channel and
 * from a circle's persistent post stream (`circles.posts`). All four pairings
 * (event/system, event/group, calendar/group, circle/group) share one
 * find-or-create primitive, `ensurePairedConversation`: race-safe via an
 * idempotent upsert — `$setOnInsert` seeds every v3.1-required field only on
 * insert, so concurrent callers converge on one conversation without
 * depending on a unique index (we do not own indexes on the sibling-product
 * `campfire.*` DB) — done in a single `findOneAndUpdate` rather than a
 * separate upsert-then-read.
 *
 * `notifyAttendeesViaCampfire` is BEST-EFFORT AND NEVER THROWS (same contract
 * as `src/lib/email/resend.ts`): a Campfire failure is logged via the
 * `[mukoko]` observability logger and must never fail the event update that
 * triggered it. The lower-level helpers do throw, for tests and future
 * callers that want the error.
 *
 * This module is additive alongside `src/app/actions/campfire.ts` (the live
 * event chat), which owns its own reads/writes for user-authored messages.
 */

import { campfireConversationsCollection, campfireMessagesCollection } from "./databases";
import { WRITE_SCHEMA_VERSION, newId } from "./ids";
import { createLogger } from "@/lib/observability";
import type { CampfireConversationDoc, CampfireMessageDoc } from "./types";

const campfireLog = createLogger("campfire");

type ConversationOwnerField = "eventId" | "calendarId" | "circleId";

interface PairedConversationParams {
  conversationType: string;
  ownerField: ConversationOwnerField;
  ownerId: string;
  /** Becomes the conversation name on create. */
  name: string;
  /** The conversation creator on first use. */
  createdByPersonId: string;
}

function buildPairedConversationDoc(params: PairedConversationParams): CampfireConversationDoc {
  const now = new Date();
  return {
    _id: newId(),
    _schemaVersion: WRITE_SCHEMA_VERSION,
    conversationType: params.conversationType,
    createdByPersonId: params.createdByPersonId,
    encryptionMode: "none",
    visibility: "private",
    isActive: true,
    messageCount: 0,
    participantCount: 0,
    [params.ownerField]: params.ownerId,
    name: params.name,
    mukoko: { routingSource: "nhimbe" },
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Find the conversation paired to `{ ownerField: ownerId, conversationType }`,
 * creating it on first use in a single atomic `findOneAndUpdate` upsert.
 */
async function ensurePairedConversation(
  params: PairedConversationParams & { notFoundLabel: string },
): Promise<CampfireConversationDoc> {
  const conversations = await campfireConversationsCollection();
  const filter = { [params.ownerField]: params.ownerId, conversationType: params.conversationType };

  const conversation = await conversations.findOneAndUpdate(
    filter,
    { $setOnInsert: buildPairedConversationDoc(params) },
    { upsert: true, returnDocument: "after" },
  );
  if (!conversation) {
    throw new Error(`Campfire ${params.notFoundLabel} could not be resolved.`);
  }
  return conversation;
}

export interface EnsureEventConversationInput {
  eventId: string;
  /** Event name — becomes the conversation name on create. */
  eventName: string;
  /** The update author (conversation creator on first announcement). */
  createdByPersonId: string;
}

/**
 * Pure builder for the event-paired system conversation. Exported so tests
 * can assert every `campfire.conversations` validator-required field is set.
 */
export function buildEventConversationDoc(
  input: EnsureEventConversationInput,
): CampfireConversationDoc {
  return buildPairedConversationDoc({
    conversationType: "system",
    ownerField: "eventId",
    ownerId: input.eventId,
    name: input.eventName,
    createdByPersonId: input.createdByPersonId,
  });
}

export interface SystemMessageInput {
  conversationId: string;
  senderPersonId: string;
  senderEntityId: string;
  /** Plaintext announcement body (encryptionMode is "none"). */
  content: string;
  /** Monotonic per-conversation ordinal (the bumped messageCount). */
  sequence: number;
}

/**
 * Pure builder for an announcement system message. Exported so tests can
 * assert every `campfire.messages` validator-required field is set.
 */
export function buildSystemMessageDoc(input: SystemMessageInput): CampfireMessageDoc {
  const now = new Date();
  return {
    _id: newId(),
    _schemaVersion: WRITE_SCHEMA_VERSION,
    conversationId: input.conversationId,
    senderPersonId: input.senderPersonId,
    senderEntityId: input.senderEntityId,
    matrixEventType: "m.room.message",
    messageType: "system",
    sequence: input.sequence,
    content: input.content,
    sentAt: now,
    mukoko: { originatingApp: "nhimbe" },
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Find the event's paired SYSTEM conversation, creating it on first use.
 * Scoped to `{ eventId, conversationType: "system" }`: a live-chat
 * conversation on the same event (see `ensureEventChatConversation` below)
 * must never receive announcement system messages.
 */
export async function ensureEventConversation(
  input: EnsureEventConversationInput,
): Promise<CampfireConversationDoc> {
  return ensurePairedConversation({
    conversationType: "system",
    ownerField: "eventId",
    ownerId: input.eventId,
    name: input.eventName,
    createdByPersonId: input.createdByPersonId,
    notFoundLabel: `system conversation for event ${input.eventId}`,
  });
}

/**
 * Append a system message to a conversation. The sequence is claimed
 * atomically: `$inc: { messageCount: 1 }` on the conversation returns the
 * post-increment count, which becomes the message's ordinal.
 */
export async function appendSystemMessage(params: {
  conversationId: string;
  senderPersonId: string;
  senderEntityId: string;
  content: string;
}): Promise<CampfireMessageDoc> {
  const now = new Date();
  const conversations = await campfireConversationsCollection();
  const bumped = await conversations.findOneAndUpdate(
    { _id: params.conversationId },
    { $inc: { messageCount: 1 }, $set: { lastMessageAt: now, updatedAt: now } },
    { returnDocument: "after" },
  );
  if (!bumped) {
    throw new Error(`Campfire conversation ${params.conversationId} not found.`);
  }

  const doc = buildSystemMessageDoc({
    conversationId: params.conversationId,
    senderPersonId: params.senderPersonId,
    senderEntityId: params.senderEntityId,
    content: params.content,
    sequence: bumped.messageCount,
  });
  const messages = await campfireMessagesCollection();
  await messages.insertOne(doc);
  return doc;
}

export interface EnsureCalendarConversationInput {
  calendarId: string;
  /** Calendar name — becomes the conversation name on create. */
  calendarName: string;
  /** The person who created the calendar (conversation creator on first use). */
  createdByPersonId: string;
}

/** Pure builder for the calendar-paired discuss conversation. */
export function buildCalendarConversationDoc(
  input: EnsureCalendarConversationInput,
): CampfireConversationDoc {
  return buildPairedConversationDoc({
    conversationType: "group",
    ownerField: "calendarId",
    ownerId: input.calendarId,
    name: input.calendarName,
    createdByPersonId: input.createdByPersonId,
  });
}

/** Find the calendar's paired discuss conversation, creating it on first use. */
export async function ensureCalendarConversation(
  input: EnsureCalendarConversationInput,
): Promise<CampfireConversationDoc> {
  return ensurePairedConversation({
    conversationType: "group",
    ownerField: "calendarId",
    ownerId: input.calendarId,
    name: input.calendarName,
    createdByPersonId: input.createdByPersonId,
    notFoundLabel: `discuss conversation for calendar ${input.calendarId}`,
  });
}

export interface EnsureCircleConversationInput {
  circleId: string;
  /** Circle name — becomes the conversation name on create. */
  circleName: string;
  /** The person who owns the circle (conversation creator on first use). */
  createdByPersonId: string;
}

/**
 * Pure builder for the circle-paired group chat — a circle's WhatsApp-style
 * chat, distinct from its persistent post stream (`circles.posts`). Circles
 * are the membership/roster substrate; Campfire is the messaging substrate —
 * this pairs one to the other without merging them.
 */
export function buildCircleConversationDoc(
  input: EnsureCircleConversationInput,
): CampfireConversationDoc {
  return buildPairedConversationDoc({
    conversationType: "group",
    ownerField: "circleId",
    ownerId: input.circleId,
    name: input.circleName,
    createdByPersonId: input.createdByPersonId,
  });
}

/** Find the circle's paired group chat, creating it on first use. */
export async function ensureCircleConversation(
  input: EnsureCircleConversationInput,
): Promise<CampfireConversationDoc> {
  return ensurePairedConversation({
    conversationType: "group",
    ownerField: "circleId",
    ownerId: input.circleId,
    name: input.circleName,
    createdByPersonId: input.createdByPersonId,
    notFoundLabel: `group chat for circle ${input.circleId}`,
  });
}

export interface EnsureEventChatConversationInput {
  eventId: string;
  /** Event name — becomes the conversation name on create. */
  eventName: string;
  /** The person opening the chat (conversation creator on first use). */
  createdByPersonId: string;
}

/**
 * Pure builder for an event's live group chat. `conversationType: "group"`
 * keeps this distinct from the "system" announcement channel above (same
 * eventId, different conversationType — the two never collide).
 */
export function buildEventChatConversationDoc(
  input: EnsureEventChatConversationInput,
): CampfireConversationDoc {
  return buildPairedConversationDoc({
    conversationType: "group",
    ownerField: "eventId",
    ownerId: input.eventId,
    name: input.eventName,
    createdByPersonId: input.createdByPersonId,
  });
}

/**
 * Find the event's paired group chat, creating it on first use. Distinct
 * from {@link ensureEventConversation} (the "system" announcement channel) —
 * scoped to `conversationType: "group"` so the two never conflate.
 */
export async function ensureEventChatConversation(
  input: EnsureEventChatConversationInput,
): Promise<CampfireConversationDoc> {
  return ensurePairedConversation({
    conversationType: "group",
    ownerField: "eventId",
    ownerId: input.eventId,
    name: input.eventName,
    createdByPersonId: input.createdByPersonId,
    notFoundLabel: `group chat for event ${input.eventId}`,
  });
}

// ── best-effort, never-throw entry point (the write-through hook) ────────

export interface CampfireNotifyInput {
  eventId: string;
  eventName: string;
  /** The host posting the update. */
  authorPersonId: string;
  /** The entity the host acts through (Rule 10: entity-centric). */
  authorEntityId: string;
  /** The update's plaintext text. */
  text: string;
}

/**
 * Event update → Campfire write-through. Runs after the primary
 * `events.updates` write succeeds; any failure here is logged and swallowed
 * so it can never fail the update itself.
 */
export async function notifyAttendeesViaCampfire(input: CampfireNotifyInput): Promise<void> {
  try {
    const conversation = await ensureEventConversation({
      eventId: input.eventId,
      eventName: input.eventName,
      createdByPersonId: input.authorPersonId,
    });
    await appendSystemMessage({
      conversationId: conversation._id,
      senderPersonId: input.authorPersonId,
      senderEntityId: input.authorEntityId,
      content: input.text,
    });
  } catch (error) {
    campfireLog.error("Campfire announcement write-through failed", {
      data: { eventId: input.eventId, personId: input.authorPersonId },
      error: error instanceof Error ? error : new Error(String(error)),
    });
  }
}
