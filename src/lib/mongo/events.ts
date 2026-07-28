/**
 * Server-side event read paths — the cross-database fan-out.
 *
 * Assembling an `Event` for the UI means reading across separate databases:
 * the core doc (`events.events`) plus its host (`entity.entities`, and the
 * person behind it via `entity.entities.founderPersonId` → `identity.persons`)
 * and its venue (`places.places`). These functions do that I/O and hand the
 * resolved documents to the pure mappers.
 *
 * Batching: list endpoints collect all referenced entity/place ids across the
 * page and resolve them with one `$in` query each (two extra round-trips per
 * page, not per row) to avoid N+1 fan-out.
 *
 * Server-only: this module pulls the Mongo collection accessors, so it can
 * only run in RSC / Route Handlers / Server Actions.
 */

import "server-only";
import type { Filter } from "mongodb";
import {
  entitiesCollection,
  eventsCollection,
  personsCollection,
  placesCollection,
} from "./databases";
import { mapEventDocToApi, type EventRelations } from "./mappers";
import { PUBLISHED_STATUSES, cityLocalityFilter } from "./event-filters";
import type { EntityDoc, EventDoc, PersonDoc, PlaceDoc } from "./types";
import type { Event } from "@/lib/api";

export interface ListEventsParams {
  limit?: number;
  offset?: number;
  /** Filter by city (matches the event's embedded location.address.addressLocality). */
  city?: string;
  /** Filter by a tag/category string. */
  category?: string;
  /** Filter by hosting circle (events.events.circleId). */
  circleId?: string;
  /** Filter by curated calendar (events.events.calendarId, NYU-25). */
  calendarId?: string;
  /** Only events starting on/after this instant. Defaults to now (upcoming). */
  from?: Date;
  /** Include past events too (overrides the default upcoming-only filter). */
  includePast?: boolean;
}

export interface ListEventsResult {
  events: Event[];
  total: number;
  limit: number;
  offset: number;
}

/** Build the base Mongo filter for public event listings. */
function publishedFilter(params: ListEventsParams): Filter<EventDoc> {
  const filter: Filter<EventDoc> = { status: { $in: [...PUBLISHED_STATUSES] } };
  // Keep private events out of public listings. `$ne` also matches docs with
  // no mukoko.visibility set (treated as public).
  (filter as Record<string, unknown>)["mukoko.visibility"] = { $ne: "private" };
  if (!params.includePast) {
    filter.startDate = { $gte: params.from ?? new Date() };
  } else if (params.from) {
    filter.startDate = { $gte: params.from };
  }
  if (params.category) filter.tags = params.category;
  if (params.circleId) filter.circleId = params.circleId;
  if (params.calendarId) filter.calendarId = params.calendarId;
  if (params.city) {
    // The city lives in the embedded schema.org location. Match on either the
    // canonical nested path (location.address.addressLocality — what
    // createEvent writes) or the legacy flat one, symmetric with the /discover
    // count aggregation's coalescing city expression (see event-filters.ts).
    Object.assign(filter as Record<string, unknown>, cityLocalityFilter(params.city));
  }
  return filter;
}

/**
 * Resolve host + venue documents for a batch of events in two `$in` queries,
 * then map each event with its relations. Used by every list/detail path so
 * the fan-out is consistent and batched.
 */
async function mapEventsWithRelations(docs: EventDoc[]): Promise<Event[]> {
  if (docs.length === 0) return [];

  const entityIds = [...new Set(docs.map((d) => d.primaryHostEntityId).filter(Boolean))];
  const placeIds = [...new Set(docs.map((d) => d.placeId).filter((v): v is string => !!v))];

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

  // Resolve the human behind each host entity via founderPersonId (batched).
  const founderIds = [
    ...new Set(entities.map((e) => e.founderPersonId).filter((v): v is string => !!v)),
  ];
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
    return mapEventDocToApi(doc, relations);
  });
}

/** List public, upcoming events with an authoritative total for pagination. */
export async function listEvents(params: ListEventsParams = {}): Promise<ListEventsResult> {
  const limit = Math.min(Math.max(params.limit ?? 20, 1), 100);
  const offset = Math.max(params.offset ?? 0, 0);
  const filter = publishedFilter(params);

  const col = await eventsCollection();
  const [docs, total] = await Promise.all([
    col.find(filter).sort({ startDate: 1 }).skip(offset).limit(limit).toArray(),
    col.countDocuments(filter),
  ]);

  return { events: await mapEventsWithRelations(docs), total, limit, offset };
}

/** Trending = public upcoming events ranked by attendee count. */
export async function getTrendingEvents(limit = 10): Promise<Event[]> {
  const col = await eventsCollection();
  const docs = await col
    .find({ status: { $in: [...PUBLISHED_STATUSES] }, startDate: { $gte: new Date() } })
    .sort({ totalAttendeeCount: -1, startDate: 1 })
    .limit(Math.min(Math.max(limit, 1), 50))
    .toArray();
  return mapEventsWithRelations(docs);
}

/**
 * Fetch a single event by `_id` or `slug`, with host + venue resolved. Returns
 * null when not found. Does not enforce publish state — callers (e.g. the
 * host's own manage page) may need drafts; gate visibility at the route.
 */
export async function getEventByIdOrSlug(idOrSlug: string): Promise<Event | null> {
  const col = await eventsCollection();
  const doc = await col.findOne({
    $or: [{ _id: idOrSlug }, { slug: idOrSlug }, { "mukoko.shortCode": idOrSlug }],
  });
  if (!doc) return null;
  const [mapped] = await mapEventsWithRelations([doc]);
  return mapped ?? null;
}

/** Fetch raw event documents by ids, preserving input order (for RAG hydrate). */
export async function getEventsByIds(ids: string[]): Promise<Event[]> {
  if (ids.length === 0) return [];
  const col = await eventsCollection();
  const docs = await col.find({ _id: { $in: ids } }).toArray();
  const mapped = await mapEventsWithRelations(docs);
  const byId = new Map(mapped.map((e) => [e.id, e]));
  return ids.map((id) => byId.get(id)).filter((e): e is Event => !!e);
}
