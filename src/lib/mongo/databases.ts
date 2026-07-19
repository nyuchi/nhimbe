/**
 * Typed accessors for the Mukoko MongoDB databases nhimbe consumes.
 *
 * The Mukoko data model is spread across many databases — individuals
 * (`identity`) and the entities they act through (`entity`) live separately
 * from `events`, `engagement`, `places` and `circles`. Assembling a single
 * API object (e.g. an event with its host, venue and circle) means fanning out
 * across several of these. Each accessor below returns a strongly-typed
 * `Collection<T>` so call sites get autocomplete and the mappers stay honest.
 */

import "server-only";
import type { Collection, Db, Document } from "mongodb";
import { getMongoClient } from "./client";
import type {
  AttendanceHistoryDoc,
  CalendarDoc,
  CalendarFollowDoc,
  CampfireConversationDoc,
  CampfireMessageDoc,
  CheckInDoc,
  CircleDoc,
  CircleMembershipDoc,
  CirclePostDoc,
  EntityDoc,
  EntityMembershipDoc,
  EventDoc,
  EventEmbeddingDoc,
  EventUpdateDoc,
  EngagementInteractionDoc,
  EngagementReactionDoc,
  LinkClickDoc,
  PairingDoc,
  PersonDoc,
  PlaceCategoryDoc,
  PlaceDoc,
  PlacesGeoDoc,
  PlannerReservationDoc,
  PollDoc,
  ProgrammeItemDoc,
  RatingDoc,
  ReferralDoc,
  ReviewDoc,
  RsvpDoc,
  TrackedLinkDoc,
} from "./types";

/** Canonical database names on the cluster. */
export const DB = {
  events: "events",
  identity: "identity",
  entity: "entity",
  engagement: "engagement",
  places: "places",
  circles: "circles",
  campfire: "campfire",
  planner: "planner",
  device: "device",
  wallet: "wallet",
  system: "system",
} as const;

export type DatabaseName = (typeof DB)[keyof typeof DB];

/** Resolve a database handle from the shared client. */
export async function getDb(name: DatabaseName): Promise<Db> {
  const client = await getMongoClient();
  return client.db(name);
}

/** Generic typed collection accessor. Prefer the named helpers below. */
export async function getCollection<T extends Document>(
  database: DatabaseName,
  collection: string,
): Promise<Collection<T>> {
  const db = await getDb(database);
  return db.collection<T>(collection);
}

// ── events ──────────────────────────────────────────────────────────
export const eventsCollection = () => getCollection<EventDoc>(DB.events, "events");
export const rsvpsCollection = () => getCollection<RsvpDoc>(DB.events, "rsvps");
export const checkInsCollection = () => getCollection<CheckInDoc>(DB.events, "checkIns");
export const attendanceHistoryCollection = () =>
  getCollection<AttendanceHistoryDoc>(DB.events, "attendanceHistory");
export const programmeItemsCollection = () =>
  getCollection<ProgrammeItemDoc>(DB.events, "programmeItems");
export const pollsCollection = () => getCollection<PollDoc>(DB.events, "polls");
export const eventUpdatesCollection = () => getCollection<EventUpdateDoc>(DB.events, "updates");
/** Per-event RAG embeddings (Atlas Vector Search source collection). */
export const eventEmbeddingsCollection = () =>
  getCollection<EventEmbeddingDoc>(DB.events, "eventEmbeddings");
/** Followable curated event streams (NYU-25). */
export const calendarsCollection = () => getCollection<CalendarDoc>(DB.events, "calendars");
export const calendarFollowsCollection = () =>
  getCollection<CalendarFollowDoc>(DB.events, "calendarFollows");

// ── identity ────────────────────────────────────────────────────────
export const personsCollection = () => getCollection<PersonDoc>(DB.identity, "persons");

// ── entity ──────────────────────────────────────────────────────────
export const entitiesCollection = () => getCollection<EntityDoc>(DB.entity, "entities");
export const entityMembershipsCollection = () =>
  getCollection<EntityMembershipDoc>(DB.entity, "memberships");

// ── places ──────────────────────────────────────────────────────────
export const placesCollection = () => getCollection<PlaceDoc>(DB.places, "places");
export const placesGeoCollection = () => getCollection<PlacesGeoDoc>(DB.places, "placesGeo");
export const placeCategoriesCollection = () =>
  getCollection<PlaceCategoryDoc>(DB.places, "categories");

// ── circles ─────────────────────────────────────────────────────────
export const circlesCollection = () => getCollection<CircleDoc>(DB.circles, "circles");
export const circleMembershipsCollection = () =>
  getCollection<CircleMembershipDoc>(DB.circles, "memberships");
export const circlePostsCollection = () => getCollection<CirclePostDoc>(DB.circles, "posts");

// ── engagement ──────────────────────────────────────────────────────
export const reviewsCollection = () => getCollection<ReviewDoc>(DB.engagement, "reviews");
export const ratingsCollection = () => getCollection<RatingDoc>(DB.engagement, "ratings");
export const referralsCollection = () => getCollection<ReferralDoc>(DB.engagement, "referrals");
export const trackedLinksCollection = () =>
  getCollection<TrackedLinkDoc>(DB.engagement, "trackedLinks");
export const linkClicksCollection = () => getCollection<LinkClickDoc>(DB.engagement, "linkClicks");
export const interactionsCollection = () =>
  getCollection<EngagementInteractionDoc>(DB.engagement, "interactions");
export const reactionsCollection = () =>
  getCollection<EngagementReactionDoc>(DB.engagement, "reactions");

// ── campfire ────────────────────────────────────────────────────────
export const campfireConversationsCollection = () =>
  getCollection<CampfireConversationDoc>(DB.campfire, "conversations");
export const campfireMessagesCollection = () =>
  getCollection<CampfireMessageDoc>(DB.campfire, "messages");

// ── planner ─────────────────────────────────────────────────────────
export const plannerReservationsCollection = () =>
  getCollection<PlannerReservationDoc>(DB.planner, "reservations");

// ── device ──────────────────────────────────────────────────────────
export const pairingsCollection = () => getCollection<PairingDoc>(DB.device, "pairings");
