/**
 * Server-side admin read paths (server runtime → MongoDB).
 *
 * These back the standalone admin app (admin/ — its own Vercel project): the
 * overview counts, the paged people/event tables, the entity/circle/calendar
 * tables, and the (not-yet-modelled) support queue. Everything runs
 * server-side — `import "server-only"` keeps the Mongo accessors out of any
 * client bundle. The role gate itself lives in the admin app's
 * `requireAdmin()` (admin/src/lib/require-admin.ts) and in the server actions
 * that wrap these reads (admin/src/app/actions/*).
 *
 * The return shapes live in `./admin-types` (client-safe, no server-only) so
 * the admin app's RSC shells can hand the data straight to their client table
 * components without a translation layer.
 */

import "server-only";
import type { Filter } from "mongodb";
import {
  calendarsCollection,
  circlesCollection,
  entitiesCollection,
  entityMembershipsCollection,
  eventsCollection,
  personsCollection,
  placesCollection,
  rsvpsCollection,
} from "./databases";
import { mapEventDocToApi, type EventRelations } from "./mappers";
import type {
  CalendarDoc,
  CircleDoc,
  EntityDoc,
  EntityMembershipDoc,
  EventDoc,
  PersonDoc,
  PlaceDoc,
} from "./types";
import type {
  AdminCalendar,
  AdminCircle,
  AdminEntity,
  AdminEntityMember,
  AdminEvent,
  AdminUser,
  DashboardStats,
  RecentEvent,
  RecentUser,
} from "./admin-types";

// Re-export the view-model types so existing `from "./admin"` type imports
// keep working server-side; client components import from "./admin-types".
export type {
  AdminCalendar,
  AdminCircle,
  AdminEntity,
  AdminEntityMember,
  AdminEvent,
  AdminUser,
  DashboardStats,
  RecentEvent,
  RecentUser,
};

/** A published, publicly-listable event is published or live. */
const PUBLISHED_STATUSES = ["published", "live"] as const;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function unique<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

/** Escape a user-supplied string so it's a literal inside a Mongo `$regex`. */
function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Short human-readable date for dashboard tiles (e.g. "Jul 5, 2026"). */
function formatShortDate(value: Date | string | null | undefined): string {
  const d = toDate(value);
  if (!d) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/**
 * Derive the admin table status from an event doc. `cancelled` is stored on
 * the lifecycle status; upcoming / ongoing / past are computed from the
 * start/end window since they're not persisted.
 */
function adminEventStatus(doc: EventDoc): AdminEvent["status"] {
  if (doc.status === "cancelled") return "cancelled";
  const now = Date.now();
  const start = toDate(doc.startDate)?.getTime() ?? null;
  const end = toDate(doc.endDate)?.getTime() ?? null;
  if (start !== null && now < start) return "upcoming";
  if (end !== null && now > end) return "past";
  if (start !== null && end !== null && now >= start && now <= end) return "ongoing";
  // Started with no known end — treat as past for the table.
  return "past";
}

// ── dashboard ───────────────────────────────────────────────────────

export interface AdminDashboardData {
  stats: DashboardStats;
  recentEvents: RecentEvent[];
  recentUsers: RecentUser[];
  /** Support tickets aren't modelled in v3.1 yet — always empty. */
  tickets: never[];
}

function toRecentEvent(doc: EventDoc): RecentEvent {
  const status = adminEventStatus(doc);
  return {
    id: doc._id,
    title: doc.name,
    date: formatShortDate(doc.startDate),
    attendeeCount: doc.totalAttendeeCount ?? 0,
    // RecentEvent has no "cancelled" state — fold it into "past" for the tile.
    status: status === "cancelled" ? "past" : status,
  };
}

function toRecentUser(doc: PersonDoc): RecentUser {
  return {
    id: doc._id,
    name: doc.name ?? doc.email ?? "Unknown",
    email: doc.email ?? "",
    createdAt: formatShortDate(doc.createdAt),
  };
}

/**
 * Dashboard counts + recent activity. Counts are cheap `countDocuments` calls;
 * growth/view metrics have no data source yet (the analytics pipeline lived on
 * the retired worker) so they're reported as 0.
 */
export async function getAdminStats(): Promise<AdminDashboardData> {
  const [persons, events, rsvps, entities, circles, calendars] = await Promise.all([
    personsCollection(),
    eventsCollection(),
    rsvpsCollection(),
    entitiesCollection(),
    circlesCollection(),
    calendarsCollection(),
  ]);

  const [
    totalUsers,
    totalEvents,
    activeEvents,
    totalRegistrations,
    totalEntities,
    totalCircles,
    totalCalendars,
  ] = await Promise.all([
    persons.countDocuments({}),
    events.countDocuments({}),
    events.countDocuments({ status: { $in: [...PUBLISHED_STATUSES] } }),
    rsvps.countDocuments({}),
    entities.countDocuments({}),
    circles.countDocuments({}),
    calendars.countDocuments({}),
  ]);

  const [recentEventDocs, recentUserDocs] = await Promise.all([
    events.find({}).sort({ createdAt: -1 }).limit(5).toArray(),
    persons.find({}).sort({ createdAt: -1 }).limit(5).toArray(),
  ]);

  return {
    stats: {
      totalUsers,
      totalEvents,
      totalRegistrations,
      activeEvents,
      totalEntities,
      totalCircles,
      totalCalendars,
      // No analytics source post-worker-retirement — report neutral deltas.
      userGrowth: 0,
      eventGrowth: 0,
      recentViews: 0,
      viewsGrowth: 0,
    },
    recentEvents: recentEventDocs.map(toRecentEvent),
    recentUsers: recentUserDocs.map(toRecentUser),
    // Support tickets aren't modelled in the Mukoko v3.1 schema yet.
    tickets: [],
  };
}

// ── users ───────────────────────────────────────────────────────────

export interface ListAdminUsersParams {
  limit?: number;
  offset?: number;
  /** Case-insensitive match against name or email. */
  search?: string;
  /** Optional exact role filter (identity.persons.role). */
  role?: string;
}

export interface AdminUsersResult {
  users: AdminUser[];
  total: number;
}

function userStatus(doc: PersonDoc): AdminUser["status"] {
  // Suspension in the Mukoko model is role-based (role="suspended"/"deleted",
  // set out-of-band / by the admin actions); isActive===false mirrors it.
  const role = doc.role as string | null | undefined;
  if (role === "suspended" || role === "deleted" || doc.isActive === false) {
    return "suspended";
  }
  return "active";
}

function toAdminUser(doc: PersonDoc): AdminUser {
  return {
    id: doc._id,
    email: doc.email ?? "",
    name: doc.name ?? doc.email ?? "Unknown",
    alternateName: doc.preferredUsername ?? doc.nickname ?? undefined,
    image: doc.picture ?? undefined,
    addressLocality: doc.addressLocality ?? undefined,
    addressCountry: doc.addressCountry ?? undefined,
    role: typeof doc.role === "string" && doc.role ? doc.role : "user",
    // Per-user hosted/attended counts would be an N+1 fan-out across events +
    // rsvps; the table doesn't sort on them, so leave them at 0 for now.
    eventsAttended: 0,
    eventsHosted: 0,
    dateCreated: (toDate(doc.createdAt) ?? new Date(0)).toISOString(),
    status: userStatus(doc),
  };
}

/** Page `identity.persons` for the admin users table. */
export async function listAdminUsers(
  params: ListAdminUsersParams = {},
): Promise<AdminUsersResult> {
  const limit = clamp(params.limit ?? 20, 1, 100);
  const offset = Math.max(params.offset ?? 0, 0);

  const filter: Filter<PersonDoc> = {};
  if (params.search) {
    const rx = escapeRegex(params.search);
    filter.$or = [
      { name: { $regex: rx, $options: "i" } },
      { email: { $regex: rx, $options: "i" } },
    ];
  }
  if (params.role) {
    filter.role = params.role as PersonDoc["role"];
  }

  const col = await personsCollection();
  const [docs, total] = await Promise.all([
    col.find(filter).sort({ createdAt: -1 }).skip(offset).limit(limit).toArray(),
    col.countDocuments(filter),
  ]);

  return { users: docs.map(toAdminUser), total };
}

// ── events ──────────────────────────────────────────────────────────

export interface ListAdminEventsParams {
  limit?: number;
  offset?: number;
  /** Case-insensitive match against name or description. */
  search?: string;
  /** One of upcoming | ongoing | past | cancelled. */
  status?: string;
}

export interface AdminEventsResult {
  events: AdminEvent[];
  total: number;
}

/** Narrow the events filter by the derived admin status. */
function applyStatusFilter(filter: Filter<EventDoc>, status?: string): void {
  if (!status) return;
  const now = new Date();
  switch (status) {
    case "cancelled":
      filter.status = "cancelled";
      break;
    case "upcoming":
      filter.status = { $ne: "cancelled" };
      filter.startDate = { $gt: now };
      break;
    case "ongoing":
      filter.status = { $ne: "cancelled" };
      filter.startDate = { $lte: now };
      filter.endDate = { $gte: now };
      break;
    case "past":
      filter.status = { $ne: "cancelled" };
      filter.endDate = { $lt: now };
      break;
    default:
      break;
  }
}

/**
 * Resolve host entity + venue for a batch of events (two `$in` queries, plus
 * one for the people behind the host entities), then produce the admin table
 * rows via the shared event mapper. Mirrors the batched fan-out in `events.ts`
 * but yields the admin shape (with a computed table status).
 */
async function docsToAdminEvents(docs: EventDoc[]): Promise<AdminEvent[]> {
  if (docs.length === 0) return [];

  const entityIds = unique(docs.map((d) => d.primaryHostEntityId).filter(Boolean));
  const placeIds = unique(docs.map((d) => d.placeId).filter((v): v is string => !!v));

  const [entities, places] = await Promise.all([
    entityIds.length
      ? (await entitiesCollection()).find({ _id: { $in: entityIds } }).toArray()
      : Promise.resolve([] as EntityDoc[]),
    placeIds.length
      ? (await placesCollection()).find({ _id: { $in: placeIds } }).toArray()
      : Promise.resolve([] as PlaceDoc[]),
  ]);

  const entityById = new Map(entities.map((e) => [e._id, e]));
  const placeById = new Map(places.map((p) => [p._id, p]));

  const founderIds = unique(
    entities.map((e) => e.founderPersonId).filter((v): v is string => !!v),
  );
  const persons = founderIds.length
    ? await (await personsCollection()).find({ _id: { $in: founderIds } }).toArray()
    : ([] as PersonDoc[]);
  const personById = new Map(persons.map((p) => [p._id, p]));

  return docs.map((doc) => {
    const hostEntity = entityById.get(doc.primaryHostEntityId) ?? null;
    const relations: EventRelations = {
      hostEntity,
      hostPerson: hostEntity?.founderPersonId
        ? (personById.get(hostEntity.founderPersonId) ?? null)
        : null,
      place: doc.placeId ? (placeById.get(doc.placeId) ?? null) : null,
    };
    const api = mapEventDocToApi(doc, relations);
    return {
      id: api.id,
      name: api.name,
      description: api.description,
      date: { full: api.date.full },
      startDate: api.startDate,
      location: {
        name: api.location.name,
        addressLocality: api.location.addressLocality,
      },
      category: api.category,
      attendeeCount: api.attendeeCount,
      maximumAttendeeCapacity: api.maximumAttendeeCapacity,
      organizer: { name: api.organizer.name },
      status: adminEventStatus(doc),
      lifecycleStatus: doc.status,
      featured: Boolean((doc.mukoko as { featured?: unknown } | null | undefined)?.featured),
      dateCreated: api.dateCreated ?? "",
    };
  });
}

/** Page `events.events` for the admin events table (all lifecycle states). */
export async function listAdminEvents(
  params: ListAdminEventsParams = {},
): Promise<AdminEventsResult> {
  const limit = clamp(params.limit ?? 20, 1, 100);
  const offset = Math.max(params.offset ?? 0, 0);

  const filter: Filter<EventDoc> = {};
  if (params.search) {
    const rx = escapeRegex(params.search);
    filter.$or = [
      { name: { $regex: rx, $options: "i" } },
      { description: { $regex: rx, $options: "i" } },
    ];
  }
  applyStatusFilter(filter, params.status);

  const col = await eventsCollection();
  const [docs, total] = await Promise.all([
    col.find(filter).sort({ startDate: -1 }).skip(offset).limit(limit).toArray(),
    col.countDocuments(filter),
  ]);

  return { events: await docsToAdminEvents(docs), total };
}

// ── entities ────────────────────────────────────────────────────────

export interface ListAdminEntitiesParams {
  limit?: number;
  offset?: number;
  /** Case-insensitive match against name or slug. */
  search?: string;
}

export interface AdminEntitiesResult {
  entities: AdminEntity[];
  total: number;
}

/**
 * Page `entity.entities` with active-membership counts (one grouped `$in`
 * aggregation — no per-row fan-out) and founder names resolved in a single
 * `$in` query.
 */
export async function listAdminEntities(
  params: ListAdminEntitiesParams = {},
): Promise<AdminEntitiesResult> {
  const limit = clamp(params.limit ?? 20, 1, 100);
  const offset = Math.max(params.offset ?? 0, 0);

  const filter: Filter<EntityDoc> = {};
  if (params.search) {
    const rx = escapeRegex(params.search);
    filter.$or = [
      { name: { $regex: rx, $options: "i" } },
      { slug: { $regex: rx, $options: "i" } },
    ];
  }

  const col = await entitiesCollection();
  const [docs, total] = await Promise.all([
    col.find(filter).sort({ createdAt: -1 }).skip(offset).limit(limit).toArray(),
    col.countDocuments(filter),
  ]);
  if (docs.length === 0) return { entities: [], total };

  const entityIds = docs.map((d) => d._id);
  const founderIds = unique(docs.map((d) => d.founderPersonId).filter((v): v is string => !!v));

  const [memberCounts, founders] = await Promise.all([
    (await entityMembershipsCollection())
      .aggregate<{ _id: string; count: number }>([
        { $match: { entityId: { $in: entityIds }, isActive: true } },
        { $group: { _id: "$entityId", count: { $sum: 1 } } },
      ])
      .toArray(),
    founderIds.length
      ? (await personsCollection()).find({ _id: { $in: founderIds } }).toArray()
      : Promise.resolve([] as PersonDoc[]),
  ]);

  const countByEntity = new Map(memberCounts.map((m) => [m._id, m.count]));
  const founderById = new Map(founders.map((p) => [p._id, p]));

  return {
    entities: docs.map((doc) => {
      const founder = doc.founderPersonId ? founderById.get(doc.founderPersonId) : undefined;
      return {
        id: doc._id,
        name: doc.name,
        slug: doc.slug,
        entityType: doc.entityType,
        founderName: founder?.name ?? founder?.email ?? "—",
        memberCount: countByEntity.get(doc._id) ?? 0,
        isActive: doc.isActive,
        dateCreated: (toDate(doc.createdAt) ?? new Date(0)).toISOString(),
      };
    }),
    total,
  };
}

/** Members of one entity (for the admin entity drill-down). */
export async function listAdminEntityMembers(entityId: string): Promise<AdminEntityMember[]> {
  const memberships: EntityMembershipDoc[] = await (await entityMembershipsCollection())
    .find({ entityId })
    .sort({ joinedAt: 1 })
    .limit(100)
    .toArray();
  if (memberships.length === 0) return [];

  const personIds = unique(memberships.map((m) => m.personId));
  const persons = await (await personsCollection()).find({ _id: { $in: personIds } }).toArray();
  const personById = new Map(persons.map((p) => [p._id, p]));

  return memberships.map((m) => {
    const person = personById.get(m.personId);
    return {
      personId: m.personId,
      name: person?.name ?? person?.email ?? "Unknown",
      email: person?.email ?? "",
      membershipRole: m.membershipRole,
      isActive: m.isActive,
      joinedAt: (toDate(m.joinedAt) ?? new Date(0)).toISOString(),
    };
  });
}

// ── circles ─────────────────────────────────────────────────────────

export interface ListAdminCirclesParams {
  limit?: number;
  offset?: number;
  /** Case-insensitive match against name or slug. */
  search?: string;
}

export interface AdminCirclesResult {
  circles: AdminCircle[];
  total: number;
}

/** Page `circles.circles` — visibility (circleType) + denormalized counts. */
export async function listAdminCircles(
  params: ListAdminCirclesParams = {},
): Promise<AdminCirclesResult> {
  const limit = clamp(params.limit ?? 20, 1, 100);
  const offset = Math.max(params.offset ?? 0, 0);

  const filter: Filter<CircleDoc> = {};
  if (params.search) {
    const rx = escapeRegex(params.search);
    filter.$or = [
      { name: { $regex: rx, $options: "i" } },
      { slug: { $regex: rx, $options: "i" } },
    ];
  }

  const col = await circlesCollection();
  const [docs, total] = await Promise.all([
    col.find(filter).sort({ createdAt: -1 }).skip(offset).limit(limit).toArray(),
    col.countDocuments(filter),
  ]);

  return {
    circles: docs.map((doc) => ({
      id: doc._id,
      name: doc.name,
      slug: doc.slug,
      circleType: doc.circleType,
      memberCount: doc.memberCount ?? 0,
      postCount: doc.postCount ?? 0,
      isActive: doc.isActive,
      dateCreated: (toDate(doc.createdAt) ?? new Date(0)).toISOString(),
    })),
    total,
  };
}

// ── calendars ───────────────────────────────────────────────────────

export interface ListAdminCalendarsParams {
  limit?: number;
  offset?: number;
  /** Case-insensitive match against name or slug. */
  search?: string;
}

export interface AdminCalendarsResult {
  calendars: AdminCalendar[];
  total: number;
}

/** Page `events.calendars` — visibility + denormalized follower/event counts. */
export async function listAdminCalendars(
  params: ListAdminCalendarsParams = {},
): Promise<AdminCalendarsResult> {
  const limit = clamp(params.limit ?? 20, 1, 100);
  const offset = Math.max(params.offset ?? 0, 0);

  const filter: Filter<CalendarDoc> = {};
  if (params.search) {
    const rx = escapeRegex(params.search);
    filter.$or = [
      { name: { $regex: rx, $options: "i" } },
      { slug: { $regex: rx, $options: "i" } },
    ];
  }

  const col = await calendarsCollection();
  const [docs, total] = await Promise.all([
    col.find(filter).sort({ followerCount: -1, createdAt: -1 }).skip(offset).limit(limit).toArray(),
    col.countDocuments(filter),
  ]);

  return {
    calendars: docs.map((doc) => ({
      id: doc._id,
      name: doc.name,
      slug: doc.slug,
      visibility: doc.visibility,
      followerCount: doc.followerCount ?? 0,
      eventCount: doc.eventCount ?? 0,
      isActive: doc.isActive,
      dateCreated: (toDate(doc.createdAt) ?? new Date(0)).toISOString(),
    })),
    total,
  };
}

// ── support ─────────────────────────────────────────────────────────

export interface ListSupportTicketsParams {
  limit?: number;
  offset?: number;
  search?: string;
  status?: string;
}

export interface SupportTicketsResult {
  items: never[];
  total: number;
}

/**
 * There is NO support-ticket collection in the Mukoko v3.1 schema. Rather than
 * fabricate one, this returns an empty page. Wire it up to a real collection
 * once support tickets are modelled on the cluster.
 */
export async function listSupportTickets(
  _params: ListSupportTicketsParams = {},
): Promise<SupportTicketsResult> {
  return { items: [], total: 0 };
}
