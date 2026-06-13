"use server";

/**
 * Waitlist write server actions (Vercel server runtime → MongoDB).
 *
 * Replaces the old direct-Supabase / worker `/api/waitlist` path. A person
 * joins or leaves the waitlist for an event; both operations resolve the acting
 * identity server-side (AuthKit `withAuth()` or the local dev bypass), ensure
 * the person + their host entity exist (Rule 10: people act THROUGH entities),
 * and write a single v3.1 document.
 *
 * Storage note: the cluster has no dedicated `waitlist` collection (verified via
 * the Mongo MCP — `events` holds events/rsvps/checkIns/etc., `engagement` holds
 * reviews/referrals/etc., neither has a waitlist). We store waitlist entries in
 * `events.waitlist`, mirroring the `events.rsvps` shape (eventId +
 * attendeePersonId/attendeeEntityId) so it lives beside its sibling RSVP data
 * and is trivially join-friendly. The collection has no validator, so the v3.1
 * stamp from `stampNew()` keeps it consistent with the rest of the cluster. The
 * shared typed accessor cannot be added here (databases.ts is owned elsewhere),
 * so we use the generic `getCollection<T>` accessor with a local doc type.
 */

import { withAuth } from "@workos-inc/authkit-nextjs";
import type { Document } from "mongodb";
import { getCollection, personsCollection, DB } from "@/lib/mongo/databases";
import { stampNew } from "@/lib/mongo/ids";
import { ensureHostEntityForPerson } from "@/lib/mongo/entities";
import { syncPersonFromWorkos, type SyncPersonInput } from "@/lib/mongo/users";
import { isDevBypass, DEV_WORKOS_ID, DEV_EMAIL, DEV_NAME } from "@/lib/auth/dev";
import type { BaseDoc } from "@/lib/mongo/types";

/** Waitlist entry — sibling to `events.rsvps`, stored in `events.waitlist`. */
interface WaitlistDoc extends BaseDoc, Document {
  eventId: string;
  attendeePersonId: string;
  attendeeEntityId: string;
  status: "waiting" | "left";
  joinedAt: Date;
  leftAt?: Date | null;
}

const WAITLIST_COLLECTION = "waitlist";

/** Lazily-typed accessor for `events.waitlist` (no shared helper to import). */
function waitlistCollection() {
  return getCollection<WaitlistDoc>(DB.events, WAITLIST_COLLECTION);
}

/** Resolve the acting person's id + entity id, syncing them in on first use. */
async function resolveActor(): Promise<{ personId: string; entityId: string }> {
  let syncInput: SyncPersonInput;
  if (isDevBypass()) {
    syncInput = { workosUserId: DEV_WORKOS_ID, email: DEV_EMAIL, name: DEV_NAME, emailVerified: true };
  } else {
    const { user } = await withAuth();
    if (!user) throw new Error("You must be signed in to join the waitlist.");
    syncInput = {
      workosUserId: user.id,
      email: user.email ?? null,
      name: [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || null,
      givenName: user.firstName ?? null,
      familyName: user.lastName ?? null,
      picture: user.profilePictureUrl ?? null,
      emailVerified: user.emailVerified ?? undefined,
    };
  }

  const persons = await personsCollection();
  let person = await persons.findOne({ workosUserId: syncInput.workosUserId });
  if (!person) {
    await syncPersonFromWorkos(syncInput);
    person = await persons.findOne({ workosUserId: syncInput.workosUserId });
  }
  if (!person) throw new Error("Could not resolve your account. Please try again.");

  const entityId = await ensureHostEntityForPerson(person);
  return { personId: person._id, entityId };
}

export interface WaitlistStatusResult {
  /** True once the person holds an active `waiting` entry. */
  onWaitlist: boolean;
}

/**
 * Add the signed-in person to an event's waitlist. Idempotent: re-joining (or
 * re-activating a previously-left entry) leaves a single active `waiting` row.
 */
export async function joinWaitlist(eventId: string): Promise<WaitlistStatusResult> {
  if (!eventId) throw new Error("An event is required to join its waitlist.");
  const { personId, entityId } = await resolveActor();
  const now = new Date();

  const col = await waitlistCollection();
  const existing = await col.findOne({ eventId, attendeePersonId: personId });

  if (existing) {
    // Re-activate a left entry, or no-op if already waiting.
    if (existing.status !== "waiting") {
      await col.updateOne(
        { _id: existing._id },
        { $set: { status: "waiting", joinedAt: now, leftAt: null, updatedAt: now } },
      );
    }
    return { onWaitlist: true };
  }

  await col.insertOne({
    ...stampNew(),
    eventId,
    attendeePersonId: personId,
    attendeeEntityId: entityId,
    status: "waiting",
    joinedAt: now,
    leftAt: null,
  });
  return { onWaitlist: true };
}

/**
 * Remove the signed-in person from an event's waitlist. Idempotent: a missing
 * or already-left entry resolves to `onWaitlist: false` without error.
 */
export async function leaveWaitlist(eventId: string): Promise<WaitlistStatusResult> {
  if (!eventId) throw new Error("An event is required to leave its waitlist.");
  const { personId } = await resolveActor();
  const now = new Date();

  const col = await waitlistCollection();
  await col.updateOne(
    { eventId, attendeePersonId: personId, status: "waiting" },
    { $set: { status: "left", leftAt: now, updatedAt: now } },
  );
  return { onWaitlist: false };
}

/** Read whether the signed-in person currently holds a `waiting` entry. */
export async function getWaitlistStatus(eventId: string): Promise<WaitlistStatusResult> {
  if (!eventId) return { onWaitlist: false };
  // Don't sync/create the actor just to read status — resolve quietly.
  let workosUserId: string | null = null;
  if (isDevBypass()) {
    workosUserId = DEV_WORKOS_ID;
  } else {
    const { user } = await withAuth();
    workosUserId = user?.id ?? null;
  }
  if (!workosUserId) return { onWaitlist: false };

  const persons = await personsCollection();
  const person = await persons.findOne({ workosUserId });
  if (!person) return { onWaitlist: false };

  const col = await waitlistCollection();
  const entry = await col.findOne({
    eventId,
    attendeePersonId: person._id,
    status: "waiting",
  });
  return { onWaitlist: Boolean(entry) };
}
