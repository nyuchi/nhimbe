import "server-only";

/**
 * Campfire write-through (NYU-26): route host event updates posted with
 * `notifyAttendees: true` into the Mukoko Campfire messaging substrate, so an
 * announcement made in nhimbe reaches attendees in the super app.
 *
 * Model: each event pairs with at most one `campfire.conversations` document
 * (found-or-created by `eventId`). Announcements land as system messages
 * (`messageType: "system"`, `matrixEventType: "m.room.message"`) with a
 * PLAINTEXT `content` body — the conversation is created with
 * `encryptionMode: "none"` precisely so these server-authored messages stay
 * readable. Message ordering uses the conversation's `messageCount` as a
 * monotonic sequence: a single `findOneAndUpdate` `$inc` claims the next
 * ordinal atomically, so two concurrent announcements cannot collide.
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
  const now = new Date();
  return {
    _id: newId(),
    _schemaVersion: WRITE_SCHEMA_VERSION,
    conversationType: "system",
    createdByPersonId: input.createdByPersonId,
    // Server-readable system messages — announcements are not E2E content.
    encryptionMode: "none",
    visibility: "private",
    isActive: true,
    messageCount: 0,
    participantCount: 0,
    eventId: input.eventId,
    name: input.eventName,
    mukoko: { routingSource: "nhimbe" },
    createdAt: now,
    updatedAt: now,
  };
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
 * Find the event's paired conversation by `eventId`, creating it on first
 * use. A lost insert race (duplicate key) falls back to re-reading the row
 * the winner created.
 */
export async function ensureEventConversation(
  input: EnsureEventConversationInput,
): Promise<CampfireConversationDoc> {
  const conversations = await campfireConversationsCollection();
  const existing = await conversations.findOne({ eventId: input.eventId });
  if (existing) return existing;

  const doc = buildEventConversationDoc(input);
  try {
    await conversations.insertOne(doc);
    return doc;
  } catch (error) {
    // Lost a create race — the winner's conversation is the paired one.
    const raced = await conversations.findOne({ eventId: input.eventId });
    if (raced) return raced;
    throw error;
  }
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
