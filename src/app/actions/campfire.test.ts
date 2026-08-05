import { describe, it, expect, vi, beforeEach } from "vitest";

// Guard `server-only`, auth, and the Mongo driver so the live-chat write can be
// unit-tested with fake collections (no cluster here). The campfire action
// reaches its DB through the shared client handle, so we mock getMongoClient.
vi.mock("server-only", () => ({}));

const conversations = { findOne: vi.fn(), findOneAndUpdate: vi.fn(), updateOne: vi.fn() };
const messages = { insertOne: vi.fn(), find: vi.fn() };
const readReceipts = { updateOne: vi.fn() };

const campfireDb = {
  collection: (name: string) =>
    name === "conversations" ? conversations : name === "messages" ? messages : readReceipts,
};

vi.mock("@/lib/mongo/client", () => ({
  getMongoClient: vi.fn(async () => ({ db: () => campfireDb })),
}));

const persons = { findOne: vi.fn() };
const events = { findOne: vi.fn() };
vi.mock("@/lib/mongo/databases", () => ({
  personsCollection: vi.fn(async () => persons),
  eventsCollection: vi.fn(async () => events),
}));

const ensureEventChatConversation = vi.hoisted(() => vi.fn());
vi.mock("@/lib/mongo/campfire", () => ({ ensureEventChatConversation }));

const ensureHostEntityForPerson = vi.hoisted(() => vi.fn());
vi.mock("@/lib/mongo/entities", () => ({ ensureHostEntityForPerson }));

const syncPersonFromWorkos = vi.hoisted(() => vi.fn());
vi.mock("@/lib/mongo/users", () => ({ syncPersonFromWorkos }));

// Act through the local dev bypass — no WorkOS session machinery needed.
vi.mock("@/lib/auth/dev", () => ({
  isDevBypass: () => true,
  DEV_WORKOS_ID: "workos-dev",
  DEV_EMAIL: "dev@example.com",
  DEV_NAME: "Dev Person",
}));
vi.mock("@workos-inc/authkit-nextjs", () => ({
  withAuth: vi.fn(async () => ({ user: null })),
}));

import { postCampfireMessage, ensureEventChatConversationAction } from "./campfire";

const person = { _id: "person-1", workosUserId: "workos-dev", name: "Dev Person" };

beforeEach(() => {
  vi.clearAllMocks();
  persons.findOne.mockResolvedValue(person);
  conversations.findOne.mockResolvedValue({ _id: "conv-1", isActive: true, messageCount: 4 });
  conversations.findOneAndUpdate.mockResolvedValue({ _id: "conv-1", messageCount: 5 });
  messages.insertOne.mockResolvedValue({ acknowledged: true });
  readReceipts.updateOne.mockResolvedValue({ acknowledged: true });
  ensureHostEntityForPerson.mockResolvedValue("entity-1");
  events.findOne.mockResolvedValue({ _id: "event-1", name: "Harare Farmers Market" });
  ensureEventChatConversation.mockResolvedValue({ _id: "conv-9" });
});

describe("postCampfireMessage (atomic sequence — L2)", () => {
  it("claims the sequence via an atomic $inc findOneAndUpdate", async () => {
    const result = await postCampfireMessage("conv-1", "Hello campfire!");

    const [filter, update, options] = conversations.findOneAndUpdate.mock.calls[0];
    expect(filter).toEqual({ _id: "conv-1" });
    expect(update.$inc).toEqual({ messageCount: 1 });
    expect(update.$set.lastMessageAt).toBeInstanceOf(Date);
    expect(update.$set.updatedAt).toBeInstanceOf(Date);
    expect(options).toEqual({ returnDocument: "after" });

    // The ordinal is the post-increment count returned by the bump.
    expect(result.message.text).toBe("Hello campfire!");
    const inserted = messages.insertOne.mock.calls[0][0];
    expect(inserted.sequence).toBe(5);
    expect(inserted.messageType).toBe("text");
  });

  it("does not read-max the sequence, nor double-bump the counter", async () => {
    await postCampfireMessage("conv-1", "hi");
    // The racy read-max+1 path is gone: no messages.find for the sequence, and
    // no separate updateOne (the findOneAndUpdate already incremented).
    expect(messages.find).not.toHaveBeenCalled();
    expect(conversations.updateOne).not.toHaveBeenCalled();
  });

  it("hands concurrent posts distinct sequences (no collision)", async () => {
    let counter = 4;
    conversations.findOneAndUpdate.mockImplementation(async () => ({
      _id: "conv-1",
      messageCount: ++counter, // atomic increment on the server
    }));

    await Promise.all([
      postCampfireMessage("conv-1", "first"),
      postCampfireMessage("conv-1", "second"),
    ]);

    const seqs = messages.insertOne.mock.calls.map((c) => c[0].sequence).sort();
    expect(seqs).toEqual([5, 6]);
  });

  it("refuses to post when the bump finds no conversation", async () => {
    conversations.findOneAndUpdate.mockResolvedValueOnce(null);
    await expect(postCampfireMessage("conv-gone", "hi")).rejects.toThrow(/no longer available/);
    expect(messages.insertOne).not.toHaveBeenCalled();
  });
});

describe("ensureEventChatConversationAction", () => {
  it("resolves the event's paired group chat conversation id", async () => {
    const conversationId = await ensureEventChatConversationAction("event-1");
    expect(conversationId).toBe("conv-9");
    expect(ensureEventChatConversation).toHaveBeenCalledWith({
      eventId: "event-1",
      eventName: "Harare Farmers Market",
      createdByPersonId: "person-1",
    });
  });

  it("throws when the event does not exist", async () => {
    events.findOne.mockResolvedValueOnce(null);
    await expect(ensureEventChatConversationAction("nope")).rejects.toThrow(
      /could not be found/,
    );
    expect(ensureEventChatConversation).not.toHaveBeenCalled();
  });
});
