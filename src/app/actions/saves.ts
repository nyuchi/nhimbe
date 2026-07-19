"use server";

/**
 * Saved-event (bookmark) + like server actions — Vercel server runtime →
 * MongoDB, on the SHARED engagement substrate (no silos).
 *
 * Saves write `engagement.interactions` (`interactionType: "save"`) and likes
 * write `engagement.reactions` (`LikeAction` on `events_event`) — the
 * cross-product collections every Mukoko surface reads — via
 * `src/lib/mongo/interactions.ts`. This replaces the app-private
 * `events.savedEvents` collection (which never held data).
 *
 * Idempotency: saves/likes are keyed upserts on the (person, event) pair;
 * unsave/unlike are plain deletes on the same key. The acting person is
 * resolved via AuthKit `withAuth()` (or the local dev bypass), and their
 * acting entity via `ensureHostEntityForPerson` (Rule 10: entity-centric).
 */

import { resolveActingPerson } from "@/lib/auth/current-person";
import { ensureHostEntityForPerson } from "@/lib/mongo/entities";
import {
  getEventLikeState,
  isEventSavedByPerson,
  likeEventForPerson,
  saveEventForPerson,
  unlikeEventForPerson,
  unsaveEventForPerson,
  type EventLikeState,
} from "@/lib/mongo/interactions";

function requireEventId(eventId: string): string {
  const id = typeof eventId === "string" ? eventId.trim() : "";
  if (!id) throw new Error("An event id is required.");
  return id;
}

// ── saves ────────────────────────────────────────────────────────────

/**
 * Is the current user's bookmark present for `eventId`? Returns false when
 * signed out (nothing to read).
 */
export async function isEventSaved(eventId: string): Promise<boolean> {
  const id = requireEventId(eventId);
  const person = await resolveActingPerson();
  if (!person) return false;
  return isEventSavedByPerson(person._id, id);
}

/**
 * Save (bookmark) an event for the current user. Idempotent — re-saving is a
 * no-op. Returns the saved state (`true`) so the caller can sync optimistic UI.
 */
export async function saveEvent(eventId: string): Promise<boolean> {
  const id = requireEventId(eventId);
  const person = await resolveActingPerson();
  if (!person) throw new Error("You must be signed in to save an event.");
  const entityId = await ensureHostEntityForPerson(person);
  await saveEventForPerson(person._id, entityId, id);
  return true;
}

/**
 * Remove the current user's bookmark for an event. Idempotent — deleting a
 * non-existent save is a no-op. Returns the saved state (`false`).
 */
export async function unsaveEvent(eventId: string): Promise<boolean> {
  const id = requireEventId(eventId);
  const person = await resolveActingPerson();
  if (!person) throw new Error("You must be signed in to manage saved events.");
  await unsaveEventForPerson(person._id, id);
  return false;
}

// ── likes ────────────────────────────────────────────────────────────

/** Like count + whether the current user (if any) has liked the event. */
export async function getEventLikes(eventId: string): Promise<EventLikeState> {
  const id = requireEventId(eventId);
  const person = await resolveActingPerson();
  return getEventLikeState(id, person?._id ?? null);
}

/** Like an event (idempotent). Returns the new state. */
export async function likeEvent(eventId: string): Promise<EventLikeState> {
  const id = requireEventId(eventId);
  const person = await resolveActingPerson();
  if (!person) throw new Error("You must be signed in to like an event.");
  const entityId = await ensureHostEntityForPerson(person);
  await likeEventForPerson(person._id, entityId, id);
  return getEventLikeState(id, person._id);
}

/** Remove the current user's like (idempotent). Returns the new state. */
export async function unlikeEvent(eventId: string): Promise<EventLikeState> {
  const id = requireEventId(eventId);
  const person = await resolveActingPerson();
  if (!person) throw new Error("You must be signed in to manage likes.");
  await unlikeEventForPerson(person._id, id);
  return getEventLikeState(id, person._id);
}
