import { describe, it, expect, vi, beforeEach } from "vitest";

// Guard imports (`server-only`) and the Mongo driver layer so the campfire
// write-through can be unit-tested with fake collections (no cluster here).
vi.mock("server-only", () => ({}));

const conversations = { findOne: vi.fn(), insertOne: vi.fn(), findOneAndUpdate: vi.fn() };
const messages = { insertOne: vi.fn() };

vi.mock("@/lib/mongo/databases", () => ({
  campfireConversationsCollection: vi.fn(async () => conversations),
  campfireMessagesCollection: vi.fn(async () => messages),
}));

// Observability binds console methods at module load, so spy at the logger
// level to assert the [mukoko] logging of swallowed failures. Hoisted because
// campfire.ts calls createLogger() at import time.
const campfireLogger = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));
vi.mock("@/lib/observability", () => ({
  createLogger: vi.fn(() => campfireLogger),
}));

import {
  buildEventConversationDoc,
  buildSystemMessageDoc,
  ensureEventConversation,
  appendSystemMessage,
  notifyAttendeesViaCampfire,
} from "./campfire";

/** Required fields on the live `campfire.conversations` validator. */
const CONVERSATION_REQUIRED_FIELDS = [
  "_id",
  "_schemaVersion",
  "conversationType",
  "createdByPersonId",
  "encryptionMode",
  "visibility",
  "isActive",
  "messageCount",
  "participantCount",
  "createdAt",
  "updatedAt",
] as const;

/** Required fields on the live `campfire.messages` validator. */
const MESSAGE_REQUIRED_FIELDS = [
  "_id",
  "_schemaVersion",
  "conversationId",
  "senderPersonId",
  "senderEntityId",
  "matrixEventType",
  "messageType",
  "sequence",
  "sentAt",
  "createdAt",
] as const;

const conversationInput = {
  eventId: "event-1",
  eventName: "Harare Farmers Market",
  createdByPersonId: "person-1",
};

const notifyInput = {
  eventId: "event-1",
  eventName: "Harare Farmers Market",
  authorPersonId: "person-1",
  authorEntityId: "entity-1",
  text: "Gates now open at 8am — come early for the best stalls!",
};

beforeEach(() => {
  vi.clearAllMocks();
  conversations.findOne.mockResolvedValue(null);
  conversations.insertOne.mockResolvedValue({ acknowledged: true });
  conversations.findOneAndUpdate.mockResolvedValue({ _id: "conv-1", messageCount: 1 });
  messages.insertOne.mockResolvedValue({ acknowledged: true });
});

describe("buildEventConversationDoc", () => {
  it("emits every validator-required field", () => {
    const doc = buildEventConversationDoc(conversationInput) as unknown as Record<
      string,
      unknown
    >;
    for (const field of CONVERSATION_REQUIRED_FIELDS) {
      expect(doc, `missing required field ${field}`).toHaveProperty(field);
      expect(doc[field], `required field ${field} must not be undefined/null`).not.toBeNull();
    }
  });

  it("shapes the paired system conversation per the routing contract", () => {
    const doc = buildEventConversationDoc(conversationInput);
    expect(doc._id).toMatch(/^[0-9a-f-]{36}$/);
    expect(doc._schemaVersion).toBe("v3.1");
    expect(doc.conversationType).toBe("system");
    expect(doc.createdByPersonId).toBe("person-1");
    // Server-readable system messages — encryption stays off.
    expect(doc.encryptionMode).toBe("none");
    expect(doc.visibility).toBe("private");
    expect(doc.isActive).toBe(true);
    expect(doc.messageCount).toBe(0);
    expect(doc.participantCount).toBe(0);
    expect(doc.eventId).toBe("event-1");
    expect(doc.name).toBe("Harare Farmers Market");
    expect(doc.mukoko).toEqual({ routingSource: "nhimbe" });
    expect(doc.createdAt).toBeInstanceOf(Date);
    expect(doc.updatedAt).toBeInstanceOf(Date);
  });
});

describe("buildSystemMessageDoc", () => {
  const input = {
    conversationId: "conv-1",
    senderPersonId: "person-1",
    senderEntityId: "entity-1",
    content: "Venue moved to the east lawn.",
    sequence: 4,
  };

  it("emits every validator-required field", () => {
    const doc = buildSystemMessageDoc(input) as unknown as Record<string, unknown>;
    for (const field of MESSAGE_REQUIRED_FIELDS) {
      expect(doc, `missing required field ${field}`).toHaveProperty(field);
      expect(doc[field], `required field ${field} must not be undefined/null`).not.toBeNull();
    }
  });

  it("carries the plaintext body and nhimbe attribution", () => {
    const doc = buildSystemMessageDoc(input);
    expect(doc.matrixEventType).toBe("m.room.message");
    expect(doc.messageType).toBe("system");
    expect(doc.sequence).toBe(4);
    expect(doc.content).toBe("Venue moved to the east lawn.");
    expect(doc.mukoko).toEqual({ originatingApp: "nhimbe" });
    expect(doc.sentAt).toBeInstanceOf(Date);
  });
});

describe("ensureEventConversation (find-or-create)", () => {
  it("returns the existing paired conversation without inserting", async () => {
    const existing = { _id: "conv-existing", eventId: "event-1", messageCount: 7 };
    conversations.findOne.mockResolvedValueOnce(existing);

    const conversation = await ensureEventConversation(conversationInput);

    expect(conversation).toBe(existing);
    expect(conversations.findOne).toHaveBeenCalledWith({ eventId: "event-1" });
    expect(conversations.insertOne).not.toHaveBeenCalled();
  });

  it("creates the conversation on first use", async () => {
    const conversation = await ensureEventConversation(conversationInput);

    expect(conversations.insertOne).toHaveBeenCalledTimes(1);
    expect(conversations.insertOne).toHaveBeenCalledWith(conversation);
    expect(conversation.conversationType).toBe("system");
    expect(conversation.eventId).toBe("event-1");
  });

  it("falls back to the winner's conversation on a lost create race", async () => {
    const winner = { _id: "conv-winner", eventId: "event-1" };
    conversations.insertOne.mockRejectedValueOnce(
      Object.assign(new Error("dup"), { code: 11000 }),
    );
    conversations.findOne
      .mockResolvedValueOnce(null) // initial lookup: nothing yet
      .mockResolvedValueOnce(winner); // post-race re-read

    const conversation = await ensureEventConversation(conversationInput);
    expect(conversation).toBe(winner);
  });
});

describe("appendSystemMessage (sequence)", () => {
  it("claims the sequence atomically from the bumped messageCount", async () => {
    conversations.findOneAndUpdate.mockResolvedValueOnce({ _id: "conv-1", messageCount: 5 });

    const message = await appendSystemMessage({
      conversationId: "conv-1",
      senderPersonId: "person-1",
      senderEntityId: "entity-1",
      content: "Starting in 15 minutes.",
    });

    const [filter, update, options] = conversations.findOneAndUpdate.mock.calls[0];
    expect(filter).toEqual({ _id: "conv-1" });
    expect(update.$inc).toEqual({ messageCount: 1 });
    expect(update.$set.lastMessageAt).toBeInstanceOf(Date);
    expect(options).toEqual({ returnDocument: "after" });

    expect(message.sequence).toBe(5);
    expect(messages.insertOne).toHaveBeenCalledWith(message);
  });

  it("throws when the conversation does not exist (no orphan messages)", async () => {
    conversations.findOneAndUpdate.mockResolvedValueOnce(null);
    await expect(
      appendSystemMessage({
        conversationId: "conv-gone",
        senderPersonId: "person-1",
        senderEntityId: "entity-1",
        content: "hello?",
      }),
    ).rejects.toThrow(/not found/);
    expect(messages.insertOne).not.toHaveBeenCalled();
  });
});

describe("notifyAttendeesViaCampfire (the write-through hook)", () => {
  it("routes an announcement end to end: find-or-create, then system message", async () => {
    conversations.findOne.mockResolvedValueOnce({ _id: "conv-1", eventId: "event-1" });
    conversations.findOneAndUpdate.mockResolvedValueOnce({ _id: "conv-1", messageCount: 3 });

    await notifyAttendeesViaCampfire(notifyInput);

    expect(conversations.insertOne).not.toHaveBeenCalled();
    expect(messages.insertOne).toHaveBeenCalledTimes(1);
    const doc = messages.insertOne.mock.calls[0][0];
    expect(doc.conversationId).toBe("conv-1");
    expect(doc.senderPersonId).toBe("person-1");
    expect(doc.senderEntityId).toBe("entity-1");
    expect(doc.content).toBe(notifyInput.text);
    expect(doc.sequence).toBe(3);
  });

  it("never throws when the conversation lookup fails", async () => {
    conversations.findOne.mockRejectedValueOnce(new Error("campfire down"));

    await expect(notifyAttendeesViaCampfire(notifyInput)).resolves.toBeUndefined();
    expect(messages.insertOne).not.toHaveBeenCalled();
    expect(campfireLogger.error).toHaveBeenCalledWith(
      "Campfire announcement write-through failed",
      expect.objectContaining({ error: expect.any(Error) }),
    );
  });

  it("never throws when the message insert fails", async () => {
    conversations.findOne.mockResolvedValueOnce({ _id: "conv-1", eventId: "event-1" });
    messages.insertOne.mockRejectedValueOnce(new Error("validator rejected"));

    await expect(notifyAttendeesViaCampfire(notifyInput)).resolves.toBeUndefined();
    expect(campfireLogger.error).toHaveBeenCalled();
  });
});
