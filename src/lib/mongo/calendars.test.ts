import { describe, it, expect, vi, beforeEach } from "vitest";

// Guard imports (`server-only`) and the Mongo driver layer so the calendars
// module can be unit-tested with fake collections (no cluster here).
vi.mock("server-only", () => ({}));

const calendars = {
  insertOne: vi.fn(),
  findOne: vi.fn(),
  updateOne: vi.fn(),
  findOneAndUpdate: vi.fn(),
  find: vi.fn(),
};
const follows = {
  findOneAndUpdate: vi.fn(),
  findOne: vi.fn(),
  find: vi.fn(),
};

/** Minimal chainable cursor stub — `.sort().toArray()` etc, resolving to `docs`. */
function cursor<T>(docs: T[]) {
  const c = {
    sort: vi.fn(() => c),
    limit: vi.fn(() => c),
    project: vi.fn(() => c),
    toArray: vi.fn(async () => docs),
  };
  return c;
}
const events = {
  findOneAndUpdate: vi.fn(),
  find: vi.fn(),
};

vi.mock("@/lib/mongo/databases", () => ({
  calendarsCollection: vi.fn(async () => calendars),
  calendarFollowsCollection: vi.fn(async () => follows),
  eventsCollection: vi.fn(async () => events),
}));

// listCalendarEvents delegates to the shared listEvents fan-out — stub it.
vi.mock("@/lib/mongo/events", () => ({
  listEvents: vi.fn(async () => ({ events: [], total: 0, limit: 100, offset: 0 })),
}));

import {
  buildCalendarDoc,
  createCalendar,
  canViewCalendar,
  buildFollowWrite,
  followCalendar,
  unfollowCalendar,
  attachEventToCalendar,
  detachEventFromCalendar,
  updateCalendar,
  archiveCalendar,
  listFollowedCalendars,
  listCalendarsByOwner,
  type CreateCalendarInput,
  type FollowCalendarInput,
} from "./calendars";

/**
 * Required fields on the live `events.calendars` validator (moderate/error —
 * a missing one throws). `buildCalendarDoc` must emit every one.
 */
const CALENDAR_REQUIRED_FIELDS = [
  "_id",
  "_schemaVersion",
  "slug",
  "name",
  "schemaOrgType",
  "ownerPersonId",
  "ownerEntityId",
  "visibility",
  "isActive",
  "followerCount",
  "eventCount",
  "iCalUid",
  "surfaceContext",
  "createdAt",
  "updatedAt",
] as const;

/** Required fields on the live `events.calendarFollows` validator. */
const FOLLOW_REQUIRED_FIELDS = [
  "_id",
  "_schemaVersion",
  "calendarId",
  "followerPersonId",
  "followerEntityId",
  "isActive",
  "followedAt",
  "createdAt",
  "updatedAt",
] as const;

const createInput: CreateCalendarInput = {
  name: "Harare Live Music",
  ownerPersonId: "person-1",
  ownerEntityId: "entity-1",
  description: "  Gigs and jam sessions around Harare.  ",
  theme: "malachite",
};

const followInput: FollowCalendarInput = {
  calendarId: "cal-1",
  followerPersonId: "person-2",
  followerEntityId: "entity-2",
};

beforeEach(() => {
  vi.clearAllMocks();
  calendars.updateOne.mockResolvedValue({ acknowledged: true, modifiedCount: 1 });
  calendars.insertOne.mockResolvedValue({ acknowledged: true });
});

describe("buildCalendarDoc", () => {
  it("emits every validator-required field", () => {
    const doc = buildCalendarDoc(createInput);
    for (const field of CALENDAR_REQUIRED_FIELDS) {
      expect(doc, `missing required field ${field}`).toHaveProperty(field);
    }
  });

  it("follows the v3.1 conventions: string UUID _id, _schemaVersion, BSON dates", () => {
    const doc = buildCalendarDoc(createInput);
    expect(doc._id).toMatch(/^[0-9a-f-]{36}$/);
    expect(doc._schemaVersion).toBe("v3.1");
    expect(doc.createdAt).toBeInstanceOf(Date);
    expect(doc.updatedAt).toBeInstanceOf(Date);
    expect(doc.iCalUid).toBe(`${doc._id}@nhimbe.com`);
    expect(doc.surfaceContext).toBe("nhimbe");
    expect(doc.schemaOrgType).toBe("EventSeries");
  });

  it("starts life public, active, with zeroed counts and a derived slug", () => {
    const doc = buildCalendarDoc(createInput);
    expect(doc.visibility).toBe("public");
    expect(doc.isActive).toBe(true);
    expect(doc.followerCount).toBe(0);
    expect(doc.eventCount).toBe(0);
    expect(doc.slug).toMatch(/^harare-live-music-/);
    expect(doc.url).toBe(`https://events.mukoko.com/calendars/${doc.slug}`);
    expect(doc.description).toBe("Gigs and jam sessions around Harare.");
    expect(doc.theme).toBe("malachite");
    expect(doc.circleId).toBeNull();
  });

  it("carries an explicit circleId when the calendar belongs to a circle", () => {
    const doc = buildCalendarDoc({ ...createInput, circleId: "circle-9", visibility: "unlisted" });
    expect(doc.circleId).toBe("circle-9");
    expect(doc.visibility).toBe("unlisted");
  });
});

describe("createCalendar", () => {
  it("inserts the built document once", async () => {
    const doc = await createCalendar(createInput);
    expect(calendars.insertOne).toHaveBeenCalledTimes(1);
    expect(calendars.insertOne).toHaveBeenCalledWith(doc);
  });
});

describe("canViewCalendar (private-404 gate)", () => {
  it("lets anyone view public and unlisted calendars", () => {
    expect(canViewCalendar({ visibility: "public", ownerPersonId: "p1" }, null)).toBe(true);
    expect(canViewCalendar({ visibility: "unlisted", ownerPersonId: "p1" }, null)).toBe(true);
    expect(canViewCalendar({ visibility: "unlisted", ownerPersonId: "p1" }, "p2")).toBe(true);
  });

  it("hides private calendars from everyone but the owner", () => {
    expect(canViewCalendar({ visibility: "private", ownerPersonId: "p1" }, null)).toBe(false);
    expect(canViewCalendar({ visibility: "private", ownerPersonId: "p1" }, "p2")).toBe(false);
    expect(canViewCalendar({ visibility: "private", ownerPersonId: "p1" }, "p1")).toBe(true);
  });
});

describe("buildFollowWrite", () => {
  it("emits every validator-required field across filter/$set/$setOnInsert", () => {
    const { filter, update } = buildFollowWrite(followInput);
    const emitted = new Set([
      ...Object.keys(filter),
      ...Object.keys(update.$set as Record<string, unknown>),
      ...Object.keys(update.$setOnInsert as Record<string, unknown>),
    ]);
    for (const field of FOLLOW_REQUIRED_FIELDS) {
      expect(emitted, `missing required field ${field}`).toContain(field);
    }
  });

  it("is keyed by (calendarId, followerPersonId) — the idempotency identity", () => {
    const { filter } = buildFollowWrite(followInput);
    expect(filter).toEqual({ calendarId: "cal-1", followerPersonId: "person-2" });
  });

  it("re-activates in place: isActive true, followedAt refreshed, unfollowedAt cleared", () => {
    const { update } = buildFollowWrite(followInput);
    const set = update.$set as Record<string, unknown>;
    expect(set.isActive).toBe(true);
    expect(set.followedAt).toBeInstanceOf(Date);
    expect(set.unfollowedAt).toBeNull();
    expect(set.updatedAt).toBeInstanceOf(Date);
    const onInsert = update.$setOnInsert as Record<string, unknown>;
    expect(onInsert._id).toMatch(/^[0-9a-f-]{36}$/);
    expect(onInsert._schemaVersion).toBe("v3.1");
    expect(onInsert.createdAt).toBeInstanceOf(Date);
  });
});

describe("followCalendar (idempotent, never double-counts)", () => {
  it("first follow: upserts the row and increments followerCount once", async () => {
    follows.findOneAndUpdate.mockResolvedValueOnce(null); // no pre-image → new row
    const result = await followCalendar(followInput);

    expect(result.becameFollower).toBe(true);
    expect(follows.findOneAndUpdate).toHaveBeenCalledTimes(1);
    const [, , options] = follows.findOneAndUpdate.mock.calls[0];
    expect(options).toMatchObject({ upsert: true, returnDocument: "before" });
    expect(calendars.updateOne).toHaveBeenCalledTimes(1);
    const [calFilter, calUpdate] = calendars.updateOne.mock.calls[0];
    expect(calFilter).toEqual({ _id: "cal-1" });
    expect(calUpdate.$inc).toEqual({ followerCount: 1 });
  });

  it("repeat follow: updates the same row and does NOT increment again", async () => {
    follows.findOneAndUpdate.mockResolvedValueOnce({ _id: "f1", isActive: true });
    const result = await followCalendar(followInput);

    expect(result.becameFollower).toBe(false);
    expect(calendars.updateOne).not.toHaveBeenCalled();
  });

  it("re-follow after unfollow: flips the existing row and increments once", async () => {
    follows.findOneAndUpdate.mockResolvedValueOnce({ _id: "f1", isActive: false });
    const result = await followCalendar(followInput);

    expect(result.becameFollower).toBe(true);
    expect(calendars.updateOne).toHaveBeenCalledTimes(1);
  });
});

describe("unfollowCalendar (idempotent)", () => {
  it("flips the active row and decrements followerCount once", async () => {
    follows.findOneAndUpdate.mockResolvedValueOnce({ _id: "f1", isActive: true });
    const result = await unfollowCalendar({ calendarId: "cal-1", followerPersonId: "person-2" });

    expect(result.stoppedFollowing).toBe(true);
    const [filter, update, options] = follows.findOneAndUpdate.mock.calls[0];
    expect(filter).toEqual({ calendarId: "cal-1", followerPersonId: "person-2", isActive: true });
    expect((update.$set as Record<string, unknown>).isActive).toBe(false);
    expect((update.$set as Record<string, unknown>).unfollowedAt).toBeInstanceOf(Date);
    // Never an upsert — unfollowing something never followed creates nothing.
    expect(options?.upsert).toBeUndefined();
    expect(calendars.updateOne).toHaveBeenCalledTimes(1);
    const [calFilter, calUpdate] = calendars.updateOne.mock.calls[0];
    expect(calFilter).toEqual({ _id: "cal-1", followerCount: { $gt: 0 } });
    expect(calUpdate.$inc).toEqual({ followerCount: -1 });
  });

  it("unfollow without an active follow changes nothing", async () => {
    follows.findOneAndUpdate.mockResolvedValueOnce(null);
    const result = await unfollowCalendar({ calendarId: "cal-1", followerPersonId: "person-2" });

    expect(result.stoppedFollowing).toBe(false);
    expect(calendars.updateOne).not.toHaveBeenCalled();
  });
});

describe("updateCalendar", () => {
  it("only $sets the fields explicitly provided, plus updatedAt", async () => {
    calendars.findOneAndUpdate.mockResolvedValueOnce({ _id: "cal-1", name: "New Name" });
    await updateCalendar("cal-1", { name: "New Name", visibility: "unlisted" });

    const [filter, update, options] = calendars.findOneAndUpdate.mock.calls[0];
    expect(filter).toEqual({ _id: "cal-1" });
    expect(update.$set).toMatchObject({ name: "New Name", visibility: "unlisted" });
    expect(update.$set).not.toHaveProperty("description");
    expect(update.$set.updatedAt).toBeInstanceOf(Date);
    expect(options).toEqual({ returnDocument: "after" });
  });

  it("trims name/description and null-collapses a blank description", async () => {
    calendars.findOneAndUpdate.mockResolvedValueOnce({ _id: "cal-1" });
    await updateCalendar("cal-1", { name: "  Padded  ", description: "   " });

    const update = calendars.findOneAndUpdate.mock.calls[0][1];
    expect(update.$set.name).toBe("Padded");
    expect(update.$set.description).toBeNull();
  });

  it("returns null when the calendar does not exist", async () => {
    calendars.findOneAndUpdate.mockResolvedValueOnce(null);
    const result = await updateCalendar("missing", { name: "X" });
    expect(result).toBeNull();
  });
});

describe("archiveCalendar", () => {
  it("soft-deletes: isActive false, never a hard delete", async () => {
    await archiveCalendar("cal-1");
    const [filter, update] = calendars.updateOne.mock.calls[0];
    expect(filter).toEqual({ _id: "cal-1" });
    expect(update.$set.isActive).toBe(false);
    expect(update.$set.updatedAt).toBeInstanceOf(Date);
  });
});

describe("listFollowedCalendars", () => {
  it("returns the person's actively-followed calendars, most recent first", async () => {
    follows.find.mockReturnValueOnce(
      cursor([{ calendarId: "cal-1" }, { calendarId: "cal-2" }]),
    );
    calendars.find.mockReturnValueOnce(
      cursor([
        { _id: "cal-1", name: "First" },
        { _id: "cal-2", name: "Second" },
      ]),
    );

    const result = await listFollowedCalendars("person-1");

    expect(follows.find).toHaveBeenCalledWith({ followerPersonId: "person-1", isActive: true });
    expect(result.map((d) => d._id)).toEqual(["cal-1", "cal-2"]);
  });

  it("returns an empty array without querying calendars when there are no follows", async () => {
    follows.find.mockReturnValueOnce(cursor([]));
    const result = await listFollowedCalendars("person-1");
    expect(result).toEqual([]);
    expect(calendars.find).not.toHaveBeenCalled();
  });

  it("drops rows whose calendar was deleted/archived out from under the follow", async () => {
    follows.find.mockReturnValueOnce(cursor([{ calendarId: "cal-1" }, { calendarId: "cal-gone" }]));
    calendars.find.mockReturnValueOnce(cursor([{ _id: "cal-1", name: "First" }]));

    const result = await listFollowedCalendars("person-1");
    expect(result).toHaveLength(1);
    expect(result[0]._id).toBe("cal-1");
  });
});

describe("attachEventToCalendar", () => {
  it("sets calendarId on the event and increments the calendar's eventCount", async () => {
    events.findOneAndUpdate.mockResolvedValueOnce({ _id: "event-1", calendarId: null });
    await attachEventToCalendar("event-1", "cal-1");

    const [filter, update] = events.findOneAndUpdate.mock.calls[0];
    expect(filter).toEqual({ _id: "event-1", calendarId: { $ne: "cal-1" } });
    expect((update.$set as Record<string, unknown>).calendarId).toBe("cal-1");
    expect(calendars.updateOne).toHaveBeenCalledTimes(1);
    expect(calendars.updateOne.mock.calls[0][1].$inc).toEqual({ eventCount: 1 });
  });

  it("re-attaching to the same calendar is a no-op (no double-increment)", async () => {
    events.findOneAndUpdate.mockResolvedValueOnce(null); // filter excluded it
    await attachEventToCalendar("event-1", "cal-1");
    expect(calendars.updateOne).not.toHaveBeenCalled();
  });

  it("moving between calendars increments the new and decrements the old", async () => {
    events.findOneAndUpdate.mockResolvedValueOnce({ _id: "event-1", calendarId: "cal-old" });
    await attachEventToCalendar("event-1", "cal-new");

    expect(calendars.updateOne).toHaveBeenCalledTimes(2);
    const [incFilter, incUpdate] = calendars.updateOne.mock.calls[0];
    const [decFilter, decUpdate] = calendars.updateOne.mock.calls[1];
    expect(incFilter).toEqual({ _id: "cal-new" });
    expect(incUpdate.$inc).toEqual({ eventCount: 1 });
    expect(decFilter).toEqual({ _id: "cal-old", eventCount: { $gt: 0 } });
    expect(decUpdate.$inc).toEqual({ eventCount: -1 });
  });
});

describe("detachEventFromCalendar", () => {
  it("clears calendarId and decrements the old calendar's eventCount", async () => {
    events.findOneAndUpdate.mockResolvedValueOnce({ _id: "event-1", calendarId: "cal-1" });

    await detachEventFromCalendar("event-1");

    const [filter, update] = events.findOneAndUpdate.mock.calls[0];
    expect(filter).toEqual({ _id: "event-1", calendarId: { $ne: null } });
    expect((update.$set as Record<string, unknown>).calendarId).toBeNull();
    expect(calendars.updateOne).toHaveBeenCalledTimes(1);
    const [decFilter, decUpdate] = calendars.updateOne.mock.calls[0];
    expect(decFilter).toEqual({ _id: "cal-1", eventCount: { $gt: 0 } });
    expect(decUpdate.$inc).toEqual({ eventCount: -1 });
  });

  it("is a no-op when the event isn't on a calendar", async () => {
    events.findOneAndUpdate.mockResolvedValueOnce(null);
    await detachEventFromCalendar("event-1");
    expect(calendars.updateOne).not.toHaveBeenCalled();
  });
});

describe("listCalendarsByOwner", () => {
  it("filters by personal ownership alone when no host entity ids are given", async () => {
    calendars.find.mockReturnValue(cursor([]));
    await listCalendarsByOwner("person-1");
    expect(calendars.find).toHaveBeenCalledWith({ ownerPersonId: "person-1", isActive: true });
  });

  it("also matches calendars owned by any given host entity", async () => {
    calendars.find.mockReturnValue(cursor([]));
    await listCalendarsByOwner("person-1", ["entity-a", "entity-b"]);
    expect(calendars.find).toHaveBeenCalledWith({
      isActive: true,
      $or: [{ ownerPersonId: "person-1" }, { ownerEntityId: { $in: ["entity-a", "entity-b"] } }],
    });
  });
});
