"use server";

/**
 * Campfire thread server actions (Vercel server runtime → MongoDB).
 *
 * The campfire is "live chat around the gathering" — a `campfire.conversations`
 * document tied to an event, with `campfire.messages` rows hanging off it. This
 * replaces the previous direct-from-the-browser Supabase reads/writes: the
 * browser never touches Mongo, so the EventCampfire client component calls
 * these actions instead.
 *
 * Schema (verified via the Mongo MCP — Mukoko v3.1):
 *   campfire.conversations(_id, conversationType, eventId, circleId,
 *     messageCount, participantCount, lastMessageAt, isActive, ...)
 *   campfire.messages(_id, conversationId, senderPersonId, senderEntityId,
 *     matrixEventType, messageType, content, sequence, sentAt, deletedAt, ...)
 *   campfire.participants(_id, conversationId, participantPersonId, ...)
 *   campfire.readReceipts(_id, conversationId, readerPersonId,
 *     lastReadMessageId, lastReadSequence, lastReadAt, receiptType)
 *
 * The `campfire` database is not in the shared `DB` accessor map (which only
 * covers the databases nhimbe reads on the hot path), so these actions reach it
 * through the shared `getMongoClient()` handle rather than editing the shared
 * accessor file.
 *
 * Degradation: when there is no conversation id, the conversation is missing,
 * or the database is unreachable, reads return an empty thread (with `degraded`
 * set) instead of throwing, so the component renders a quiet empty state.
 */

import { withAuth } from "@workos-inc/authkit-nextjs";
import type { Collection, Db, Document } from "mongodb";
import { getMongoClient } from "@/lib/mongo/client";
import { personsCollection, eventsCollection } from "@/lib/mongo/databases";
import { ensureHostEntityForPerson } from "@/lib/mongo/entities";
import { ensureEventChatConversation } from "@/lib/mongo/campfire";
import { newId, stampNew } from "@/lib/mongo/ids";
import { syncPersonFromWorkos, type SyncPersonInput } from "@/lib/mongo/users";
import {
  isDevBypass,
  DEV_WORKOS_ID,
  DEV_EMAIL,
  DEV_NAME,
} from "@/lib/auth/dev";
import type { PersonDoc } from "@/lib/mongo/types";

/** How many recent messages the thread loads. */
const MAX_MESSAGES = 20;
const MAX_MESSAGE_LENGTH = 4000;

// ── document shapes (campfire db — not in the shared types) ─────────────

interface CampfireConversationDoc extends Document {
  _id: string;
  conversationType: string;
  eventId?: string | null;
  isActive?: boolean;
  messageCount?: number;
  participantCount?: number;
  lastMessageAt?: Date | null;
}

interface CampfireMessageDoc extends Document {
  _id: string;
  conversationId: string;
  senderPersonId: string;
  senderEntityId: string;
  messageType: string;
  content?: string | null;
  sequence: number;
  sentAt: Date;
  deletedAt?: Date | null;
}

// ── serialisable view models returned to the client component ───────────

export interface CampfireAuthor {
  id: string;
  name: string;
  image: string | null;
}

export interface CampfireMessage {
  id: string;
  senderPersonId: string;
  text: string;
  /** ISO 8601 instant. */
  sentAt: string;
}

export interface CampfireThread {
  conversationId: string | null;
  messages: CampfireMessage[];
  authors: CampfireAuthor[];
  /** True when the thread fell back to empty (no conversation / unreachable). */
  degraded: boolean;
}

// ── campfire collection handles (via the shared client) ─────────────────

async function campfireDb(): Promise<Db> {
  const client = await getMongoClient();
  return client.db("campfire");
}

async function conversationsCollection(): Promise<Collection<CampfireConversationDoc>> {
  return (await campfireDb()).collection<CampfireConversationDoc>("conversations");
}

async function messagesCollection(): Promise<Collection<CampfireMessageDoc>> {
  return (await campfireDb()).collection<CampfireMessageDoc>("messages");
}

// ── helpers ─────────────────────────────────────────────────────────────

const EMPTY_THREAD = (conversationId: string | null): CampfireThread => ({
  conversationId,
  messages: [],
  authors: [],
  degraded: true,
});

function personLabel(p: PersonDoc): string {
  return (
    p.name?.trim() ||
    [p.givenName, p.familyName].filter(Boolean).join(" ").trim() ||
    "Guest"
  );
}

/** Resolve the signed-in person (WorkOS session or the local dev bypass). */
async function resolveActingPerson(): Promise<PersonDoc> {
  let syncInput: SyncPersonInput;
  if (isDevBypass()) {
    syncInput = {
      workosUserId: DEV_WORKOS_ID,
      email: DEV_EMAIL,
      name: DEV_NAME,
      emailVerified: true,
    };
  } else {
    const { user } = await withAuth();
    if (!user) throw new Error("You must be signed in to join the campfire.");
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

/** Load the author person docs referenced by a batch of messages. */
async function loadAuthors(senderIds: string[]): Promise<CampfireAuthor[]> {
  if (senderIds.length === 0) return [];
  const persons = await personsCollection();
  const docs = await persons.find({ _id: { $in: senderIds } }).toArray();
  return docs.map((p) => ({ id: p._id, name: personLabel(p), image: p.picture ?? null }));
}

function toMessageView(doc: CampfireMessageDoc): CampfireMessage {
  return {
    id: doc._id,
    senderPersonId: doc.senderPersonId,
    text: doc.content ?? "",
    sentAt: (doc.sentAt instanceof Date ? doc.sentAt : new Date(doc.sentAt)).toISOString(),
  };
}

// ── reads ────────────────────────────────────────────────────────────────

/**
 * Load the most recent messages for an event's campfire conversation, oldest
 * first, with the author roster. Degrades to an empty thread when there is no
 * conversation id, the conversation is missing/inactive, or Mongo is
 * unreachable.
 */
export async function getCampfireThread(
  conversationId: string | null | undefined,
): Promise<CampfireThread> {
  if (!conversationId) return EMPTY_THREAD(conversationId ?? null);

  try {
    const conversations = await conversationsCollection();
    const conversation = await conversations.findOne({ _id: conversationId });
    if (!conversation || conversation.isActive === false) {
      return EMPTY_THREAD(conversationId);
    }

    const messages = await messagesCollection();
    // Pull the newest N (descending), then present oldest-first.
    const recent = await messages
      .find({ conversationId, deletedAt: null })
      .sort({ sequence: -1 })
      .limit(MAX_MESSAGES)
      .toArray();
    recent.reverse();

    const views = recent
      .map(toMessageView)
      .filter((m) => m.text.length > 0);
    const authors = await loadAuthors(
      Array.from(new Set(views.map((m) => m.senderPersonId))),
    );

    return { conversationId, messages: views, authors, degraded: false };
  } catch {
    // Quiet degradation — the component renders an empty campfire.
    return EMPTY_THREAD(conversationId);
  }
}

/**
 * Resolve (creating on first use) an event's paired group chat. Any
 * signed-in visitor may open it — same openness as posting a message.
 */
export async function ensureEventChatConversationAction(eventId: string): Promise<string> {
  const person = await resolveActingPerson();
  const events = await eventsCollection();
  const event = await events.findOne({ _id: eventId });
  if (!event) throw new Error("That event could not be found.");

  const conversation = await ensureEventChatConversation({
    eventId,
    eventName: event.name,
    createdByPersonId: person._id,
  });
  return conversation._id;
}

// ── writes ────────────────────────────────────────────────────────────────

export interface PostCampfireMessageResult {
  message: CampfireMessage;
  author: CampfireAuthor;
}

/**
 * Append a plaintext message to an event's campfire conversation as the
 * signed-in person, acting through their host entity. Bumps the conversation's
 * `messageCount` / `lastMessageAt` and records the sender's read receipt so a
 * notification badge elsewhere stays accurate.
 */
export async function postCampfireMessage(
  conversationId: string,
  text: string,
): Promise<PostCampfireMessageResult> {
  if (!conversationId) throw new Error("This event has no campfire to post to.");
  const body = (text ?? "").trim();
  if (!body) throw new Error("Write a message before sending.");
  if (body.length > MAX_MESSAGE_LENGTH) {
    throw new Error(`Messages must be ${MAX_MESSAGE_LENGTH} characters or fewer.`);
  }

  const person = await resolveActingPerson();

  const conversations = await conversationsCollection();
  const conversation = await conversations.findOne({ _id: conversationId });
  if (!conversation || conversation.isActive === false) {
    throw new Error("This campfire is no longer available.");
  }

  // Messages are entity-centric (Rule 10): the person acts through an entity.
  const senderEntityId = await ensureHostEntityForPerson(person);

  const now = new Date();
  // Claim the next per-conversation sequence ATOMICALLY (L2): a single
  // findOneAndUpdate `$inc: { messageCount: 1 }` bumps and returns the
  // post-increment count, which becomes the ordinal — read-max+1 raced and
  // could hand two concurrent posts the same sequence. Mirrors the campfire
  // write-through's atomic claim (src/lib/mongo/campfire.ts).
  const bumped = await conversations.findOneAndUpdate(
    { _id: conversationId },
    { $inc: { messageCount: 1 }, $set: { lastMessageAt: now, updatedAt: now } },
    { returnDocument: "after" },
  );
  if (!bumped) {
    throw new Error("This campfire is no longer available.");
  }
  const sequence = bumped.messageCount ?? 1;

  const id = newId();
  const messages = await messagesCollection();
  const doc: CampfireMessageDoc = {
    ...stampNew(id),
    conversationId,
    senderPersonId: person._id,
    senderEntityId,
    matrixEventType: "m.room.message",
    messageType: "text",
    content: body,
    sequence,
    sentAt: now,
    deletedAt: null,
  };
  await messages.insertOne(doc);

  // Best-effort read receipt for the sender (failure must not fail the send).
  try {
    const receipts = (await campfireDb()).collection("readReceipts");
    await receipts.updateOne(
      { conversationId, readerPersonId: person._id },
      {
        $set: {
          conversationId,
          readerPersonId: person._id,
          lastReadMessageId: id,
          lastReadSequence: sequence,
          lastReadAt: now,
          receiptType: "m.read",
          _schemaVersion: "v3.1",
          updatedAt: now,
        },
        $setOnInsert: { _id: newId(), createdAt: now },
      },
      { upsert: true },
    );
  } catch {
    // ignore — receipts are non-critical.
  }

  return {
    message: toMessageView(doc),
    author: { id: person._id, name: personLabel(person), image: person.picture ?? null },
  };
}
