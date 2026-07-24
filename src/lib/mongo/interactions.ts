/**
 * Saves + likes on the SHARED engagement substrate — no silos.
 *
 * nhimbe pulls into the Mukoko super app: engagement primitives live in the
 * cross-product `engagement.*` collections so every surface sees the same
 * data. A save is an `engagement.interactions` row (`interactionType:
 * "save"`); a like is an `engagement.reactions` row (`LikeAction`,
 * `targetReferenceType: "events_event"`). This replaces the former app-private
 * `events.savedEvents` collection (which held no data — zero-cost migration).
 *
 * Post-E2E plaintext shapes (both collections run `validationLevel: "off"`
 * while E2E is disabled): the actor is carried in plaintext
 * (`actorPersonId` / `reactorPersonId`) so lookups and unsave/unlike work;
 * `actorPseudoId` mirrors the person id (per-target pseudonymity is moot
 * without encryption). Idempotency comes from keyed upserts, never
 * deterministic composite ids (engagement `_id`s stay UUID strings).
 */

import "server-only";
import {
  eventsCollection,
  interactionsCollection,
  reactionsCollection,
} from "./databases";
import { newId } from "./ids";

const SURFACE = "nhimbe";

/** Resolve the target-entity (host) for an event — the validator's routing key. */
async function eventHostEntityId(eventId: string): Promise<string> {
  const events = await eventsCollection();
  const event = await events.findOne(
    { _id: eventId },
    { projection: { primaryHostEntityId: 1 } },
  );
  if (!event) throw new Error("That event could not be found.");
  return event.primaryHostEntityId;
}

// ── saves (engagement.interactions, interactionType "save") ──────────

export async function isEventSavedByPerson(
  personId: string,
  eventId: string,
): Promise<boolean> {
  const interactions = await interactionsCollection();
  const row = await interactions.findOne(
    { actorPersonId: personId, targetId: eventId, interactionType: "save" },
    { projection: { _id: 1 } },
  );
  return row !== null;
}

/** Idempotent save — keyed upsert on (actorPersonId, targetId, "save"). */
export async function saveEventForPerson(
  personId: string,
  personEntityId: string,
  eventId: string,
): Promise<void> {
  const targetEntityId = await eventHostEntityId(eventId);
  const now = new Date();
  const interactions = await interactionsCollection();
  await interactions.updateOne(
    { actorPersonId: personId, targetId: eventId, interactionType: "save" },
    {
      $setOnInsert: {
        _id: newId(),
        _schemaVersion: "v3.1",
        actorPseudoId: personId,
        actorPersonId: personId,
        actorEntityId: personEntityId,
        targetEntityId,
        targetReferenceType: "event",
        targetId: eventId,
        interactionType: "save",
        visibility: "private",
        occurredAt: now,
        surfaceContext: SURFACE,
        createdAt: now,
      },
      $set: { updatedAt: now },
    },
    { upsert: true },
  );
}

/** Idempotent unsave — deleting a non-existent save is a no-op. */
export async function unsaveEventForPerson(
  personId: string,
  eventId: string,
): Promise<void> {
  const interactions = await interactionsCollection();
  await interactions.deleteOne({
    actorPersonId: personId,
    targetId: eventId,
    interactionType: "save",
  });
}

// ── likes (engagement.reactions, LikeAction on events_event) ─────────

export interface EventLikeState {
  count: number;
  likedByMe: boolean;
}

export async function getEventLikeState(
  eventId: string,
  personId?: string | null,
): Promise<EventLikeState> {
  const reactions = await reactionsCollection();
  const filter = {
    targetId: eventId,
    targetReferenceType: "events_event",
    schemaOrgType: "LikeAction" as const,
  };
  const [count, mine] = await Promise.all([
    reactions.countDocuments(filter),
    personId
      ? reactions.findOne(
          { ...filter, reactorPersonId: personId },
          { projection: { _id: 1 } },
        )
      : Promise.resolve(null),
  ]);
  return { count, likedByMe: mine !== null };
}

/** Idempotent like — keyed upsert on (reactorPersonId, targetId, LikeAction). */
export async function likeEventForPerson(
  personId: string,
  personEntityId: string,
  eventId: string,
): Promise<void> {
  // Ensure the event exists (and keep parity with the save path's routing).
  await eventHostEntityId(eventId);
  const now = new Date();
  const reactions = await reactionsCollection();
  await reactions.updateOne(
    {
      reactorPersonId: personId,
      targetId: eventId,
      targetReferenceType: "events_event",
      schemaOrgType: "LikeAction",
    },
    {
      $setOnInsert: {
        _id: newId(),
        _schemaVersion: "v3.1",
        schemaOrgType: "LikeAction",
        targetId: eventId,
        targetReferenceType: "events_event",
        reactorPersonId: personId,
        reactorEntityId: personEntityId,
        visibility: "public",
        surfaceContext: SURFACE,
        createdAt: now,
      },
      $set: { updatedAt: now },
    },
    { upsert: true },
  );
}

/** Idempotent unlike. */
export async function unlikeEventForPerson(
  personId: string,
  eventId: string,
): Promise<void> {
  const reactions = await reactionsCollection();
  await reactions.deleteOne({
    reactorPersonId: personId,
    targetId: eventId,
    targetReferenceType: "events_event",
    schemaOrgType: "LikeAction",
  });
}
