/**
 * Calendars against a REAL MongoDB.
 *
 * The unit suite for this module drives hand-rolled cursor stubs — `sort()`
 * returns itself, `toArray()` resolves a fixture. Those stubs accept any query
 * at all, so they prove the code *calls* Mongo, never that Mongo would accept
 * what it sent. An invalid operator, a malformed `$or`, a `findOneAndUpdate`
 * whose options changed shape between driver majors — all pass a stub and fail
 * in production.
 *
 * These run the same functions against a real server, so the query itself is
 * under test.
 */

import { beforeEach, describe, expect, it } from "vitest";

import {
  archiveCalendar,
  buildCalendarDoc,
  canViewCalendar,
  createCalendar,
  followCalendar,
  getCalendarById,
  getCalendarBySlug,
  listCalendarsByOwner,
  listPublicCalendars,
  unfollowCalendar,
  updateCalendar,
} from "./calendars";
import { calendarFollowsCollection, calendarsCollection } from "./databases";

const OWNER = "person-owner-1";
const ENTITY = "entity-1";

async function reset() {
  await (await calendarsCollection()).deleteMany({});
  await (await calendarFollowsCollection()).deleteMany({});
}

beforeEach(reset);

describe("createCalendar", () => {
  it("writes a document real MongoDB accepts and reads back", async () => {
    const created = await createCalendar({
      name: "Harare Tech Nights",
      ownerPersonId: OWNER,
      ownerEntityId: ENTITY,
    });

    const found = await getCalendarById(created._id);
    expect(found).not.toBeNull();
    expect(found!.name).toBe("Harare Tech Nights");
    // slugify() appends a random 6-char suffix so two calendars can share a
    // name without colliding — the slug is derived from the name, not equal to it.
    expect(found!.slug).toMatch(/^harare-tech-nights-[a-f0-9]{6}$/);
  });

  it("stores real BSON dates, not ISO strings", async () => {
    // The v3.1 convention. A stub can't tell the difference; a range query on
    // a string-typed date silently returns nothing.
    const created = await createCalendar({
      name: "Dates Matter",
      ownerPersonId: OWNER,
      ownerEntityId: ENTITY,
    });

    const raw = await (await calendarsCollection()).findOne({ _id: created._id });
    expect(raw!.createdAt).toBeInstanceOf(Date);
    expect(raw!.updatedAt).toBeInstanceOf(Date);
  });

  it("uses a string UUID _id, not an ObjectId", async () => {
    const created = await createCalendar({
      name: "String Ids",
      ownerPersonId: OWNER,
      ownerEntityId: ENTITY,
    });
    const raw = await (await calendarsCollection()).findOne({ _id: created._id });
    expect(typeof raw!._id).toBe("string");
  });
});

describe("getCalendarBySlug", () => {
  it("finds an active calendar", async () => {
    const created = await createCalendar({
      name: "Findable",
      ownerPersonId: OWNER,
      ownerEntityId: ENTITY,
    });
    expect(await getCalendarBySlug(created.slug)).not.toBeNull();
  });

  it("does not return an archived calendar", async () => {
    const created = await createCalendar({
      name: "Gone Away",
      ownerPersonId: OWNER,
      ownerEntityId: ENTITY,
    });
    await archiveCalendar(created._id);

    // Soft-archived, so the row still exists — the read must filter it out.
    expect(await getCalendarBySlug(created.slug)).toBeNull();
    expect(await (await calendarsCollection()).findOne({ _id: created._id })).not.toBeNull();
  });
});

describe("updateCalendar", () => {
  it("returns the updated document, not the pre-update one", async () => {
    // `returnDocument: "after"` — the option most likely to regress silently,
    // since a stub returns whatever it was told to.
    const created = await createCalendar({
      name: "Before",
      ownerPersonId: OWNER,
      ownerEntityId: ENTITY,
    });

    const updated = await updateCalendar(created._id, { name: "After" });
    expect(updated!.name).toBe("After");
  });

  it("leaves the slug and id untouched when the name changes", async () => {
    const created = await createCalendar({
      name: "Original Name",
      ownerPersonId: OWNER,
      ownerEntityId: ENTITY,
    });
    const updated = await updateCalendar(created._id, { name: "Renamed Entirely" });

    // Slugs are permalinks — renaming must not break existing links.
    expect(updated!.slug).toBe(created.slug);
    expect(updated!._id).toBe(created._id);
  });

  it("distinguishes an explicit null from an omitted field", async () => {
    const created = await createCalendar({
      name: "Nullable",
      ownerPersonId: OWNER,
      ownerEntityId: ENTITY,
      description: "something",
    });

    const untouched = await updateCalendar(created._id, { name: "Nullable" });
    expect(untouched!.description).toBe("something");

    const cleared = await updateCalendar(created._id, { description: null });
    expect(cleared!.description).toBeNull();
  });

  it("returns null for a calendar that does not exist", async () => {
    expect(await updateCalendar("nope", { name: "x" })).toBeNull();
  });
});

describe("listPublicCalendars", () => {
  it("returns public calendars and excludes unlisted and private ones", async () => {
    // Unlisted calendars render at their URL but must stay out of discovery
    // and the sitemap — this feed is what sitemap.ts consumes.
    const pub = await createCalendar({
      name: "Public One",
      ownerPersonId: OWNER,
      ownerEntityId: ENTITY,
      visibility: "public",
    });
    const unlisted = await createCalendar({
      name: "Unlisted One",
      ownerPersonId: OWNER,
      ownerEntityId: ENTITY,
      visibility: "unlisted",
    });
    const priv = await createCalendar({
      name: "Private One",
      ownerPersonId: OWNER,
      ownerEntityId: ENTITY,
      visibility: "private",
    });

    const rows = await listPublicCalendars(50);
    const slugs = rows.map((c) => c.slug);

    expect(slugs).toContain(pub.slug);
    expect(slugs).not.toContain(unlisted.slug);
    expect(slugs).not.toContain(priv.slug);

    // The projection is deliberately narrow — sitemap.ts needs only these two,
    // and widening it would quietly ship every calendar's metadata.
    expect(Object.keys(rows[0]!).sort()).toEqual(["slug", "updatedAt"]);
    expect(rows[0]!.updatedAt).toBeInstanceOf(Date);
  });

  it("honours the limit", async () => {
    for (let i = 0; i < 5; i++) {
      await createCalendar({
        name: `Calendar ${i}`,
        ownerPersonId: OWNER,
        ownerEntityId: ENTITY,
        visibility: "public",
      });
    }
    expect(await listPublicCalendars(2)).toHaveLength(2);
  });
});

describe("listCalendarsByOwner", () => {
  it("returns only that owner's calendars", async () => {
    await createCalendar({ name: "Mine", ownerPersonId: OWNER, ownerEntityId: ENTITY });
    await createCalendar({
      name: "Theirs",
      ownerPersonId: "person-someone-else",
      ownerEntityId: ENTITY,
    });

    const names = (await listCalendarsByOwner(OWNER)).map((c) => c.name);
    expect(names).toEqual(["Mine"]);
  });
});

describe("follows", () => {
  it("is idempotent — following twice never double-counts", async () => {
    // The documented contract: `isActive` flips in place, one row per
    // calendar+person. A stub cannot verify the upsert key actually dedupes.
    const cal = await createCalendar({
      name: "Followable",
      ownerPersonId: OWNER,
      ownerEntityId: ENTITY,
    });

    await followCalendar({ calendarId: cal._id, followerPersonId: "person-follower", followerEntityId: ENTITY });
    await followCalendar({ calendarId: cal._id, followerPersonId: "person-follower", followerEntityId: ENTITY });

    const rows = await (await calendarFollowsCollection())
      .find({ calendarId: cal._id, followerPersonId: "person-follower" })
      .toArray();

    expect(rows).toHaveLength(1);
    expect(rows[0]!.isActive).toBe(true);
  });

  it("re-following after unfollowing reuses the same row", async () => {
    const cal = await createCalendar({
      name: "Toggle",
      ownerPersonId: OWNER,
      ownerEntityId: ENTITY,
    });

    await followCalendar({ calendarId: cal._id, followerPersonId: "person-follower", followerEntityId: ENTITY });
    await unfollowCalendar({ calendarId: cal._id, followerPersonId: "person-follower" });
    await followCalendar({ calendarId: cal._id, followerPersonId: "person-follower", followerEntityId: ENTITY });

    const rows = await (await calendarFollowsCollection())
      .find({ calendarId: cal._id, followerPersonId: "person-follower" })
      .toArray();

    expect(rows).toHaveLength(1);
    expect(rows[0]!.isActive).toBe(true);
  });

  it("keeps different people's follows separate", async () => {
    const cal = await createCalendar({
      name: "Shared",
      ownerPersonId: OWNER,
      ownerEntityId: ENTITY,
    });

    await followCalendar({ calendarId: cal._id, followerPersonId: "person-a", followerEntityId: ENTITY });
    await followCalendar({ calendarId: cal._id, followerPersonId: "person-b", followerEntityId: ENTITY });

    const rows = await (await calendarFollowsCollection())
      .find({ calendarId: cal._id, isActive: true })
      .toArray();

    expect(rows).toHaveLength(2);
  });
});

describe("pure helpers still agree with the stored shape", () => {
  it("buildCalendarDoc emits exactly what the collection accepts", async () => {
    const doc = buildCalendarDoc({
      name: "Round Trip",
      ownerPersonId: OWNER,
      ownerEntityId: ENTITY,
    });

    await (await calendarsCollection()).insertOne(doc);
    const stored = await getCalendarById(doc._id);

    expect(stored).toMatchObject({ _id: doc._id, name: "Round Trip", slug: doc.slug });
  });

  it("canViewCalendar gates private calendars to their owner", async () => {
    const priv = await createCalendar({
      name: "Secret",
      ownerPersonId: OWNER,
      ownerEntityId: ENTITY,
      visibility: "private",
    });
    const stored = (await getCalendarById(priv._id))!;

    expect(canViewCalendar(stored, OWNER)).toBe(true);
    expect(canViewCalendar(stored, "person-intruder")).toBe(false);
    expect(canViewCalendar(stored, null)).toBe(false);
  });
});
