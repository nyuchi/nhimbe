import { describe, it, expect, vi, beforeEach } from "vitest";

// Guard imports (`server-only`), auth, and the Mongo driver layer so the
// host-gated action can be unit-tested with fake collections.
vi.mock("server-only", () => ({}));

const events = { findOne: vi.fn() };
const updates = { insertOne: vi.fn() };
const persons = { findOne: vi.fn() };

vi.mock("@/lib/mongo/databases", () => ({
  eventsCollection: vi.fn(async () => events),
  eventUpdatesCollection: vi.fn(async () => updates),
  personsCollection: vi.fn(async () => persons),
}));

const listHostEntitiesForPerson = vi.hoisted(() => vi.fn());
vi.mock("@/lib/mongo/entities", () => ({ listHostEntitiesForPerson }));

const notifyAttendeesViaCampfire = vi.hoisted(() => vi.fn());
vi.mock("@/lib/mongo/campfire", () => ({ notifyAttendeesViaCampfire }));

const getPlatformSettings = vi.hoisted(() => vi.fn());
vi.mock("@/lib/mongo/settings", () => ({ getPlatformSettings }));

const consumeDailyUsage = vi.hoisted(() => vi.fn());
const FakeUsageLimitExceededError = vi.hoisted(() => class extends Error {});
vi.mock("@/lib/mongo/usage-limits", () => ({
  consumeDailyUsage,
  UsageLimitExceededError: FakeUsageLimitExceededError,
}));

// Act through the local dev bypass so no WorkOS session machinery is needed.
vi.mock("@/lib/auth/dev", () => ({
  isDevBypass: () => true,
  DEV_WORKOS_ID: "workos-dev",
  DEV_EMAIL: "dev@example.com",
  DEV_NAME: "Dev Person",
}));
vi.mock("@workos-inc/authkit-nextjs", () => ({
  withAuth: vi.fn(async () => ({ user: null })),
}));

const updatesLogger = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));
vi.mock("@/lib/observability", () => ({ createLogger: vi.fn(() => updatesLogger) }));

import { postEventUpdate } from "./event-updates";

const person = { _id: "person-1", workosUserId: "workos-dev", name: "Dev Person" };
const event = { _id: "event-1", name: "Harare Farmers Market", primaryHostEntityId: "entity-1" };

beforeEach(() => {
  vi.clearAllMocks();
  persons.findOne.mockResolvedValue(person);
  events.findOne.mockResolvedValue(event);
  updates.insertOne.mockResolvedValue({ acknowledged: true });
  listHostEntitiesForPerson.mockResolvedValue([{ _id: "entity-1" }]);
  notifyAttendeesViaCampfire.mockResolvedValue(undefined);
  getPlatformSettings.mockResolvedValue({ freeBlastsPerDayPerEvent: 1 });
  consumeDailyUsage.mockResolvedValue(1);
});

describe("postEventUpdate", () => {
  it("inserts a v3.1 events.updates doc attributed to the host entity", async () => {
    const result = await postEventUpdate({
      eventId: "event-1",
      text: "Gates open at 8am.",
      updateType: "schedule_change",
      notifyAttendees: false,
    });

    expect(updates.insertOne).toHaveBeenCalledTimes(1);
    const doc = updates.insertOne.mock.calls[0][0];
    expect(result.updateId).toBe(doc._id);
    expect(doc._id).toMatch(/^[0-9a-f-]{36}$/);
    expect(doc._schemaVersion).toBe("v3.1");
    expect(doc.createdAt).toBeInstanceOf(Date);
    expect(doc.updatedAt).toBeInstanceOf(Date);
    expect(doc.eventId).toBe("event-1");
    expect(doc.authorPersonId).toBe("person-1");
    expect(doc.authorEntityId).toBe("entity-1");
    expect(doc.updateType).toBe("schedule_change");
    expect(doc.text).toBe("Gates open at 8am.");
    expect(doc.isPinned).toBe(false);
    expect(doc.notifyAttendees).toBe(false);
  });

  it("does not touch Campfire when notifyAttendees is false", async () => {
    await postEventUpdate({ eventId: "event-1", text: "Minor note." });
    expect(notifyAttendeesViaCampfire).not.toHaveBeenCalled();
  });

  it("routes the announcement into Campfire when notifyAttendees is true", async () => {
    await postEventUpdate({
      eventId: "event-1",
      text: "Venue moved to the east lawn.",
      notifyAttendees: true,
    });

    expect(notifyAttendeesViaCampfire).toHaveBeenCalledTimes(1);
    expect(notifyAttendeesViaCampfire).toHaveBeenCalledWith({
      eventId: "event-1",
      eventName: "Harare Farmers Market",
      authorPersonId: "person-1",
      authorEntityId: "entity-1",
      text: "Venue moved to the east lawn.",
    });
    // The primary write always precedes the write-through.
    expect(updates.insertOne.mock.invocationCallOrder[0]).toBeLessThan(
      notifyAttendeesViaCampfire.mock.invocationCallOrder[0],
    );
  });

  it("a Campfire failure can never fail the update", async () => {
    notifyAttendeesViaCampfire.mockRejectedValueOnce(new Error("campfire down"));

    const result = await postEventUpdate({
      eventId: "event-1",
      text: "Starting soon!",
      notifyAttendees: true,
    });

    expect(result.updateId).toBeTruthy();
    expect(updatesLogger.error).toHaveBeenCalledWith(
      "Campfire notification failed for event update",
      expect.objectContaining({ error: expect.any(Error) }),
    );
  });

  it("rejects a non-host without writing anything", async () => {
    listHostEntitiesForPerson.mockResolvedValueOnce([{ _id: "someone-elses-entity" }]);

    await expect(
      postEventUpdate({ eventId: "event-1", text: "hijack", notifyAttendees: true }),
    ).rejects.toThrow("Not authorized");
    expect(updates.insertOne).not.toHaveBeenCalled();
    expect(notifyAttendeesViaCampfire).not.toHaveBeenCalled();
  });

  it("checks the free-plan blast cap before writing, keyed by event", async () => {
    await postEventUpdate({ eventId: "event-1", text: "Gates open at 8am.", notifyAttendees: true });

    expect(consumeDailyUsage).toHaveBeenCalledWith({
      subjectId: "event-1",
      counterType: "blast",
      limit: 1,
    });
    // The cap check runs before the insert.
    expect(consumeDailyUsage.mock.invocationCallOrder[0]).toBeLessThan(
      updates.insertOne.mock.invocationCallOrder[0],
    );
  });

  it("does not check the blast cap for a plain update (no notify)", async () => {
    await postEventUpdate({ eventId: "event-1", text: "Minor note.", notifyAttendees: false });
    expect(consumeDailyUsage).not.toHaveBeenCalled();
  });

  it("refuses to blast once the free-plan daily cap is reached, writing nothing", async () => {
    consumeDailyUsage.mockRejectedValueOnce(new FakeUsageLimitExceededError("limit reached"));

    await expect(
      postEventUpdate({ eventId: "event-1", text: "Another blast.", notifyAttendees: true }),
    ).rejects.toThrow("limit reached");
    expect(updates.insertOne).not.toHaveBeenCalled();
    expect(notifyAttendeesViaCampfire).not.toHaveBeenCalled();
  });

  it("rejects empty text and falls back to announcement for unknown types", async () => {
    await expect(postEventUpdate({ eventId: "event-1", text: "   " })).rejects.toThrow(
      /update before posting/,
    );

    await postEventUpdate({
      eventId: "event-1",
      text: "hello",
      // @ts-expect-error — hostile/unknown updateType must not pass through.
      updateType: "totally_bogus",
    });
    expect(updates.insertOne.mock.calls[0][0].updateType).toBe("announcement");
  });
});
