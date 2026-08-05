import "server-only";

/**
 * Calendars (NYU-25) — followable, curated event streams, the Luma
 * "calendar" pattern. A calendar is a stream of events someone curates and
 * others follow; it is NOT a Circle (Circles are communities), though a
 * calendar MAY belong to a circle via `circleId`.
 *
 * Storage: `events.calendars` + `events.calendarFollows` (both live on the
 * cluster with moderate/error validators — every insert here must carry the
 * full required field set), and `events.events.calendarId` marking which
 * calendar an event streams into.
 *
 * Follow/unfollow are IDEMPOTENT by construction: one follow row per
 * (calendarId, followerPersonId) — unique-indexed on the cluster — whose
 * `isActive` flag is flipped in place. The calendar's denormalized
 * `followerCount` is only incremented/decremented on an actual state
 * transition, never on a repeat call, so it can never double-count.
 *
 * Pure `build*` helpers are exported so tests can assert the emitted
 * documents satisfy the validators (same doctrine as `planner.ts`).
 */

import type { Filter, UpdateFilter } from "mongodb";
import {
  calendarFollowsCollection,
  calendarsCollection,
  eventsCollection,
} from "./databases";
import { WRITE_SCHEMA_VERSION, newId, slugify } from "./ids";
import { listEvents } from "./events";
import type { CalendarDoc, CalendarFollowDoc, CalendarVisibility, EventDoc } from "./types";
import type { Event } from "@/lib/api";
import { SITE_URL } from "@/lib/site-url";

// ── create ───────────────────────────────────────────────────────────

export interface CreateCalendarInput {
  name: string;
  ownerPersonId: string;
  /** Entity the owner curates through (Rule 10: entity-centric). */
  ownerEntityId: string;
  description?: string | null;
  visibility?: CalendarVisibility;
  /** Optional owning circle — a calendar MAY belong to a community. */
  circleId?: string | null;
  /** Washed palette id from `src/lib/themes.ts`. */
  theme?: string | null;
}

/**
 * Build a full `events.calendars` document. Pure and exported so tests can
 * assert every validator-required field is present with the right BSON types.
 */
export function buildCalendarDoc(input: CreateCalendarInput): CalendarDoc {
  const id = newId();
  const now = new Date();
  const slug = slugify(input.name);
  return {
    _id: id,
    _schemaVersion: WRITE_SCHEMA_VERSION,
    slug,
    name: input.name.trim(),
    schemaOrgType: "EventSeries",
    ownerPersonId: input.ownerPersonId,
    ownerEntityId: input.ownerEntityId,
    visibility: input.visibility ?? "public",
    isActive: true,
    followerCount: 0,
    eventCount: 0,
    iCalUid: `${id}@nhimbe.com`,
    surfaceContext: "nhimbe",
    description: input.description?.trim() || null,
    circleId: input.circleId ?? null,
    theme: input.theme ?? null,
    coverImage: null,
    image: [],
    inLanguage: "en",
    tags: [],
    translations: {},
    url: `${SITE_URL}/calendars/${slug}`,
    createdAt: now,
    updatedAt: now,
  };
}

/** Insert a new calendar. Returns the persisted document. */
export async function createCalendar(input: CreateCalendarInput): Promise<CalendarDoc> {
  const doc = buildCalendarDoc(input);
  const col = await calendarsCollection();
  await col.insertOne(doc);
  return doc;
}

export interface UpdateCalendarInput {
  name?: string;
  description?: string | null;
  visibility?: CalendarVisibility;
  theme?: string | null;
  circleId?: string | null;
}

/** Update the owner-editable fields of a calendar. Slug/id/counts never change. */
export async function updateCalendar(
  calendarId: string,
  input: UpdateCalendarInput,
): Promise<CalendarDoc | null> {
  const col = await calendarsCollection();
  const $set: Record<string, unknown> = { updatedAt: new Date() };
  if (input.name !== undefined) $set.name = input.name.trim();
  if (input.description !== undefined) $set.description = input.description?.trim() || null;
  if (input.visibility !== undefined) $set.visibility = input.visibility;
  if (input.theme !== undefined) $set.theme = input.theme;
  if (input.circleId !== undefined) $set.circleId = input.circleId;
  return col.findOneAndUpdate({ _id: calendarId }, { $set }, { returnDocument: "after" });
}

/** Soft-archive a calendar (never a hard delete — followers/events keep history). */
export async function archiveCalendar(calendarId: string): Promise<void> {
  const col = await calendarsCollection();
  await col.updateOne({ _id: calendarId }, { $set: { isActive: false, updatedAt: new Date() } });
}

// ── reads ────────────────────────────────────────────────────────────

/** Fetch an active calendar by its unique slug (any visibility — gate at the route). */
export async function getCalendarBySlug(slug: string): Promise<CalendarDoc | null> {
  const col = await calendarsCollection();
  return col.findOne({ slug, isActive: true });
}

/** Fetch an active calendar by id. */
export async function getCalendarById(id: string): Promise<CalendarDoc | null> {
  const col = await calendarsCollection();
  return col.findOne({ _id: id, isActive: true });
}

/**
 * Visibility gate: public and unlisted calendars render for everyone;
 * private calendars only for their owner. Pure — testable without a cluster.
 */
export function canViewCalendar(
  calendar: Pick<CalendarDoc, "visibility" | "ownerPersonId">,
  viewerPersonId: string | null,
): boolean {
  if (calendar.visibility !== "private") return true;
  return viewerPersonId !== null && calendar.ownerPersonId === viewerPersonId;
}

/** The small shape browse surfaces (/discover, sitemap) render for a calendar. */
export interface FeaturedCalendar {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  followerCount: number;
  eventCount: number;
  /** Washed palette id — drives the cover thumb gradient. */
  theme: string | null;
}

function toFeatured(d: CalendarDoc): FeaturedCalendar {
  return {
    id: d._id,
    slug: d.slug,
    name: d.name,
    description: d.description ?? null,
    followerCount: d.followerCount ?? 0,
    eventCount: d.eventCount ?? 0,
    theme: d.theme ?? null,
  };
}

/**
 * The most-followed public calendars. The filter + sort ride the cluster's
 * `discover_featured` index (visibility + isActive + followerCount desc).
 * Unlisted and private calendars never appear here.
 */
export async function listFeaturedCalendars(limit = 6): Promise<FeaturedCalendar[]> {
  const col = await calendarsCollection();
  const docs = await col
    .find({ visibility: "public", isActive: true })
    .sort({ followerCount: -1 })
    .limit(limit)
    .toArray();
  return docs.map(toFeatured);
}

/**
 * All of a person's active calendars (any visibility — it's their own list):
 * ones they personally own, plus — when `hostEntityIds` is passed — ones
 * owned by any entity they host through (Rule 10: entity-centric). Omitting
 * `hostEntityIds` keeps the old personal-only behaviour.
 */
export async function listCalendarsByOwner(
  ownerPersonId: string,
  hostEntityIds: string[] = [],
): Promise<CalendarDoc[]> {
  const col = await calendarsCollection();
  const filter =
    hostEntityIds.length > 0
      ? { isActive: true, $or: [{ ownerPersonId }, { ownerEntityId: { $in: hostEntityIds } }] }
      : { ownerPersonId, isActive: true };
  return col.find(filter).sort({ createdAt: -1 }).toArray();
}

/** A circle's discoverable calendars (private ones stay with their owner). */
export async function listCalendarsByCircle(circleId: string): Promise<CalendarDoc[]> {
  const col = await calendarsCollection();
  return col
    .find({ circleId, isActive: true, visibility: { $in: ["public", "unlisted"] } })
    .sort({ followerCount: -1 })
    .toArray();
}

/** Public calendars for the sitemap (slug + freshness only). */
export async function listPublicCalendars(
  limit = 200,
): Promise<{ slug: string; updatedAt: Date }[]> {
  const col = await calendarsCollection();
  return col
    .find({ visibility: "public", isActive: true })
    .sort({ followerCount: -1 })
    .limit(limit)
    .project<{ slug: string; updatedAt: Date }>({ slug: 1, updatedAt: 1, _id: 0 })
    .toArray();
}

// ── the calendar's events ────────────────────────────────────────────

/**
 * The calendar's upcoming published events, mapped to the API shape with
 * hosts/venues resolved (reuses the batched fan-out in `events.ts`).
 */
export async function listCalendarEvents(calendarId: string, limit = 100): Promise<Event[]> {
  const { events } = await listEvents({ calendarId, limit });
  return events;
}

/**
 * Raw upcoming published event docs for the ICS feed — the feed needs storage
 * fields (`iCalUid`, BSON dates, embedded location) the API mapper folds away.
 */
export async function listCalendarEventDocs(calendarId: string, limit = 250): Promise<EventDoc[]> {
  const col = await eventsCollection();
  return col
    .find({
      calendarId,
      status: { $in: ["published", "live"] },
      startDate: { $gte: new Date() },
    })
    .sort({ startDate: 1 })
    .limit(limit)
    .toArray();
}

// ── attach ───────────────────────────────────────────────────────────

/**
 * Point an event at a calendar and keep `eventCount` honest. Idempotent:
 * re-attaching to the same calendar is a no-op (no double-increment); moving
 * between calendars increments the new one and decrements the old.
 */
export async function attachEventToCalendar(eventId: string, calendarId: string): Promise<void> {
  const events = await eventsCollection();
  const now = new Date();
  // Only matches when the event exists AND isn't already on this calendar —
  // the returned pre-image tells us which transition (if any) happened.
  const previous = await events.findOneAndUpdate(
    { _id: eventId, calendarId: { $ne: calendarId } },
    { $set: { calendarId, updatedAt: now } },
    { returnDocument: "before" },
  );
  if (!previous) return; // already attached, or no such event

  const calendars = await calendarsCollection();
  await calendars.updateOne(
    { _id: calendarId },
    { $inc: { eventCount: 1 }, $set: { updatedAt: now } },
  );
  if (previous.calendarId) {
    await calendars.updateOne(
      { _id: previous.calendarId, eventCount: { $gt: 0 } },
      { $inc: { eventCount: -1 }, $set: { updatedAt: now } },
    );
  }
}

// ── follow / unfollow (idempotent) ───────────────────────────────────

export interface FollowCalendarInput {
  calendarId: string;
  followerPersonId: string;
  /** Entity the follower acts through (Rule 10: entity-centric). */
  followerEntityId: string;
}

/**
 * Build the idempotent `(filter, update)` pair for the follow upsert. Pure and
 * exported so tests can assert the emitted document carries every field the
 * `events.calendarFollows` validator requires: the filter contributes
 * `calendarId` + `followerPersonId` on insert, `$setOnInsert` the immutable
 * fields, `$set` the mutable ones (including `followedAt`, refreshed each time
 * the follow becomes active again).
 */
export function buildFollowWrite(input: FollowCalendarInput): {
  filter: Filter<CalendarFollowDoc>;
  update: UpdateFilter<CalendarFollowDoc>;
} {
  const now = new Date();
  const filter: Filter<CalendarFollowDoc> = {
    calendarId: input.calendarId,
    followerPersonId: input.followerPersonId,
  };
  const update: UpdateFilter<CalendarFollowDoc> = {
    $set: {
      followerEntityId: input.followerEntityId,
      isActive: true,
      followedAt: now,
      unfollowedAt: null,
      updatedAt: now,
    },
    $setOnInsert: {
      _id: newId(),
      _schemaVersion: WRITE_SCHEMA_VERSION,
      createdAt: now,
    },
  };
  return { filter, update };
}

/**
 * Follow a calendar. Upserts the single (calendarId, followerPersonId) row and
 * bumps `followerCount` ONLY when the follow actually transitioned to active —
 * a repeat follow updates the row in place and never double-counts.
 */
export async function followCalendar(
  input: FollowCalendarInput,
): Promise<{ becameFollower: boolean }> {
  const follows = await calendarFollowsCollection();
  const { filter, update } = buildFollowWrite(input);
  const before = await follows.findOneAndUpdate(filter, update, {
    upsert: true,
    returnDocument: "before",
  });
  const becameFollower = !before || before.isActive !== true;
  if (becameFollower) {
    const calendars = await calendarsCollection();
    await calendars.updateOne(
      { _id: input.calendarId },
      { $inc: { followerCount: 1 }, $set: { updatedAt: new Date() } },
    );
  }
  return { becameFollower };
}

/**
 * Unfollow a calendar. Flips the existing active row to inactive (never
 * creates one) and decrements `followerCount` only when a flip happened —
 * unfollowing twice, or unfollowing without following, changes nothing.
 */
export async function unfollowCalendar(params: {
  calendarId: string;
  followerPersonId: string;
}): Promise<{ stoppedFollowing: boolean }> {
  const follows = await calendarFollowsCollection();
  const now = new Date();
  const before = await follows.findOneAndUpdate(
    { calendarId: params.calendarId, followerPersonId: params.followerPersonId, isActive: true },
    { $set: { isActive: false, unfollowedAt: now, updatedAt: now } },
    { returnDocument: "before" },
  );
  if (!before) return { stoppedFollowing: false };

  const calendars = await calendarsCollection();
  await calendars.updateOne(
    // `followerCount: { $gt: 0 }` keeps the non-negative int the validator expects
    // even if the denormalized count ever drifted.
    { _id: params.calendarId, followerCount: { $gt: 0 } },
    { $inc: { followerCount: -1 }, $set: { updatedAt: now } },
  );
  return { stoppedFollowing: true };
}

/** Calendars a person actively follows, most recently followed first. */
export async function listFollowedCalendars(followerPersonId: string): Promise<CalendarDoc[]> {
  const follows = await calendarFollowsCollection();
  const rows = await follows
    .find({ followerPersonId, isActive: true })
    .sort({ followedAt: -1 })
    .toArray();
  if (rows.length === 0) return [];

  const calendars = await calendarsCollection();
  const docs = await calendars
    .find({ _id: { $in: rows.map((r) => r.calendarId) }, isActive: true })
    .toArray();
  const byId = new Map(docs.map((d) => [d._id, d]));
  return rows.map((r) => byId.get(r.calendarId)).filter((d): d is CalendarDoc => d !== undefined);
}

/** Is this person an active follower of the calendar? */
export async function isFollowingCalendar(
  calendarId: string,
  followerPersonId: string,
): Promise<boolean> {
  const follows = await calendarFollowsCollection();
  const row = await follows.findOne(
    { calendarId, followerPersonId, isActive: true },
    { projection: { _id: 1 } },
  );
  return row !== null;
}
