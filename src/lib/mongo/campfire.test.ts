import { describe, it, expect, vi, beforeEach } from "vitest";

// Guard imports (`server-only`) and the Mongo driver layer so the campfire
// write-through can be unit-tested with fake collections (no cluster here).
vi.mock("server-only", () => ({}));

const conversations = {
  findOne: vi.fn(),
  insertOne: vi.fn(),
  updateOne: vi.fn(),
  findOneAndUpdate: vi.fn(),
};
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
  buildCalendarConversationDoc,
  ensureCalendarConversation,
  buildCircleConversationDoc,
  ensureCircleConversation,
  buildEventChatConversationDoc,
  ensureEventChatConversation,
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
  conversations.updateOne.mockResolvedValue({ acknowledged: true, upsertedCount: 1 });
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

describe("ensureEventConversation (find-or-create, upsert)", () => {
  it("scopes the find-or-create to the SYSTEM conversation only (M1)", async () => {
    conversations.findOne.mockResolvedValueOnce({
      _id: "conv-1",
      eventId: "event-1",
      conversationType: "system",
    });

    await ensureEventConversation(conversationInput);

    // Both the upsert filter and the read-back are scoped to the system
    // conversation, so a live-chat conversation on the same event is untouched.
    const [filter, update, options] = conversations.updateOne.mock.calls[0];
    expect(filter).toEqual({ eventId: "event-1", conversationType: "system" });
    expect(options).toEqual({ upsert: true });
    expect(update.$setOnInsert.conversationType).toBe("system");
    expect(update.$setOnInsert.eventId).toBe("event-1");
    expect(conversations.findOne).toHaveBeenCalledWith({
      eventId: "event-1",
      conversationType: "system",
    });
    // Never a bare findOne/insertOne that could catch a live-chat conversation.
    expect(conversations.insertOne).not.toHaveBeenCalled();
  });

  it("seeds every validator-required field only on insert ($setOnInsert)", async () => {
    conversations.findOne.mockResolvedValueOnce({ _id: "conv-1", conversationType: "system" });

    await ensureEventConversation(conversationInput);

    const seed = conversations.updateOne.mock.calls[0][1].$setOnInsert as Record<string, unknown>;
    for (const field of CONVERSATION_REQUIRED_FIELDS) {
      expect(seed, `seed missing required field ${field}`).toHaveProperty(field);
      expect(seed[field], `seed field ${field} must not be null`).not.toBeNull();
    }
  });

  it("returns the read-back conversation (upsert does not return the doc)", async () => {
    const winner = { _id: "conv-winner", eventId: "event-1", conversationType: "system" };
    conversations.findOne.mockResolvedValueOnce(winner);

    const conversation = await ensureEventConversation(conversationInput);
    expect(conversation).toBe(winner);
  });

  it("is idempotent under a simulated race — both callers converge on one row", async () => {
    // Two concurrent announcements: each upserts (one inserts, one no-ops), and
    // both read back the SAME winning system conversation.
    const winner = { _id: "conv-winner", eventId: "event-1", conversationType: "system" };
    conversations.findOne.mockResolvedValue(winner);

    const [a, b] = await Promise.all([
      ensureEventConversation(conversationInput),
      ensureEventConversation(conversationInput),
    ]);

    expect(a).toBe(winner);
    expect(b).toBe(winner);
    expect(conversations.updateOne).toHaveBeenCalledTimes(2);
    for (const call of conversations.updateOne.mock.calls) {
      expect(call[2]).toEqual({ upsert: true });
    }
    expect(conversations.insertOne).not.toHaveBeenCalled();
  });

  it("throws when the conversation cannot be resolved after upsert", async () => {
    conversations.findOne.mockResolvedValueOnce(null);
    await expect(ensureEventConversation(conversationInput)).rejects.toThrow(/could not be resolved/);
  });
});

const calendarConversationInput = {
  calendarId: "calendar-1",
  calendarName: "Harare Stroller Club",
  createdByPersonId: "person-1",
};

describe("buildCalendarConversationDoc", () => {
  it("emits every validator-required field", () => {
    const doc = buildCalendarConversationDoc(calendarConversationInput) as unknown as Record<
      string,
      unknown
    >;
    for (const field of CONVERSATION_REQUIRED_FIELDS) {
      expect(doc, `missing required field ${field}`).toHaveProperty(field);
      expect(doc[field], `required field ${field} must not be undefined/null`).not.toBeNull();
    }
  });

  it("is a GROUP conversation paired to the calendar, not a system one", () => {
    const doc = buildCalendarConversationDoc(calendarConversationInput);
    expect(doc.conversationType).toBe("group");
    expect(doc.calendarId).toBe("calendar-1");
    expect(doc.name).toBe("Harare Stroller Club");
    expect(doc.encryptionMode).toBe("none");
    expect(doc.mukoko).toEqual({ routingSource: "nhimbe" });
  });
});

describe("ensureCalendarConversation (find-or-create, upsert)", () => {
  it("scopes the find-or-create to the calendar's GROUP conversation only", async () => {
    conversations.findOne.mockResolvedValueOnce({
      _id: "conv-1",
      calendarId: "calendar-1",
      conversationType: "group",
    });

    await ensureCalendarConversation(calendarConversationInput);

    const [filter, update, options] = conversations.updateOne.mock.calls[0];
    expect(filter).toEqual({ calendarId: "calendar-1", conversationType: "group" });
    expect(options).toEqual({ upsert: true });
    expect(update.$setOnInsert.conversationType).toBe("group");
    expect(update.$setOnInsert.calendarId).toBe("calendar-1");
  });

  it("returns the read-back conversation (upsert does not return the doc)", async () => {
    const winner = { _id: "conv-winner", calendarId: "calendar-1", conversationType: "group" };
    conversations.findOne.mockResolvedValueOnce(winner);

    const conversation = await ensureCalendarConversation(calendarConversationInput);
    expect(conversation).toBe(winner);
  });

  it("throws when the conversation cannot be resolved after upsert", async () => {
    conversations.findOne.mockResolvedValueOnce(null);
    await expect(ensureCalendarConversation(calendarConversationInput)).rejects.toThrow(
      /could not be resolved/,
    );
  });
});

const circleConversationInput = {
  circleId: "circle-1",
  circleName: "Harare Runners",
  createdByPersonId: "person-1",
};

describe("buildCircleConversationDoc", () => {
  it("emits every validator-required field", () => {
    const doc = buildCircleConversationDoc(circleConversationInput) as unknown as Record<
      string,
      unknown
    >;
    for (const field of CONVERSATION_REQUIRED_FIELDS) {
      expect(doc, `missing required field ${field}`).toHaveProperty(field);
      expect(doc[field], `required field ${field} must not be undefined/null`).not.toBeNull();
    }
  });

  it("is a GROUP conversation paired to the circle, distinct from its post stream", () => {
    const doc = buildCircleConversationDoc(circleConversationInput);
    expect(doc.conversationType).toBe("group");
    expect(doc.circleId).toBe("circle-1");
    expect(doc.name).toBe("Harare Runners");
    expect(doc.encryptionMode).toBe("none");
  });
});

describe("ensureCircleConversation (find-or-create, upsert)", () => {
  it("scopes the find-or-create to the circle's GROUP conversation only", async () => {
    conversations.findOne.mockResolvedValueOnce({
      _id: "conv-1",
      circleId: "circle-1",
      conversationType: "group",
    });

    await ensureCircleConversation(circleConversationInput);

    const [filter, update, options] = conversations.updateOne.mock.calls[0];
    expect(filter).toEqual({ circleId: "circle-1", conversationType: "group" });
    expect(options).toEqual({ upsert: true });
    expect(update.$setOnInsert.conversationType).toBe("group");
    expect(update.$setOnInsert.circleId).toBe("circle-1");
  });

  it("returns the read-back conversation (upsert does not return the doc)", async () => {
    const winner = { _id: "conv-winner", circleId: "circle-1", conversationType: "group" };
    conversations.findOne.mockResolvedValueOnce(winner);

    const conversation = await ensureCircleConversation(circleConversationInput);
    expect(conversation).toBe(winner);
  });

  it("throws when the conversation cannot be resolved after upsert", async () => {
    conversations.findOne.mockResolvedValueOnce(null);
    await expect(ensureCircleConversation(circleConversationInput)).rejects.toThrow(
      /could not be resolved/,
    );
  });
});

const eventChatConversationInput = {
  eventId: "event-1",
  eventName: "Harare Farmers Market",
  createdByPersonId: "person-1",
};

describe("buildEventChatConversationDoc", () => {
  it("emits every validator-required field", () => {
    const doc = buildEventChatConversationDoc(eventChatConversationInput) as unknown as Record<
      string,
      unknown
    >;
    for (const field of CONVERSATION_REQUIRED_FIELDS) {
      expect(doc, `missing required field ${field}`).toHaveProperty(field);
      expect(doc[field], `required field ${field} must not be undefined/null`).not.toBeNull();
    }
  });

  it("is a GROUP conversation, distinct from the SYSTEM announcement channel on the same event", () => {
    const doc = buildEventChatConversationDoc(eventChatConversationInput);
    expect(doc.conversationType).toBe("group");
    expect(doc.eventId).toBe("event-1");
    expect(doc.name).toBe("Harare Farmers Market");
  });
});

describe("ensureEventChatConversation (find-or-create, upsert)", () => {
  it("scopes the find-or-create to the event's GROUP conversation, never the SYSTEM one", async () => {
    conversations.findOne.mockResolvedValueOnce({
      _id: "conv-1",
      eventId: "event-1",
      conversationType: "group",
    });

    await ensureEventChatConversation(eventChatConversationInput);

    const [filter, update, options] = conversations.updateOne.mock.calls[0];
    expect(filter).toEqual({ eventId: "event-1", conversationType: "group" });
    expect(options).toEqual({ upsert: true });
    expect(update.$setOnInsert.conversationType).toBe("group");
  });

  it("returns the read-back conversation (upsert does not return the doc)", async () => {
    const winner = { _id: "conv-winner", eventId: "event-1", conversationType: "group" };
    conversations.findOne.mockResolvedValueOnce(winner);

    const conversation = await ensureEventChatConversation(eventChatConversationInput);
    expect(conversation).toBe(winner);
  });

  it("throws when the conversation cannot be resolved after upsert", async () => {
    conversations.findOne.mockResolvedValueOnce(null);
    await expect(ensureEventChatConversation(eventChatConversationInput)).rejects.toThrow(
      /could not be resolved/,
    );
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
    conversations.findOne.mockResolvedValueOnce({
      _id: "conv-1",
      eventId: "event-1",
      conversationType: "system",
    });
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

  it("never throws when the upsert fails", async () => {
    conversations.updateOne.mockRejectedValueOnce(new Error("campfire down"));

    await expect(notifyAttendeesViaCampfire(notifyInput)).resolves.toBeUndefined();
    expect(messages.insertOne).not.toHaveBeenCalled();
    expect(campfireLogger.error).toHaveBeenCalledWith(
      "Campfire announcement write-through failed",
      expect.objectContaining({ error: expect.any(Error) }),
    );
  });

  it("never throws when the message insert fails", async () => {
    conversations.findOne.mockResolvedValueOnce({
      _id: "conv-1",
      eventId: "event-1",
      conversationType: "system",
    });
    messages.insertOne.mockRejectedValueOnce(new Error("validator rejected"));

    await expect(notifyAttendeesViaCampfire(notifyInput)).resolves.toBeUndefined();
    expect(campfireLogger.error).toHaveBeenCalled();
  });
});
