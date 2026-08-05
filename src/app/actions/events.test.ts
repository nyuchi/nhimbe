import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// Guard imports (`server-only` transitively, via the Mongo layer) so
// createEventForPerson can be unit-tested with fake collections — it takes
// an already-resolved person, so the WorkOS/dev-bypass identity dance in
// `createEvent` itself doesn't need mocking here.
const events = { insertOne: vi.fn(), findOne: vi.fn(), updateOne: vi.fn() };
const persons = { findOne: vi.fn() };
vi.mock("@/lib/mongo/databases", () => ({
  eventsCollection: vi.fn(async () => events),
  personsCollection: vi.fn(async () => persons),
}));

const ensureHostEntityForPerson = vi.hoisted(() => vi.fn());
const getEntityById = vi.hoisted(() => vi.fn());
const listHostEntitiesForPerson = vi.hoisted(() => vi.fn());
vi.mock("@/lib/mongo/entities", () => ({
  ensureHostEntityForPerson,
  getEntityById,
  listHostEntitiesForPerson,
}));

const attachEventToCalendar = vi.hoisted(() => vi.fn());
const detachEventFromCalendar = vi.hoisted(() => vi.fn());
const getCalendarById = vi.hoisted(() => vi.fn());
vi.mock("@/lib/mongo/calendars", () => ({
  attachEventToCalendar,
  detachEventFromCalendar,
  getCalendarById,
}));

const indexEventEmbedding = vi.hoisted(() => vi.fn());
vi.mock("@/lib/ai/event-index", () => ({ indexEventEmbedding }));

// createEventForPerson never touches these — they're only exercised by the
// `createEvent` wrapper's identity resolution — but events.ts imports them at
// module scope, so the test environment still needs stand-ins to load it.
vi.mock("@workos-inc/authkit-nextjs", () => ({
  withAuth: vi.fn(async () => ({ user: null })),
}));
vi.mock("@/lib/mongo/users", () => ({
  syncPersonFromWorkos: vi.fn(),
}));
vi.mock("@/lib/auth/dev", () => ({
  isDevBypass: () => true,
  DEV_WORKOS_ID: "workos-dev",
  DEV_EMAIL: "dev@example.com",
  DEV_NAME: "Dev Person",
}));

import { createEventForPerson, updateEventForPerson, type CreateEventActionInput } from "./events";
import type { PersonDoc } from "@/lib/mongo/types";

const person = { _id: "person-1", workosUserId: "workos-1", name: "Dev Person" } as PersonDoc;

const baseInput: CreateEventActionInput = {
  name: "Harare Farmers Market",
  description: "Weekly market.",
  startDate: new Date(Date.now() + 3600_000).toISOString(),
  isOnline: false,
  isFree: true,
  visibility: "public",
  hostMode: "person",
};

const existingEvent = {
  _id: "event-1",
  primaryHostEntityId: "org-entity-1",
  name: "Harare Farmers Market",
  startDate: new Date(Date.now() + 3600_000),
  endDate: new Date(Date.now() + 7200_000),
  location: { "@type": "Place", name: "Venue", address: {} },
  offers: [],
  tags: [],
  mukoko: {},
};

beforeEach(() => {
  vi.clearAllMocks();
  events.insertOne.mockResolvedValue({ acknowledged: true });
  events.findOne.mockResolvedValue(existingEvent);
  events.updateOne.mockResolvedValue({ acknowledged: true });
  ensureHostEntityForPerson.mockResolvedValue("default-entity-1");
  getEntityById.mockResolvedValue({ _id: "default-entity-1", name: "Dev Person" });
  listHostEntitiesForPerson.mockResolvedValue([{ _id: "org-entity-1" }]);
  attachEventToCalendar.mockResolvedValue(undefined);
  detachEventFromCalendar.mockResolvedValue(undefined);
  getCalendarById.mockResolvedValue(null);
  indexEventEmbedding.mockResolvedValue(undefined);
});

describe("createEventForPerson — host entity authorization", () => {
  it("uses the person's default entity on the personal path, never checking memberships", async () => {
    const result = await createEventForPerson(person, baseInput);

    expect(ensureHostEntityForPerson).toHaveBeenCalledWith(person);
    expect(listHostEntitiesForPerson).not.toHaveBeenCalled();
    const doc = events.insertOne.mock.calls[0][0];
    expect(doc.primaryHostEntityId).toBe("default-entity-1");
    expect(result.id).toBe(doc._id);
  });

  it("accepts an explicit hostEntityId the person actually holds a membership on", async () => {
    await createEventForPerson(person, {
      ...baseInput,
      hostMode: "organization",
      hostEntityId: "org-entity-1",
    });

    expect(listHostEntitiesForPerson).toHaveBeenCalledWith("person-1");
    expect(ensureHostEntityForPerson).not.toHaveBeenCalled();
    const doc = events.insertOne.mock.calls[0][0];
    expect(doc.primaryHostEntityId).toBe("org-entity-1");
  });

  it("rejects a hostEntityId the person has no membership on", async () => {
    await expect(
      createEventForPerson(person, {
        ...baseInput,
        hostMode: "organization",
        hostEntityId: "someone-elses-entity",
      }),
    ).rejects.toThrow(/permission to host/i);
    expect(events.insertOne).not.toHaveBeenCalled();
  });

  it("rejects organization mode with no hostEntityId at all", async () => {
    await expect(
      createEventForPerson(person, { ...baseInput, hostMode: "organization" }),
    ).rejects.toThrow(/pick which/i);
    expect(events.insertOne).not.toHaveBeenCalled();
  });
});

describe("createEventForPerson — calendar attach authorization", () => {
  it("allows attaching to a calendar the person personally owns", async () => {
    getCalendarById.mockResolvedValue({ _id: "cal-1", ownerPersonId: "person-1", ownerEntityId: "someone-else" });

    await createEventForPerson(person, { ...baseInput, calendarId: "cal-1" });

    expect(attachEventToCalendar).toHaveBeenCalledWith(expect.any(String), "cal-1");
  });

  it("allows attaching to a calendar owned by the entity being hosted through", async () => {
    getCalendarById.mockResolvedValue({ _id: "cal-1", ownerPersonId: "someone-else", ownerEntityId: "org-entity-1" });

    await createEventForPerson(person, {
      ...baseInput,
      hostMode: "organization",
      hostEntityId: "org-entity-1",
      calendarId: "cal-1",
    });

    expect(attachEventToCalendar).toHaveBeenCalledWith(expect.any(String), "cal-1");
  });

  it("rejects a calendar owned by neither the person nor the hosting entity", async () => {
    getCalendarById.mockResolvedValue({ _id: "cal-1", ownerPersonId: "someone-else", ownerEntityId: "another-entity" });

    await expect(
      createEventForPerson(person, { ...baseInput, calendarId: "cal-1" }),
    ).rejects.toThrow(/your own calendars/i);
    expect(events.insertOne).not.toHaveBeenCalled();
    expect(attachEventToCalendar).not.toHaveBeenCalled();
  });

  it("does not fall back to entity ownership on the personal host path", async () => {
    // Even though the person happens to hold membership on org-entity-1 via
    // listHostEntitiesForPerson, the personal path never resolves an
    // explicit hostEntityId — so a calendar owned by that entity must not
    // be treated as attachable.
    getCalendarById.mockResolvedValue({ _id: "cal-1", ownerPersonId: "someone-else", ownerEntityId: "org-entity-1" });

    await expect(
      createEventForPerson(person, { ...baseInput, calendarId: "cal-1" }),
    ).rejects.toThrow(/your own calendars/i);
  });

  it("rejects a calendar id that doesn't exist", async () => {
    getCalendarById.mockResolvedValue(null);
    await expect(
      createEventForPerson(person, { ...baseInput, calendarId: "missing-cal" }),
    ).rejects.toThrow(/your own calendars/i);
  });
});

describe("createEventForPerson — venue placeId", () => {
  it("stores a resolved placeId on the event doc", async () => {
    await createEventForPerson(person, { ...baseInput, placeId: "place-1" });
    const doc = events.insertOne.mock.calls[0][0];
    expect(doc.placeId).toBe("place-1");
  });

  it("defaults to null when no placeId was resolved (hand-typed venue)", async () => {
    await createEventForPerson(person, baseInput);
    const doc = events.insertOne.mock.calls[0][0];
    expect(doc.placeId).toBeNull();
  });

  it("never stores a placeId for an online event", async () => {
    await createEventForPerson(person, {
      ...baseInput,
      isOnline: true,
      placeId: "place-1",
      meetingUrl: "https://zoom.us/j/123",
    });
    const doc = events.insertOne.mock.calls[0][0];
    expect(doc.placeId).toBeNull();
  });
});

describe("updateEventForPerson — calendar move/detach", () => {
  it("attaches to a calendar owned by the entity already hosting the event", async () => {
    getCalendarById.mockResolvedValue({ _id: "cal-1", ownerPersonId: "someone-else", ownerEntityId: "org-entity-1" });

    await updateEventForPerson(person, "event-1", { calendarId: "cal-1" });

    expect(attachEventToCalendar).toHaveBeenCalledWith("event-1", "cal-1");
    expect(detachEventFromCalendar).not.toHaveBeenCalled();
  });

  it("attaches to a calendar the person personally owns", async () => {
    getCalendarById.mockResolvedValue({ _id: "cal-1", ownerPersonId: "person-1", ownerEntityId: "someone-else" });

    await updateEventForPerson(person, "event-1", { calendarId: "cal-1" });

    expect(attachEventToCalendar).toHaveBeenCalledWith("event-1", "cal-1");
  });

  it("rejects a calendar owned by neither the person nor the event's host entity", async () => {
    getCalendarById.mockResolvedValue({ _id: "cal-1", ownerPersonId: "someone-else", ownerEntityId: "another-entity" });

    await expect(
      updateEventForPerson(person, "event-1", { calendarId: "cal-1" }),
    ).rejects.toThrow(/your own calendars/i);
    expect(attachEventToCalendar).not.toHaveBeenCalled();
  });

  it("detaches when calendarId is explicitly null", async () => {
    await updateEventForPerson(person, "event-1", { calendarId: null });

    expect(detachEventFromCalendar).toHaveBeenCalledWith("event-1");
    expect(attachEventToCalendar).not.toHaveBeenCalled();
  });

  it("leaves the calendar attachment untouched when calendarId is omitted", async () => {
    await updateEventForPerson(person, "event-1", { name: "New name" });

    expect(attachEventToCalendar).not.toHaveBeenCalled();
    expect(detachEventFromCalendar).not.toHaveBeenCalled();
  });

  it("refuses to update an event the person doesn't host", async () => {
    listHostEntitiesForPerson.mockResolvedValue([{ _id: "some-other-entity" }]);

    await expect(
      updateEventForPerson(person, "event-1", { calendarId: "cal-1" }),
    ).rejects.toThrow(/not a host/i);
    expect(attachEventToCalendar).not.toHaveBeenCalled();
  });
});
